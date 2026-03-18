---
name: music-player-ux
description: Audio player conventions, transport controls, playlist patterns, and music app interaction design.
---

# Music Player UX

Use this skill when designing or reviewing audio player interfaces, transport controls, playlist management, or any music-related interaction.

## Transport Controls

Standard layout (left to right): previous, play/pause, next. Additional: stop, repeat, shuffle.

- Play/Pause is a single toggle button. Icon changes to reflect current state.
- Progress bar: click/tap to seek. Drag for scrubbing. Show elapsed and total time.
- Volume: slider with mute toggle. Remember last volume before mute.
- Speed control: discrete steps (0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×) or free slider.

## Playlist UX

- Drag to reorder. Clear affordance for drag handle.
- Swipe to remove (mobile) or hover-reveal delete button (desktop).
- Current track highlighted. Scroll to keep current track visible.
- Empty state: prompt to add files.
- Multi-select for batch operations (remove, export).
- Persistence: playlists survive app restart.

## Track Display

- Currently playing: title, game name, artist, duration.
- Album art equivalent: game box art or a tasteful placeholder.
- Track number and total (e.g., "3 of 12").
- Elapsed time / total time.
- VU meters or waveform visualization (optional, skippable for accessibility).

## SPC-Specific UX

- **Voice mute/solo**: 8 toggle buttons (one per DSP voice). Solo should unmute the selected voice and mute all others. Clear visual state.
- **Instrument viewer**: list instruments with BRR sample name/number, preview button, and export option.
- **Metadata viewer**: ID666 tags displayed clearly. Technical details (DSP registers, memory) available in advanced view.
- **Fade handling**: show when fade starts. Allow user to override fade duration. Show visual indicator during fade.

## Keyboard Shortcuts

Follow established conventions:

- Space: play/pause
- Left/Right arrows: seek backward/forward
- Up/Down arrows: volume up/down
- M: mute/unmute
- 1–8: toggle voice mute (SPC-specific)
- N: next track, P: previous track

Make shortcuts discoverable via tooltip or help overlay (`?` to show).

## Mobile Considerations

- Lock screen / notification controls (Media Session API).
- Background playback when app is minimized.
- Compact player in bottom bar when navigating to non-player views.
