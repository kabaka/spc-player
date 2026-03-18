---
name: cross-platform
description: Platform detection, graceful degradation, and cross-platform compatibility strategies.
---

# Cross-Platform

Use this skill when handling platform differences, feature detection, or ensuring the app works across devices.

## Target Platforms

| Platform | Browser | Priority |
| -------- | ------- | -------- |
| Windows | Chrome, Edge, Firefox | Primary |
| macOS | Chrome, Safari, Firefox | Primary |
| iOS | Safari, Chrome | Secondary |
| Android | Chrome, Firefox | Secondary |
| Linux | Chrome, Firefox | Secondary |

## Feature Detection Pattern

Always use feature detection, never user-agent sniffing:

```typescript
// Good: feature detection
if ('AudioWorklet' in AudioContext.prototype) {
  // Use AudioWorklet
} else {
  // Fall back to ScriptProcessorNode (deprecated but wider support)
}

// Good: check API availability
const hasWebMIDI = 'requestMIDIAccess' in navigator;
const hasFileSystem = 'showOpenFilePicker' in window;
const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

// Bad: user-agent sniffing
if (navigator.userAgent.includes('Safari')) { /* don't do this */ }
```

## Progressive Enhancement Tiers

### Tier 1: Core (must work everywhere)

- Load and play SPC files.
- Basic playback controls (play, pause, stop, seek).
- File picker (standard `<input type="file">`).

### Tier 2: Enhanced (modern browsers)

- AudioWorklet for low-latency, glitch-free playback.
- SharedArrayBuffer for efficient WASM memory sharing.
- File System Access API for better file picking.
- Web MIDI for instrument interaction.

### Tier 3: Platform-specific

- PWA install (Chrome, Edge, supported mobile).
- File handling API (Chrome, Edge).
- Share Target API (Chrome, Edge on Android).
- Media Session API (mobile lock screen controls).

## Graceful Degradation Rules

- Never crash if a feature is unavailable. Degrade gracefully.
- Hide UI for unavailable features rather than showing disabled controls.
- Log missing features at debug level for diagnostics.
- Test with features disabled to verify degradation paths.

## Touch vs. Mouse

- Support both pointer events and touch events.
- Use `pointer` events where possible (unified model).
- Ensure all interactive elements have adequate touch targets (44x44px minimum).
- Virtual keyboard on mobile: handle viewport resize, don't let it obscure controls.

## COOP/COEP Headers

SharedArrayBuffer requires cross-origin isolation:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- Set these in the server config or `_headers` file.
- Resources from other origins need `crossorigin` attribute or CORP headers.
- Test that the app still works without these headers (Tier 1 fallback).
