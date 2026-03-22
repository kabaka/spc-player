/**
 * Web MIDI API wrapper — functional singleton for MIDI input.
 *
 * Only one MIDI access session exists per page. The module parses note on/off
 * messages and delegates to caller-provided handlers.
 *
 * MIDI is a progressive enhancement: the app must work fully without it.
 */

import { midiError } from '../errors/factories';
import type { MidiError } from '../types/errors';
import type { Result } from '../types/result';
import { Err, Ok } from '../types/result';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Parsed note-on event from a MIDI device. */
export interface MidiNoteOn {
  readonly note: number; // 0-127
  readonly velocity: number; // 1-127
  readonly channel: number; // 0-15
}

/** Parsed note-off event from a MIDI device. */
export interface MidiNoteOff {
  readonly note: number; // 0-127
  readonly channel: number; // 0-15
}

/** Callbacks provided by the consumer. All run on the main thread. */
export interface MidiEventHandlers {
  readonly onNoteOn: (event: MidiNoteOn) => void;
  readonly onNoteOff: (event: MidiNoteOff) => void;
  readonly onDeviceConnected: (deviceName: string, deviceId: string) => void;
  readonly onDeviceDisconnected: (deviceName: string, deviceId: string) => void;
}

/** Summary of a connected MIDI input device. */
export interface MidiDeviceInfo {
  readonly id: string;
  readonly name: string;
  readonly manufacturer: string;
}

// ---------------------------------------------------------------------------
// MIDI message constants
// ---------------------------------------------------------------------------

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const STATUS_TYPE_MASK = 0xf0;
const CHANNEL_MASK = 0x0f;

// ---------------------------------------------------------------------------
// Module state (singleton — one active session per page)
// ---------------------------------------------------------------------------

let midiAccess: MIDIAccess | null = null;
let handlers: MidiEventHandlers | null = null;
let selectedDeviceId: string | null = null;
const connectedDevices = new Map<string, MidiDeviceInfo>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if Web MIDI API is available in this browser.
 * Pure feature detection — no side effects, no permission prompt.
 */
export function isMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

/**
 * Request MIDI access and begin listening for devices.
 *
 * Idempotent: calling while already initialized returns existing connected devices.
 *
 * @returns Array of currently connected input devices (may be empty) on success.
 */
export async function initMidi(
  eventHandlers: MidiEventHandlers,
): Promise<Result<readonly MidiDeviceInfo[], MidiError>> {
  if (midiAccess) {
    handlers = eventHandlers;
    return Ok([...connectedDevices.values()]);
  }

  if (!isMidiSupported()) {
    return Err(midiError('MIDI_NOT_SUPPORTED'));
  }

  try {
    midiAccess = await navigator.requestMIDIAccess();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'SecurityError') {
      return Err(midiError('MIDI_PERMISSION_DENIED'));
    }
    return Err(
      midiError('MIDI_DEVICE_ERROR', {
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  handlers = eventHandlers;

  // Enumerate existing inputs
  for (const input of midiAccess.inputs.values()) {
    attachInput(input);
  }

  // Listen for device connect/disconnect
  midiAccess.onstatechange = handleStateChange;

  return Ok([...connectedDevices.values()]);
}

/**
 * Stop listening and release MIDI resources.
 * Safe to call when not initialized (no-op).
 */
export function disposeMidi(): void {
  if (!midiAccess) return;

  for (const input of midiAccess.inputs.values()) {
    input.onmidimessage = null;
  }
  midiAccess.onstatechange = null;
  midiAccess = null;
  handlers = null;
  selectedDeviceId = null;
  connectedDevices.clear();
}

/**
 * List currently connected MIDI input devices.
 * Returns empty array if MIDI is not initialized.
 */
export function getConnectedDevices(): readonly MidiDeviceInfo[] {
  return [...connectedDevices.values()];
}

/**
 * Select a specific MIDI input device by ID.
 * Only messages from the selected device will be forwarded to handlers.
 *
 * @returns Error if the device is not found.
 */
export function selectDevice(deviceId: string): Result<void, MidiError> {
  if (!connectedDevices.has(deviceId)) {
    return Err(
      midiError('MIDI_DEVICE_ERROR', {
        deviceId,
        detail: `Device "${deviceId}" is not connected`,
      }),
    );
  }
  selectedDeviceId = deviceId;
  return Ok(undefined);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toDeviceInfo(input: MIDIInput): MidiDeviceInfo {
  return {
    id: input.id,
    name: input.name ?? 'Unknown MIDI Device',
    manufacturer: input.manufacturer ?? 'Unknown',
  };
}

function attachInput(input: MIDIInput): void {
  if (input.state !== 'connected') return;

  const info = toDeviceInfo(input);
  connectedDevices.set(input.id, info);
  input.onmidimessage = handleMidiMessage;
}

function handleStateChange(event: Event): void {
  const midiEvent = event as MIDIConnectionEvent;
  const port = midiEvent.port;
  if (!port || port.type !== 'input') return;

  const input = port as MIDIInput;

  if (input.state === 'connected') {
    const info = toDeviceInfo(input);
    connectedDevices.set(input.id, info);
    input.onmidimessage = handleMidiMessage;
    handlers?.onDeviceConnected(info.name, info.id);
  } else if (input.state === 'disconnected') {
    const info = connectedDevices.get(input.id);
    const name = info?.name ?? input.name ?? 'Unknown';
    connectedDevices.delete(input.id);
    input.onmidimessage = null;

    // Clear selection if the disconnected device was selected
    if (selectedDeviceId === input.id) {
      selectedDeviceId = null;
    }

    handlers?.onDeviceDisconnected(name, input.id);
  }
}

function handleMidiMessage(event: Event): void {
  const midiEvent = event as MIDIMessageEvent;
  if (!handlers || !midiEvent.data || midiEvent.data.length < 3) return;

  // Filter by selected device if one is set
  const target = midiEvent.target as MIDIInput | null;
  if (selectedDeviceId && target?.id !== selectedDeviceId) return;

  const status = midiEvent.data[0];
  const data1 = midiEvent.data[1];
  const data2 = midiEvent.data[2];

  const messageType = status & STATUS_TYPE_MASK;
  const channel = status & CHANNEL_MASK;

  if (messageType === NOTE_ON && data2 > 0) {
    handlers.onNoteOn({ note: data1, velocity: data2, channel });
  } else if (messageType === NOTE_ON && data2 === 0) {
    // Velocity-0 note-on is equivalent to note-off (MIDI spec)
    handlers.onNoteOff({ note: data1, channel });
  } else if (messageType === NOTE_OFF) {
    handlers.onNoteOff({ note: data1, channel });
  }
}
