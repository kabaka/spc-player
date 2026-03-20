import { useCallback, useEffect, useRef, useState } from 'react';

import {
  initMidi,
  disposeMidi,
  isMidiSupported as checkMidiSupported,
  getConnectedDevices,
} from '@/midi/midi-input';
import type { MidiDeviceInfo } from '@/midi/midi-input';
import { useAppStore } from '@/store/store';

// ── Types ─────────────────────────────────────────────────────────────

export interface UseMidiOptions {
  readonly onNoteOn: (note: number, velocity: number) => void;
  readonly onNoteOff: (note: number) => void;
}

export interface UseMidiResult {
  readonly isMidiSupported: boolean;
  readonly connectedDevices: readonly MidiDeviceInfo[];
  readonly announcement: string;
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useMidi({
  onNoteOn,
  onNoteOff,
}: UseMidiOptions): UseMidiResult {
  const setMidiConnected = useAppStore((s) => s.setMidiConnected);

  const [connectedDevices, setConnectedDevices] = useState<
    readonly MidiDeviceInfo[]
  >([]);
  const [announcement, setAnnouncement] = useState('');

  // Stable refs for callbacks so the MIDI handlers always see current values
  // without re-initializing the MIDI session on every render.
  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);
  onNoteOnRef.current = onNoteOn;
  onNoteOffRef.current = onNoteOff;

  const supported = checkMidiSupported();

  const syncDevices = useCallback(() => {
    const devices = getConnectedDevices();
    setConnectedDevices(devices);
    setMidiConnected(devices.length > 0);
  }, [setMidiConnected]);

  useEffect(() => {
    if (!supported) return;

    let disposed = false;

    const startup = async () => {
      const result = await initMidi({
        onNoteOn: (event) => {
          onNoteOnRef.current(event.note, event.velocity);
        },
        onNoteOff: (event) => {
          onNoteOffRef.current(event.note);
        },
        onDeviceConnected: (deviceName) => {
          if (disposed) return;
          syncDevices();
          setAnnouncement(`MIDI device connected: ${deviceName}`);
        },
        onDeviceDisconnected: () => {
          if (disposed) return;
          syncDevices();
          setAnnouncement('MIDI device disconnected');
        },
      });

      if (disposed) return;

      if (result.ok) {
        syncDevices();
      }
    };

    void startup();

    return () => {
      disposed = true;
      disposeMidi();
      setMidiConnected(false);
      setConnectedDevices([]);
    };
  }, [supported, syncDevices, setMidiConnected]);

  return { isMidiSupported: supported, connectedDevices, announcement };
}
