---
name: web-audio-api
description: Web Audio API — AudioContext, AudioWorklet, real-time audio graph construction and management.
---

# Web Audio API

Use this skill when building the audio playback pipeline, implementing AudioWorklet processors, or managing audio routing.

## Core Concepts

- **AudioContext**: main entry point. One per application. Manages the audio graph and hardware output.
- **AudioNode**: processing unit in the graph. Connect nodes together: source → processing → destination.
- **AudioWorklet**: custom audio processing on the audio thread. Replaces deprecated ScriptProcessorNode.
- **AudioParam**: automatable parameters (gain, frequency). Can be set or ramped over time.

## AudioContext Lifecycle

```typescript
// Must be created/resumed after a user gesture (browser autoplay policy)
const ctx = new AudioContext({ sampleRate: 48000 });
// ctx.state: 'suspended' | 'running' | 'closed'
await ctx.resume(); // after user gesture
```

- Always handle the suspended state. Show a "Click to play" prompt if needed.
- Set sample rate explicitly to avoid resampling surprises.
- Only one AudioContext is needed. Reuse it.

## AudioWorklet Pattern

Register a processor module, then instantiate it as a node:

```typescript
// Main thread
await ctx.audioWorklet.addModule('spc-processor.js');
const node = new AudioWorkletNode(ctx, 'spc-processor');
node.connect(ctx.destination);

// Send commands via port
node.port.postMessage({ type: 'load', data: spcBuffer });
```

```typescript
// spc-processor.js (runs on audio thread)
class SpcProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    // Fill output[0] (left) and output[1] (right) with 128 samples each
    // Return true to keep processing, false to stop
    return true;
  }
}
registerProcessor('spc-processor', SpcProcessor);
```

## Key Rules

- **128-frame quantum**: `process()` is called with exactly 128 frames per channel.
- **No allocations**: avoid creating objects/arrays in `process()`. Pre-allocate buffers.
- **No DOM access**: the audio thread has no access to DOM, fetch, or most Web APIs.
- **No blocking**: never block in `process()`. If data isn't ready, output silence.
- **MessagePort**: use `this.port` for communication between main thread and processor.
- **SharedArrayBuffer**: for high-performance data sharing (requires COOP/COEP headers).

## Audio Graph for SPC Player

```
SpcWorkletNode → GainNode (master volume) → AnalyserNode → ctx.destination
                                          ↘ (optional) MediaStreamDestination (for recording)
```

- GainNode for volume control. Use `gain.setValueAtTime()` for click-free changes.
- AnalyserNode for visualization (FFT data, waveform).
- MediaStreamDestination for capturing output as a stream.

## WASM in AudioWorklet

- Import WASM module inside the worklet processor.
- Use `WebAssembly.instantiate()` with a pre-compiled module passed via MessagePort.
- WASM memory is the emulator state; output samples directly from WASM to the output buffer.

## Error Handling

- Listen for `processorerror` event on AudioWorkletNode.
- Handle AudioContext state changes (`statechange` event).
- Gracefully handle `NotAllowedError` when autoplay policy blocks audio.
