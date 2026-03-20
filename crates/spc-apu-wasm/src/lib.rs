extern crate alloc;
use alloc::vec::Vec;

use std::alloc::{alloc, dealloc, Layout};
use std::io::Cursor;
use std::ptr::addr_of_mut;

use snes_apu_spcp::Apu;
use snes_apu_spcp::ResamplingMode;
use spc_spcp::spc::{Spc, RAM_LEN};

/// Maximum render size in frames. 4096 frames * 2 channels * 4 bytes = 32 KB.
const MAX_RENDER_FRAMES: usize = 4096;
const OUTPUT_BUF_LEN: usize = MAX_RENDER_FRAMES * 2;

static mut APU: Option<Box<Apu>> = None;
static mut SPC_DATA: Option<Vec<u8>> = None;
static mut OUTPUT_BUF: [f32; OUTPUT_BUF_LEN] = [0.0; OUTPUT_BUF_LEN];

// ---------------------------------------------------------------------------
// Sinc resampler state (Lanczos-3)
// ---------------------------------------------------------------------------

/// Number of taps in the Lanczos-3 kernel (3 lobes × 2 sides).
const SINC_TAPS: usize = 6;
/// Number of polyphase sub-positions for fractional delay.
const SINC_PHASES: usize = 256;
/// Maximum output frames per resample call (stereo).
const MAX_RESAMPLE_OUTPUT_FRAMES: usize = 256;

/// Pre-computed Lanczos-3 polyphase FIR table: [phase][tap].
/// Phase p corresponds to fractional delay p/256.
static LANCZOS3_TABLE: [[f32; SINC_TAPS]; SINC_PHASES] = {
    const fn sinc_approx(x: f64) -> f64 {
        if x > -1e-12 && x < 1e-12 {
            return 1.0;
        }
        let pi_x = x * std::f64::consts::PI;
        let sin_pi_x = sin_approx(pi_x);
        sin_pi_x / pi_x
    }

    /// Taylor series sin approximation — sufficient precision for the table.
    const fn sin_approx(x: f64) -> f64 {
        let x2 = x * x;
        let x3 = x2 * x;
        let x5 = x3 * x2;
        let x7 = x5 * x2;
        let x9 = x7 * x2;
        let x11 = x9 * x2;
        let x13 = x11 * x2;
        x - x3 / 6.0 + x5 / 120.0 - x7 / 5040.0 + x9 / 362880.0
            - x11 / 39916800.0 + x13 / 6227020800.0
    }

    const fn lanczos3(x: f64) -> f64 {
        let a = 3.0; // Lanczos parameter
        if x < -a || x > a {
            return 0.0;
        }
        sinc_approx(x) * sinc_approx(x / a)
    }

    const fn build_table() -> [[f32; SINC_TAPS]; SINC_PHASES] {
        let mut table = [[0.0f32; SINC_TAPS]; SINC_PHASES];
        let half_taps = (SINC_TAPS / 2) as i32; // 3
        let mut phase = 0usize;
        while phase < SINC_PHASES {
            let frac = phase as f64 / SINC_PHASES as f64;
            let mut sum = 0.0f64;
            let mut tap = 0usize;
            while tap < SINC_TAPS {
                let x = (tap as i32 - half_taps) as f64 + (1.0 - frac);
                let w = lanczos3(x);
                table[phase][tap] = w as f32;
                sum += w;
                tap += 1;
            }
            // Normalize to unity gain
            if sum > 1e-12 || sum < -1e-12 {
                let inv = 1.0 / sum as f64;
                let mut t = 0usize;
                while t < SINC_TAPS {
                    table[phase][t] = (table[phase][t] as f64 * inv) as f32;
                    t += 1;
                }
            }
            phase += 1;
        }
        table
    }

    build_table()
};

/// Per-channel ring buffer history for the sinc resampler.
struct SincResamplerState {
    history_left: [f32; SINC_TAPS],
    history_right: [f32; SINC_TAPS],
    /// Write position in ring buffer (0..SINC_TAPS-1).
    history_pos: usize,
    /// Fractional accumulator in 8.24 fixed-point (256 phases).
    frac: u32,
}

static mut SINC_STATE: SincResamplerState = SincResamplerState {
    history_left: [0.0; SINC_TAPS],
    history_right: [0.0; SINC_TAPS],
    history_pos: 0,
    frac: 0,
};

/// Scratch buffer for sinc resampler output.
static mut RESAMPLE_OUTPUT_BUF: [f32; MAX_RESAMPLE_OUTPUT_FRAMES * 2] =
    [0.0; MAX_RESAMPLE_OUTPUT_FRAMES * 2];

// ---------------------------------------------------------------------------
// Snapshot constants
// ---------------------------------------------------------------------------

/// Snapshot layout (all values little-endian):
///   [0..4)         magic: 0x53504353 ("SPCS")
///   [4..8)         version: 1
///   [8..12)        total size
///   [12..16)       SPC700 register block offset
///   [16..65552)    RAM (64 KB)
///   [65552..65680) DSP registers (128 bytes)
///   [65680..65688) SPC700 registers: PC(u16) + A + X + Y + SP + PSW + pad
const SNAPSHOT_MAGIC: u32 = 0x5350_4353; // "SPCS"
const SNAPSHOT_VERSION: u32 = 1;
const SNAPSHOT_HEADER_SIZE: usize = 16;
const SNAPSHOT_RAM_SIZE: usize = RAM_LEN; // 65536
const SNAPSHOT_DSP_REGS_SIZE: usize = 128;
const SNAPSHOT_SPC700_REGS_SIZE: usize = 8; // PC(2) + A + X + Y + SP + PSW + pad
const SNAPSHOT_TOTAL_SIZE: usize =
    SNAPSHOT_HEADER_SIZE + SNAPSHOT_RAM_SIZE + SNAPSHOT_DSP_REGS_SIZE + SNAPSHOT_SPC700_REGS_SIZE;

// Scratch buffers for the separate L/R i16 samples the library produces.
static mut LEFT_BUF: [i16; MAX_RENDER_FRAMES] = [0; MAX_RENDER_FRAMES];
static mut RIGHT_BUF: [i16; MAX_RENDER_FRAMES] = [0; MAX_RENDER_FRAMES];

/// Obtain a mutable reference to the global APU, if initialised.
///
/// # Safety
/// WASM is single-threaded — no concurrent access is possible.
#[inline]
unsafe fn get_apu() -> Option<&'static mut Box<Apu>> {
    (*addr_of_mut!(APU)).as_mut()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/// Initialise the APU from raw SPC file bytes already written into WASM memory.
///
/// Returns 0 on success, -1 on SPC parse error, -2 on init error.
#[no_mangle]
pub extern "C" fn dsp_init(spc_data_ptr: *const u8, spc_data_len: u32) -> i32 {
    let result = std::panic::catch_unwind(|| {
        let data =
            unsafe { std::slice::from_raw_parts(spc_data_ptr, spc_data_len as usize) };
        unsafe {
            *addr_of_mut!(SPC_DATA) = Some(data.to_vec());
        }
        let cursor = Cursor::new(data);
        let spc = match Spc::from_reader(cursor) {
            Ok(s) => s,
            Err(_) => return -1_i32,
        };
        let apu = Apu::from_spc(&spc);
        unsafe {
            *addr_of_mut!(APU) = Some(apu);
        }
        0_i32
    });
    match result {
        Ok(code) => code,
        Err(_) => -2,
    }
}

/// Reinitialise the APU from the original SPC data stored during `dsp_init`.
///
/// Returns 0 on success, -1 on failure (no SPC data stored or parse error).
#[no_mangle]
pub extern "C" fn dsp_reset() -> i32 {
    let result = std::panic::catch_unwind(|| unsafe {
        let data = match (*addr_of_mut!(SPC_DATA)).as_ref() {
            Some(d) => d,
            None => return -1_i32,
        };
        let cursor = Cursor::new(data.as_slice());
        let spc = match Spc::from_reader(cursor) {
            Ok(s) => s,
            Err(_) => return -1_i32,
        };
        let apu = Apu::from_spc(&spc);
        *addr_of_mut!(APU) = Some(apu);
        0_i32
    });
    match result {
        Ok(code) => code,
        Err(_) => -1,
    }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/// Render `num_frames` stereo frames into the pre-allocated output buffer.
///
/// The output buffer is interleaved f32 (L, R, L, R …).
/// Returns 0 on success, -1 if the APU is not initialised, -3 if num_frames
/// exceeds the pre-allocated buffer capacity.
#[no_mangle]
pub extern "C" fn dsp_render(output_ptr: *mut f32, num_frames: u32) -> i32 {
    let frames = num_frames as usize;
    if frames > MAX_RENDER_FRAMES {
        return -3;
    }

    unsafe {
        let apu = match get_apu() {
            Some(a) => a,
            None => return -1,
        };

        let left = &mut (&mut (*addr_of_mut!(LEFT_BUF)))[..frames];
        let right = &mut (&mut (*addr_of_mut!(RIGHT_BUF)))[..frames];
        apu.render(left, right, frames);

        let out = if output_ptr.is_null() {
            (*addr_of_mut!(OUTPUT_BUF)).as_mut_ptr()
        } else {
            output_ptr
        };

        for i in 0..frames {
            *out.add(i * 2) = left[i] as f32 / 32768.0;
            *out.add(i * 2 + 1) = right[i] as f32 / 32768.0;
        }
    }

    0
}

/// Return a pointer to the pre-allocated interleaved f32 output buffer.
#[no_mangle]
pub extern "C" fn dsp_get_output_ptr() -> *mut f32 {
    unsafe { (*addr_of_mut!(OUTPUT_BUF)).as_mut_ptr() }
}

// ---------------------------------------------------------------------------
// Voice control
// ---------------------------------------------------------------------------

/// Set the voice enable mask. Each bit 0-7 corresponds to a voice;
/// bit set = enabled, bit clear = muted. 0xFF = all enabled (default).
#[no_mangle]
pub extern "C" fn dsp_set_voice_mask(mask: u8) {
    unsafe {
        if let Some(apu) = get_apu() {
            if let Some(dsp) = apu.dsp.as_mut() {
                for i in 0..8_usize {
                    dsp.voices[i].is_muted = (mask & (1 << i)) == 0;
                }
            }
        }
    }
}

/// Write voice state as 6 × u32 (24 bytes, little-endian) at `state_ptr`.
///
/// Layout (Uint32Array from JS perspective):
///   [0] envelopePhase  — 0=attack, 1=decay, 2=sustain, 3=release, 4=silent
///   [1] envelopeLevel  — 0–2047
///   [2] pitch          — 14-bit pitch register value
///   [3] sampleSource   — BRR source index
///   [4] keyOn          — 0 or 1
///   [5] active         — 0 or 1 (non-zero envelope level)
///
/// Returns 24 (bytes written) on success, or -1 if invalid.
#[no_mangle]
pub extern "C" fn dsp_get_voice_state(voice_index: u32, state_ptr: *mut u8) -> i32 {
    const STATE_SIZE: usize = 6 * 4; // 6 × u32 = 24 bytes

    if voice_index >= 8 || state_ptr.is_null() {
        return -1;
    }

    unsafe {
        let apu = match get_apu() {
            Some(a) => a,
            None => return -1,
        };
        let dsp = match apu.dsp.as_mut() {
            Some(d) => d,
            None => return -1,
        };
        let voice = &dsp.voices[voice_index as usize];

        let out = std::slice::from_raw_parts_mut(state_ptr as *mut u32, 6);

        let level = voice.envelope.level;

        // envelopePhase: map from DSP envelope mode; use 4 (silent) when level is 0
        // and the envelope is in release.
        let phase = voice.envelope.phase(); // 0=A, 1=D, 2=S, 3=R
        out[0] = if phase == 3 && level == 0 { 4 } else { phase };

        // envelopeLevel: clamp to 0–2047 range
        out[1] = level.clamp(0, 2047) as u32;

        // pitch: 14-bit pitch register
        out[2] = voice.pitch() as u32;

        // sampleSource: BRR source index
        out[3] = voice.source as u32;

        // keyOn: whether the voice has a pending/active key-on
        out[4] = voice.kon as u32;

        // active: producing audible output (non-zero envelope)
        out[5] = (level > 0) as u32;

        STATE_SIZE as i32
    }
}

// ---------------------------------------------------------------------------
// DSP register access
// ---------------------------------------------------------------------------

/// Read a DSP register (0x00-0x7F).
#[no_mangle]
pub extern "C" fn dsp_get_register(addr: u8) -> u8 {
    unsafe {
        match get_apu() {
            Some(apu) => {
                // Set the DSP register address, then read the data port
                apu.write_u8(0xF2_u32, addr & 0x7F);
                apu.read_u8(0xF3_u32)
            }
            None => 0,
        }
    }
}

/// Write a DSP register (0x00-0x7F).
#[no_mangle]
pub extern "C" fn dsp_set_register(addr: u8, value: u8) {
    unsafe {
        if let Some(apu) = get_apu() {
            apu.write_u8(0xF2_u32, addr & 0x7F);
            apu.write_u8(0xF3_u32, value);
        }
    }
}

// ---------------------------------------------------------------------------
// Echo buffer telemetry
// ---------------------------------------------------------------------------

/// Return a pointer to the echo buffer region within APU RAM.
///
/// The echo buffer starts at ESA×256 in the 64 KB APU RAM. The returned
/// pointer points directly into WASM linear memory, so JS can create a
/// typed-array view over it for zero-copy reads.
///
/// Returns null if the APU is not initialised.
///
/// SAFETY: The returned pointer is valid only until the next WASM memory
/// growth. Callers must create typed array views and copy data immediately
/// after calling this function, before any other WASM calls that might
/// allocate memory.
#[no_mangle]
pub extern "C" fn dsp_get_echo_buffer_ptr() -> *const u8 {
    unsafe {
        let apu = match get_apu() {
            Some(a) => a,
            None => return std::ptr::null(),
        };
        let dsp = match apu.dsp.as_ref() {
            Some(d) => d,
            None => return std::ptr::null(),
        };
        let start = dsp.get_echo_start_address() as usize;
        apu.ram.as_ptr().add(start)
    }
}

/// Return the length of the echo buffer in bytes.
///
/// The echo buffer length is EDL × 2048, where EDL is the 4-bit echo delay
/// register (0x7D). Returns 0 if the APU is not initialised or EDL is 0.
#[no_mangle]
pub extern "C" fn dsp_get_echo_buffer_length() -> u32 {
    unsafe {
        let apu = match get_apu() {
            Some(a) => a,
            None => return 0,
        };
        let dsp = match apu.dsp.as_mut() {
            Some(d) => d,
            None => return 0,
        };
        // EDL is at DSP register 0x7D (4-bit, 0-15)
        let edl = dsp.get_register(0x7D) & 0x0F;
        (edl as u32) * 0x800
    }
}

/// Write the 8 FIR filter coefficients to `out_ptr`.
///
/// FIR coefficients are at DSP registers 0x0F, 0x1F, … 0x7F (signed 8-bit).
/// The 8 bytes are written in tap order (coefficient 0 first).
///
/// Returns 8 on success, -1 if the APU is not initialised or `out_ptr` is null.
#[no_mangle]
pub extern "C" fn dsp_get_fir_coefficients(out_ptr: *mut u8) -> i32 {
    if out_ptr.is_null() {
        return -1;
    }
    unsafe {
        let apu = match get_apu() {
            Some(a) => a,
            None => return -1,
        };
        let dsp = match apu.dsp.as_mut() {
            Some(d) => d,
            None => return -1,
        };
        let out = std::slice::from_raw_parts_mut(out_ptr, 8);
        for i in 0..8_usize {
            // FIR coefficients are at DSP registers 0x0F, 0x1F, … 0x7F
            out[i] = dsp.get_register((i as u8) << 4 | 0x0F);
        }
        8
    }
}

// ---------------------------------------------------------------------------
// Instrument note-on / note-off
// ---------------------------------------------------------------------------

/// Trigger key-on for a specific voice with the given 14-bit pitch value.
///
/// Sets the voice pitch registers (0xX2 low, 0xX3 high) and writes
/// the key-on bitmask to KON (0x4C). Voice index must be 0-7.
///
/// Returns 0 on success, -1 if voice index is invalid or APU uninitialised.
///
/// NOTE: This writes via the APU port interface (0xF2/0xF3). If the SPC700
/// program is actively writing KON or pitch registers, those writes may
/// overwrite ours before the DSP latches them. This is an inherent limitation
/// of injecting note events into a running SPC program.
#[no_mangle]
pub extern "C" fn dsp_voice_note_on(voice: u8, pitch: u16) -> i32 {
    if voice >= 8 {
        return -1;
    }
    unsafe {
        let apu = match get_apu() {
            Some(a) => a,
            None => return -1,
        };
        let base = voice << 4;

        // Write pitch low byte — register (voice << 4) | 0x02
        apu.write_u8(0xF2_u32, base | 0x02);
        apu.write_u8(0xF3_u32, (pitch & 0xFF) as u8);

        // Write pitch high byte — register (voice << 4) | 0x03
        apu.write_u8(0xF2_u32, base | 0x03);
        apu.write_u8(0xF3_u32, ((pitch >> 8) & 0x3F) as u8);

        // Write key-on bitmask — KON register 0x4C
        apu.write_u8(0xF2_u32, 0x4C);
        apu.write_u8(0xF3_u32, 1 << voice);

        0
    }
}

/// Trigger key-off for a specific voice.
///
/// Writes the key-off bitmask to KOFF (0x5C). Voice index must be 0-7.
///
/// Returns 0 on success, -1 if voice index is invalid or APU uninitialised.
#[no_mangle]
pub extern "C" fn dsp_voice_note_off(voice: u8) -> i32 {
    if voice >= 8 {
        return -1;
    }
    unsafe {
        let apu = match get_apu() {
            Some(a) => a,
            None => return -1,
        };
        // Write key-off bitmask — KOFF register 0x5C
        apu.write_u8(0xF2_u32, 0x5C);
        apu.write_u8(0xF3_u32, 1 << voice);

        0
    }
}

// ---------------------------------------------------------------------------
// Memory management
// ---------------------------------------------------------------------------

/// Allocate `size` bytes from the WASM linear-memory heap. Returns a pointer
/// to the allocated region, or null on failure.
#[no_mangle]
pub extern "C" fn wasm_alloc(size: u32) -> *mut u8 {
    if size == 0 {
        return std::ptr::null_mut();
    }
    let layout = match Layout::from_size_align(size as usize, 8) {
        Ok(l) => l,
        Err(_) => return std::ptr::null_mut(),
    };
    unsafe { alloc(layout) }
}

/// Deallocate a region previously allocated by `wasm_alloc`.
#[no_mangle]
pub extern "C" fn wasm_dealloc(ptr: *mut u8, size: u32) {
    if ptr.is_null() || size == 0 {
        return;
    }
    let layout = match Layout::from_size_align(size as usize, 8) {
        Ok(l) => l,
        Err(_) => return,
    };
    unsafe { dealloc(ptr, layout) }
}

// ---------------------------------------------------------------------------
// S-DSP interpolation mode (ADR-0014)
// ---------------------------------------------------------------------------

/// Set the S-DSP source sample interpolation mode.
///
/// Mode values (matching ADR-0014):
///   0 = Gaussian (hardware-authentic, maps to ResamplingMode::Accurate)
///   1 = Linear
///   2 = Cubic
///   3 = Sinc
///
/// Invalid values are silently ignored (no-op).
#[no_mangle]
pub extern "C" fn dsp_set_interpolation_mode(mode: u32) {
    let resampling_mode = match mode {
        0 => ResamplingMode::Accurate,
        1 => ResamplingMode::Linear,
        2 => ResamplingMode::Cubic,
        3 => ResamplingMode::Sinc,
        _ => return,
    };

    unsafe {
        if let Some(apu) = get_apu() {
            apu.set_resampling_mode(resampling_mode);
        }
    }
}

/// Get the current S-DSP interpolation mode as a u32 matching ADR-0014.
/// Returns 0 (Gaussian) if the APU is not initialized.
#[no_mangle]
pub extern "C" fn dsp_get_interpolation_mode() -> u32 {
    unsafe {
        match get_apu() {
            Some(apu) => match apu.resampling_mode() {
                ResamplingMode::Accurate | ResamplingMode::Gaussian => 0,
                ResamplingMode::Linear => 1,
                ResamplingMode::Cubic => 2,
                ResamplingMode::Sinc => 3,
            },
            None => 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Output sinc resampler (Lanczos-3) — ADR-0014
// ---------------------------------------------------------------------------

/// Resample interleaved stereo f32 from input rate to output rate using
/// Lanczos-3 sinc interpolation.
///
/// - `input_ptr`:  pointer to interleaved stereo input (f32, L R L R …)
/// - `input_len`:  number of stereo *frames* in input
/// - `output_ptr`: pointer to output buffer (f32, L R L R …)
/// - `output_len`: number of stereo *frames* to produce
/// - `ratio_num`:  input sample rate (numerator of ratio)
/// - `ratio_den`:  output sample rate (denominator of ratio)
///
/// Returns the number of input frames consumed, or -1 on error.
/// Maintains internal state (fractional position + history ring buffer)
/// across calls for gapless streaming.
#[no_mangle]
pub extern "C" fn dsp_resample_sinc(
    input_ptr: *const f32,
    input_len: u32,
    output_ptr: *mut f32,
    output_len: u32,
    ratio_num: u32,
    ratio_den: u32,
) -> i32 {
    if input_ptr.is_null() || output_ptr.is_null() || ratio_den == 0 {
        return -1;
    }

    let in_frames = input_len as usize;
    let out_frames = output_len as usize;

    unsafe {
        let input = std::slice::from_raw_parts(input_ptr, in_frames * 2);
        let output = std::slice::from_raw_parts_mut(output_ptr, out_frames * 2);
        let state = &mut *addr_of_mut!(SINC_STATE);

        // Step size in fixed-point: ratio_num/ratio_den * 256
        // (how many input samples to advance per output sample, scaled by 256 phases)
        let step = ((ratio_num as u64 * SINC_PHASES as u64) / ratio_den as u64) as u32;

        let mut in_pos: usize = 0;
        let mut out_pos: usize = 0;

        while out_pos < out_frames {
            let phase = (state.frac >> 0) & 0xFF;
            let int_part = (state.frac >> 8) as usize;

            // Feed input samples into history up to the needed position
            while in_pos <= int_part && in_pos < in_frames {
                state.history_left[state.history_pos] = input[in_pos * 2];
                state.history_right[state.history_pos] = input[in_pos * 2 + 1];
                state.history_pos = (state.history_pos + 1) % SINC_TAPS;
                in_pos += 1;
            }

            // If we don't have enough input, stop
            if in_pos < in_frames || int_part < in_pos {
                // Perform convolution from history ring buffer
                let coeffs = &LANCZOS3_TABLE[phase as usize];
                let mut sum_l: f32 = 0.0;
                let mut sum_r: f32 = 0.0;

                for tap in 0..SINC_TAPS {
                    let idx = (state.history_pos + tap) % SINC_TAPS;
                    sum_l += state.history_left[idx] * coeffs[tap];
                    sum_r += state.history_right[idx] * coeffs[tap];
                }

                output[out_pos * 2] = sum_l;
                output[out_pos * 2 + 1] = sum_r;
                out_pos += 1;

                state.frac += step;
            } else {
                break;
            }
        }

        // Subtract consumed input from fractional accumulator
        let consumed = in_pos;
        if consumed > 0 {
            state.frac = state.frac.saturating_sub((consumed as u32) << 8);
        }

        consumed as i32
    }
}

/// Reset the sinc resampler's internal state (history buffer + fractional position).
/// Call when switching tracks, seeking, or changing resampler mode.
#[no_mangle]
pub extern "C" fn dsp_resample_sinc_reset() {
    unsafe {
        let state = &mut *addr_of_mut!(SINC_STATE);
        state.history_left = [0.0; SINC_TAPS];
        state.history_right = [0.0; SINC_TAPS];
        state.history_pos = 0;
        state.frac = 0;
    }
}

/// Return a pointer to the pre-allocated sinc resampler output buffer.
#[no_mangle]
pub extern "C" fn dsp_get_resample_output_ptr() -> *mut f32 {
    unsafe { (*addr_of_mut!(RESAMPLE_OUTPUT_BUF)).as_mut_ptr() }
}

// ---------------------------------------------------------------------------
// Snapshot / Restore
// ---------------------------------------------------------------------------

/// Return the size in bytes needed for a full emulation state snapshot.
#[no_mangle]
pub extern "C" fn dsp_snapshot_size() -> u32 {
    SNAPSHOT_TOTAL_SIZE as u32
}

/// Serialize the current APU state into the buffer at `out_ptr`.
/// The buffer must be at least `dsp_snapshot_size()` bytes.
/// Returns the number of bytes written, or 0 on failure.
#[no_mangle]
pub extern "C" fn dsp_snapshot(out_ptr: *mut u8) -> u32 {
    if out_ptr.is_null() {
        return 0;
    }

    unsafe {
        let apu = match get_apu() {
            Some(a) => a,
            None => return 0,
        };

        let buf = std::slice::from_raw_parts_mut(out_ptr, SNAPSHOT_TOTAL_SIZE);

        // Header
        buf[0..4].copy_from_slice(&SNAPSHOT_MAGIC.to_le_bytes());
        buf[4..8].copy_from_slice(&SNAPSHOT_VERSION.to_le_bytes());
        buf[8..12].copy_from_slice(&(SNAPSHOT_TOTAL_SIZE as u32).to_le_bytes());
        let spc700_offset = (SNAPSHOT_HEADER_SIZE + SNAPSHOT_RAM_SIZE + SNAPSHOT_DSP_REGS_SIZE) as u32;
        buf[12..16].copy_from_slice(&spc700_offset.to_le_bytes());

        // RAM (64 KB)
        let ram_start = SNAPSHOT_HEADER_SIZE;
        buf[ram_start..ram_start + SNAPSHOT_RAM_SIZE].copy_from_slice(&apu.ram[..]);

        // DSP registers (128 bytes) — read each via the port interface
        let dsp_start = ram_start + SNAPSHOT_RAM_SIZE;
        for i in 0u8..128 {
            apu.write_u8(0xF2_u32, i);
            buf[dsp_start + i as usize] = apu.read_u8(0xF3_u32);
        }

        // SPC700 registers
        let spc_start = dsp_start + SNAPSHOT_DSP_REGS_SIZE;
        let smp = apu.smp.as_ref().unwrap();
        let pc_bytes = smp.reg_pc.to_le_bytes();
        buf[spc_start] = pc_bytes[0];
        buf[spc_start + 1] = pc_bytes[1];
        buf[spc_start + 2] = smp.reg_a;
        buf[spc_start + 3] = smp.reg_x;
        buf[spc_start + 4] = smp.reg_y;
        buf[spc_start + 5] = smp.reg_sp;
        buf[spc_start + 6] = smp.get_psw();
        buf[spc_start + 7] = 0; // padding

        SNAPSHOT_TOTAL_SIZE as u32
    }
}

/// Restore APU state from a previously captured snapshot.
/// Returns 0 on success, -1 on invalid data.
#[no_mangle]
pub extern "C" fn dsp_restore(in_ptr: *const u8, len: u32) -> u32 {
    if in_ptr.is_null() || (len as usize) < SNAPSHOT_TOTAL_SIZE {
        return u32::MAX; // -1 as unsigned
    }

    unsafe {
        let buf = std::slice::from_raw_parts(in_ptr, len as usize);

        // Validate magic and version
        let magic = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]);
        let version = u32::from_le_bytes([buf[4], buf[5], buf[6], buf[7]]);
        if magic != SNAPSHOT_MAGIC || version != SNAPSHOT_VERSION {
            return u32::MAX;
        }

        let apu = match get_apu() {
            Some(a) => a,
            None => return u32::MAX,
        };

        // Restore RAM
        let ram_start = SNAPSHOT_HEADER_SIZE;
        apu.ram[..].copy_from_slice(&buf[ram_start..ram_start + SNAPSHOT_RAM_SIZE]);

        // Restore DSP registers
        let dsp_start = ram_start + SNAPSHOT_RAM_SIZE;
        for i in 0u8..128 {
            apu.write_u8(0xF2_u32, i);
            apu.write_u8(0xF3_u32, buf[dsp_start + i as usize]);
        }

        // Restore SPC700 registers
        let spc_start = dsp_start + SNAPSHOT_DSP_REGS_SIZE;
        let smp = apu.smp.as_mut().unwrap();
        smp.reg_pc = u16::from_le_bytes([buf[spc_start], buf[spc_start + 1]]);
        smp.reg_a = buf[spc_start + 2];
        smp.reg_x = buf[spc_start + 3];
        smp.reg_y = buf[spc_start + 4];
        smp.reg_sp = buf[spc_start + 5];
        smp.set_psw(buf[spc_start + 6]);

        0
    }
}
