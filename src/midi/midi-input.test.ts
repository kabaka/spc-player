/**
 * Unit tests for midi-input.ts — Web MIDI API wrapper.
 *
 * Mocks navigator.requestMIDIAccess and related MIDI interfaces
 * to test initialization, message parsing, and device lifecycle.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions validate non-null before use */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidiEventHandlers } from './midi-input';
import {
  disposeMidi,
  getConnectedDevices,
  initMidi,
  isMidiSupported,
  selectDevice,
} from './midi-input';

// ---------------------------------------------------------------------------
// Mock MIDI infrastructure
// ---------------------------------------------------------------------------

interface MockMIDIInput {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input';
  state: 'connected' | 'disconnected';
  onmidimessage: ((event: Event) => void) | null;
}

interface MockMIDIAccess {
  inputs: Map<string, MockMIDIInput>;
  onstatechange: ((event: Event) => void) | null;
}

function createMockInput(
  id: string,
  name: string,
  manufacturer = 'Test Manufacturer',
): MockMIDIInput {
  return {
    id,
    name,
    manufacturer,
    type: 'input',
    state: 'connected',
    onmidimessage: null,
  };
}

function createMockMIDIAccess(inputs: MockMIDIInput[] = []): MockMIDIAccess {
  const inputMap = new Map<string, MockMIDIInput>();
  for (const input of inputs) {
    inputMap.set(input.id, input);
  }
  return { inputs: inputMap, onstatechange: null };
}

function createMidiMessageEvent(data: number[], target?: MockMIDIInput): Event {
  const event = new Event('midimessage') as Event & {
    data: Uint8Array;
    target: MockMIDIInput | null;
  };
  Object.defineProperty(event, 'data', { value: new Uint8Array(data) });
  Object.defineProperty(event, 'target', { value: target ?? null });
  return event;
}

function createStateChangeEvent(port: MockMIDIInput): Event {
  const event = new Event('statechange') as Event & { port: MockMIDIInput };
  Object.defineProperty(event, 'port', { value: port });
  return event;
}

function createHandlers(): MidiEventHandlers {
  return {
    onNoteOn: vi.fn(),
    onNoteOff: vi.fn(),
    onDeviceConnected: vi.fn(),
    onDeviceDisconnected: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('midi-input', () => {
  let originalRequestMIDIAccess: typeof navigator.requestMIDIAccess | undefined;

  beforeEach(() => {
    disposeMidi();
    originalRequestMIDIAccess = navigator.requestMIDIAccess;
  });

  afterEach(() => {
    disposeMidi();
    if (originalRequestMIDIAccess) {
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: originalRequestMIDIAccess,
        writable: true,
        configurable: true,
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (navigator as any).requestMIDIAccess;
    }
  });

  // ── Feature detection ──────────────────────────────────────

  describe('isMidiSupported', () => {
    it('returns true when requestMIDIAccess exists on navigator', () => {
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
      expect(isMidiSupported()).toBe(true);
    });

    it('returns false when requestMIDIAccess is absent', () => {
      // Must delete the property — setting it to undefined still passes `in` check
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (navigator as any).requestMIDIAccess;
      expect(isMidiSupported()).toBe(false);
    });
  });

  // ── Initialization ─────────────────────────────────────────

  describe('initMidi', () => {
    it('returns MIDI_NOT_SUPPORTED when API is unavailable', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (navigator as any).requestMIDIAccess;
      const result = await initMidi(createHandlers());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MIDI_NOT_SUPPORTED');
      }
    });

    it('returns MIDI_PERMISSION_DENIED on SecurityError', async () => {
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockRejectedValue(new DOMException('', 'SecurityError')),
        writable: true,
        configurable: true,
      });
      const result = await initMidi(createHandlers());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MIDI_PERMISSION_DENIED');
      }
    });

    it('returns MIDI_DEVICE_ERROR on unexpected error', async () => {
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockRejectedValue(new Error('Unexpected')),
        writable: true,
        configurable: true,
      });
      const result = await initMidi(createHandlers());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MIDI_DEVICE_ERROR');
        expect(result.error.context.detail).toBe('Unexpected');
      }
    });

    it('returns connected devices on success', async () => {
      const input = createMockInput('dev-1', 'Test Keyboard');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const result = await initMidi(createHandlers());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('dev-1');
        expect(result.value[0].name).toBe('Test Keyboard');
      }
    });

    it('is idempotent — second call returns existing devices', async () => {
      const input = createMockInput('dev-1', 'Test Keyboard');
      const access = createMockMIDIAccess([input]);
      const mockRequest = vi.fn().mockResolvedValue(access);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: mockRequest,
        writable: true,
        configurable: true,
      });

      await initMidi(createHandlers());
      const result = await initMidi(createHandlers());

      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });

    it('returns empty array when no devices are connected', async () => {
      const access = createMockMIDIAccess([]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const result = await initMidi(createHandlers());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  // ── Message parsing ────────────────────────────────────────

  describe('MIDI message parsing', () => {
    let access: MockMIDIAccess;
    let input: MockMIDIInput;
    let eventHandlers: MidiEventHandlers;

    beforeEach(async () => {
      input = createMockInput('dev-1', 'Test Keyboard');
      access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });
      eventHandlers = createHandlers();
      await initMidi(eventHandlers);
    });

    it('parses note-on (0x90) with velocity > 0', () => {
      // Note C4 (60), velocity 100, channel 0
      const event = createMidiMessageEvent([0x90, 60, 100], input);
      input.onmidimessage!(event);

      expect(eventHandlers.onNoteOn).toHaveBeenCalledWith({
        note: 60,
        velocity: 100,
        channel: 0,
      });
    });

    it('treats note-on (0x90) with velocity 0 as note-off', () => {
      const event = createMidiMessageEvent([0x90, 60, 0], input);
      input.onmidimessage!(event);

      expect(eventHandlers.onNoteOff).toHaveBeenCalledWith({
        note: 60,
        channel: 0,
      });
      expect(eventHandlers.onNoteOn).not.toHaveBeenCalled();
    });

    it('parses note-off (0x80)', () => {
      const event = createMidiMessageEvent([0x80, 64, 64], input);
      input.onmidimessage!(event);

      expect(eventHandlers.onNoteOff).toHaveBeenCalledWith({
        note: 64,
        channel: 0,
      });
    });

    it('extracts channel from status byte', () => {
      // Channel 5 (0x95 = note on channel 5)
      const event = createMidiMessageEvent([0x95, 72, 80], input);
      input.onmidimessage!(event);

      expect(eventHandlers.onNoteOn).toHaveBeenCalledWith({
        note: 72,
        velocity: 80,
        channel: 5,
      });
    });

    it('extracts channel from note-off status byte', () => {
      // Channel 15 (0x8F = note off channel 15)
      const event = createMidiMessageEvent([0x8f, 48, 0], input);
      input.onmidimessage!(event);

      expect(eventHandlers.onNoteOff).toHaveBeenCalledWith({
        note: 48,
        channel: 15,
      });
    });

    it('ignores non-note messages (control change)', () => {
      // Control change: 0xB0
      const event = createMidiMessageEvent([0xb0, 7, 100], input);
      input.onmidimessage!(event);

      expect(eventHandlers.onNoteOn).not.toHaveBeenCalled();
      expect(eventHandlers.onNoteOff).not.toHaveBeenCalled();
    });

    it('ignores messages with fewer than 3 bytes', () => {
      const event = new Event('midimessage') as Event & {
        data: Uint8Array;
        target: MockMIDIInput | null;
      };
      Object.defineProperty(event, 'data', {
        value: new Uint8Array([0x90, 60]),
        configurable: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      input.onmidimessage!(event);

      expect(eventHandlers.onNoteOn).not.toHaveBeenCalled();
      expect(eventHandlers.onNoteOff).not.toHaveBeenCalled();
    });
  });

  // ── Device connect/disconnect ──────────────────────────────

  describe('device lifecycle', () => {
    let access: MockMIDIAccess;
    let eventHandlers: MidiEventHandlers;

    beforeEach(async () => {
      access = createMockMIDIAccess([]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });
      eventHandlers = createHandlers();
      await initMidi(eventHandlers);
    });

    it('fires onDeviceConnected when a new device appears', () => {
      const newInput = createMockInput('dev-2', 'New Keyboard');
      access.inputs.set('dev-2', newInput);
      const event = createStateChangeEvent(newInput);
      access.onstatechange!(event);

      expect(eventHandlers.onDeviceConnected).toHaveBeenCalledWith(
        'New Keyboard',
        'dev-2',
      );
      expect(getConnectedDevices()).toHaveLength(1);
    });

    it('fires onDeviceDisconnected when a device is removed', () => {
      // First, connect a device
      const input = createMockInput('dev-1', 'Keyboard');
      access.inputs.set('dev-1', input);
      access.onstatechange!(createStateChangeEvent(input));

      expect(getConnectedDevices()).toHaveLength(1);

      // Now disconnect
      input.state = 'disconnected';
      access.onstatechange!(createStateChangeEvent(input));

      expect(eventHandlers.onDeviceDisconnected).toHaveBeenCalledWith(
        'Keyboard',
        'dev-1',
      );
      expect(getConnectedDevices()).toHaveLength(0);
    });

    it('clears selected device on disconnect', async () => {
      const input = createMockInput('dev-1', 'Keyboard');
      access.inputs.set('dev-1', input);
      access.onstatechange!(createStateChangeEvent(input));

      selectDevice('dev-1');

      input.state = 'disconnected';
      access.onstatechange!(createStateChangeEvent(input));

      // Attempting to select the now-disconnected device should fail
      const result = selectDevice('dev-1');
      expect(result.ok).toBe(false);
    });

    it('attaches message listener to newly connected devices', () => {
      const newInput = createMockInput('dev-3', 'Controller');
      access.inputs.set('dev-3', newInput);
      access.onstatechange!(createStateChangeEvent(newInput));

      expect(newInput.onmidimessage).not.toBeNull();
    });
  });

  // ── Device selection ───────────────────────────────────────

  describe('selectDevice', () => {
    it('returns error for non-existent device', async () => {
      const access = createMockMIDIAccess([]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });
      await initMidi(createHandlers());

      const result = selectDevice('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MIDI_DEVICE_ERROR');
      }
    });

    it('filters messages to selected device only', async () => {
      const input1 = createMockInput('dev-1', 'Keyboard 1');
      const input2 = createMockInput('dev-2', 'Keyboard 2');
      const access = createMockMIDIAccess([input1, input2]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });
      const eventHandlers = createHandlers();
      await initMidi(eventHandlers);

      selectDevice('dev-1');

      // Message from dev-2 should be ignored
      const event2 = createMidiMessageEvent([0x90, 60, 100], input2);
      input2.onmidimessage!(event2);
      expect(eventHandlers.onNoteOn).not.toHaveBeenCalled();

      // Message from dev-1 should be processed
      const event1 = createMidiMessageEvent([0x90, 60, 100], input1);
      input1.onmidimessage!(event1);
      expect(eventHandlers.onNoteOn).toHaveBeenCalledTimes(1);
    });
  });

  // ── Cleanup ────────────────────────────────────────────────

  describe('disposeMidi', () => {
    it('clears all state and listeners', async () => {
      const input = createMockInput('dev-1', 'Keyboard');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });
      await initMidi(createHandlers());

      expect(getConnectedDevices()).toHaveLength(1);

      disposeMidi();

      expect(getConnectedDevices()).toHaveLength(0);
      expect(input.onmidimessage).toBeNull();
      expect(access.onstatechange).toBeNull();
    });

    it('is safe to call when not initialized', () => {
      expect(() => disposeMidi()).not.toThrow();
    });
  });
});
