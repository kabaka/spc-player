---
name: platform-audio
description: Platform-specific audio behaviors — autoplay policies, background audio, hardware quirks, and mobile constraints.
---

# Platform Audio

Use this skill when handling cross-platform audio issues, autoplay restrictions, or mobile audio constraints.

## Autoplay Policies

All major browsers require a user gesture before audio can play.

- **Chrome/Edge**: AudioContext starts in `suspended` state. Must call `resume()` after click/tap/keydown.
- **Safari**: Stricter — AudioContext must be created inside a user gesture handler, or `resume()` must be called within one.
- **Firefox**: Similar to Chrome but with some exceptions for user-activated pages.

### Pattern

```typescript
document.addEventListener(
  'click',
  async () => {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  },
  { once: true },
);
```

Always show a visible play/start button. Never try to auto-play audio on page load.

## Mobile Constraints

### iOS Safari

- AudioContext sample rate is often locked to the hardware rate (usually 48000).
- Background audio stops when the tab is backgrounded unless using a `<audio>` element hack.
- Web Audio may be interrupted by phone calls, Siri, or other audio sessions.
- AudioWorklet is supported in iOS 14.5+.

### Android Chrome

- AudioContext generally works well.
- Background audio may stop when the tab is backgrounded (varies by OEM).
- Some devices have high audio latency (100-200ms).

## Background Audio

- By default, browsers may suspend audio when the tab is not visible.
- Using Media Session API can help:

```typescript
navigator.mediaSession.metadata = new MediaMetadata({
  title: trackTitle,
  artist: gameTitle,
});
navigator.mediaSession.setActionHandler('play', () => {
  /* resume */
});
navigator.mediaSession.setActionHandler('pause', () => {
  /* pause */
});
```

- Media Session enables lock screen / notification controls on mobile.

## Hardware Sample Rate

- Query the hardware rate: `new AudioContext().sampleRate`.
- If you request a different rate, the browser will resample (quality varies).
- For best quality, match the hardware rate or use 48000 Hz as a safe default.

## Audio Focus / Interruptions

- Handle `AudioContext.onstatechange` to detect when the browser interrupts audio.
- On interruption: pause playback, update UI.
- On resume: offer to restart playback (don't auto-resume, especially on mobile).

## Power Consumption

- Audio processing keeps the CPU active. On mobile, this drains battery.
- When paused, stop the AudioWorklet (return `false` from `process()`) or disconnect the node.
- Avoid keeping AnalyserNode running when visualization is not visible.
