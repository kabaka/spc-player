---
name: midi-integration
description: Web MIDI API — device discovery, note mapping, keyboard-to-instrument integration for SPC playback.
---

# MIDI Integration

Use this skill when implementing MIDI input for instrument interaction features.

## Web MIDI API

```typescript
const midi = await navigator.requestMIDIAccess();
// midi.inputs: Map of MIDIInput devices
// midi.outputs: Map of MIDIOutput devices (not needed for input-only)

midi.onstatechange = (e) => {
  // Device connected/disconnected
};

for (const input of midi.inputs.values()) {
  input.onmidimessage = (msg) => {
    const [status, note, velocity] = msg.data;
    // status: 0x90 = note on, 0x80 = note off (channel 1)
    // note: 0-127 (60 = middle C)
    // velocity: 0-127 (0 on note-on = note off)
  };
}
```

## Browser Support

- Chrome/Edge: full support.
- Firefox: behind a flag (`dom.webmidi.enabled`), requires secure context.
- Safari: not supported as of 2024.
- Always feature-detect: `if ('requestMIDIAccess' in navigator)`.
- MIDI is a progressive enhancement — the app must work fully without it.

## MIDI Messages (relevant subset)

| Status | Type | Data |
| ------ | ---- | ---- |
| 0x80-0x8F | Note Off | note, velocity |
| 0x90-0x9F | Note On | note, velocity |
| 0xB0-0xBF | Control Change | controller, value |
| 0xE0-0xEF | Pitch Bend | LSB, MSB |

Channel is encoded in the lower nibble (0x90 = note on channel 1, 0x91 = channel 2).

## Note Mapping for SPC

The SNES S-DSP uses BRR samples at specific pitches. Map MIDI notes to DSP pitch values:

- Extract the base pitch from the instrument's source data.
- Calculate pitch ratio: `2^((midiNote - baseNote) / 12)`.
- Set DSP pitch register accordingly.
- Velocity maps to DSP envelope or volume.

## Latency

- MIDI hardware latency is typically <1ms.
- Audio latency (AudioWorklet buffer) adds 3-10ms.
- Total round-trip should be <20ms for responsive feel.
- If latency is too high, reduce AudioContext buffer size.

## UI Integration

- Show a MIDI indicator when a device is connected.
- Allow users to select which MIDI input to use (if multiple).
- Map MIDI CC to controls (e.g., CC7 = volume, CC1 = modulation).
- Provide a virtual on-screen keyboard as a fallback when no MIDI device is available.

## Error Handling

- `requestMIDIAccess()` may throw `SecurityError` if not in a secure context.
- Handle device disconnection gracefully — don't crash if a device is unplugged mid-session.
- If permission is denied, inform the user and fall back to keyboard input.
