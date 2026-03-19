use std::alloc::{alloc, dealloc, Layout};
use std::io::Cursor;
use std::ptr::addr_of_mut;

use snes_apu_spcp::Apu;
use spc_spcp::spc::Spc;

/// Maximum render size in frames. 4096 frames * 2 channels * 4 bytes = 32 KB.
const MAX_RENDER_FRAMES: usize = 4096;
const OUTPUT_BUF_LEN: usize = MAX_RENDER_FRAMES * 2;

static mut APU: Option<Box<Apu>> = None;
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

/// Reset / tear down the current APU instance.
#[no_mangle]
pub extern "C" fn dsp_reset() {
    unsafe {
        *addr_of_mut!(APU) = None;
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

/// Set the voice mute mask. Each bit 0-7 corresponds to a voice; bit set = muted.
#[no_mangle]
pub extern "C" fn dsp_set_voice_mask(mask: u8) {
    unsafe {
        if let Some(apu) = get_apu() {
            if let Some(dsp) = apu.dsp.as_mut() {
                for i in 0..8_usize {
                    dsp.voices[i].is_muted = (mask & (1 << i)) != 0;
                }
            }
        }
    }
}

/// Write voice state data at `state_ptr` for the given `voice_index` (0-7).
///
/// Layout (packed, little-endian):
///   offset 0 : u8  source
///   offset 1 : u8  muted (0/1)
///   offset 2 : i32 envelope_level   (4 bytes)
///   offset 6 : i8  volume_left
///   offset 7 : i8  volume_right
///   offset 8 : i32 amplitude_left   (4 bytes)
///   offset 12: i32 amplitude_right  (4 bytes)
///   offset 16: u16 pitch            (2 bytes)
///   offset 18: u8  has_noise_clock  (0/1)
///   offset 19: u8  noise_clock      (valid only if has_noise_clock=1)
///   offset 20: u8  echo_on          (0/1)
///   offset 21: u8  pitch_modulation (0/1)
///   Total: 22 bytes
///
/// Returns the number of bytes written, or -1 if invalid.
#[no_mangle]
pub extern "C" fn dsp_get_voice_state(voice_index: u32, state_ptr: *mut u8) -> i32 {
    const STATE_SIZE: usize = 22;

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

        let buf = std::slice::from_raw_parts_mut(state_ptr, STATE_SIZE);

        // source
        buf[0] = voice.source;
        // muted
        buf[1] = voice.is_muted as u8;
        // envelope_level (i32 LE)
        buf[2..6].copy_from_slice(&voice.envelope.level.to_le_bytes());
        // volume left/right (as i8, stored as u8)
        buf[6] = *voice.volume.left() as i8 as u8;
        buf[7] = *voice.volume.right() as i8 as u8;
        // amplitude left/right (i32 LE)
        buf[8..12].copy_from_slice(&voice.amplitude.into_inner_left().to_le_bytes());
        buf[12..16].copy_from_slice(&voice.amplitude.into_inner_right().to_le_bytes());
        // pitch (u16 LE)
        buf[16..18].copy_from_slice(&voice.pitch().to_le_bytes());
        // noise clock
        let noise_on = voice.noise_on;
        buf[18] = noise_on as u8;
        buf[19] = if noise_on { dsp.noise_clock } else { 0 };
        // echo on
        buf[20] = voice.echo_on as u8;
        // pitch modulation
        buf[21] = voice.pitch_mod as u8;

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
