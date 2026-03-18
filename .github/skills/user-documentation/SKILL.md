---
name: user-documentation
description: End-user facing documentation — guides, tutorials, help text, and in-app documentation.
---

# User Documentation

Use this skill when writing documentation intended for end users of SPC Player.

## Audience

End users are SNES music enthusiasts, retro gaming fans, and casual listeners. They may not have technical knowledge. Write for a general audience.

## Tone and Style

- Friendly, concise, and direct.
- Use second person ("you") and active voice.
- Avoid jargon. If a technical term is necessary, define it on first use.
- Use short paragraphs and bullet points.
- Include screenshots or diagrams where they help.

## Documentation Types

### Quick Start Guide

- Get the user playing music in under 2 minutes.
- Step-by-step: open app → load file → press play.
- Include a sample SPC file or link to a well-known archive.

### Feature Guides

One page per major feature:

- **Playback controls**: play, pause, stop, seek, loop, speed.
- **Channel mixer**: mute/solo individual voices.
- **Export**: save as WAV/FLAC/OGG/MP3.
- **Instrument explorer**: play instruments with keyboard/MIDI.
- **File management**: import, organize, create playlists.
- **Settings**: audio, display, keyboard shortcuts.

### FAQ

- "What is an SPC file?"
- "Where can I find SPC files?"
- "Why is there no sound?" (autoplay policy)
- "Does it work offline?"
- "How do I install it as an app?"

### Keyboard Shortcuts Reference

Provide a single-page reference of all keyboard shortcuts, organized by category.

## In-App Help

- Use tooltips for icon-only buttons.
- Provide contextual help (e.g., "?" icon near complex features).
- First-run onboarding: brief walkthrough of key features.
- Don't overwhelm — progressive disclosure.

## Hosting

- User docs are part of the app (accessible from help menu).
- Also available as markdown in the repo under `docs/user/`.
- Keep docs in sync with the app. Update docs in the same PR as feature changes.

## Writing Checklist

- [ ] Tested the steps yourself.
- [ ] Screenshots are up-to-date.
- [ ] No broken links.
- [ ] Accessible language (WCAG-friendly text).
- [ ] Mobile-friendly formatting.
