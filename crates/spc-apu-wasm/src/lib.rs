extern crate alloc;
use alloc::vec::Vec;

use std::alloc::{alloc, dealloc, Layout};
use std::io::Cursor;
use std::ptr::addr_of_mut;

use snes_apu_spcp::Apu;
use spc_spcp::spc::Spc;

/// Maximum render size in frames. 4096 frames * 2 channels * 4 bytes = 32 KB.
const MAX_RENDER_FRAMES: usize = 4096;
const OUTPUT_BUF_LEN: usize = MAX_RENDER_FRAMES * 2;

static mut APU: Option<Box<Apu>> = None;
static mut SPC_DATA: Option<Vec<u8>> = None;
static mut OUTPUT_BUF: [f32; OUTPUT_BUF_LEN] = [0.0; OUTPUT_BUF_LEN];

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
