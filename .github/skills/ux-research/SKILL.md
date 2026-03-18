---
name: ux-research
description: Usability heuristic evaluation, persona-driven analysis, and competitive benchmarking for design decisions.
---

# UX Research

Use this skill when evaluating designs, identifying usability issues, or benchmarking against competitors.

## Nielsen's 10 Usability Heuristics

Apply these when evaluating any design or interaction:

1. **Visibility of system status**: does the user always know what's happening? (Playback state, loading progress, export status.)
2. **Match between system and real world**: does the app use language/concepts the user understands? (Audio terminology familiar to the target audience.)
3. **User control and freedom**: can users undo mistakes? (Stop playback, cancel export, undo playlist changes.)
4. **Consistency and standards**: does the app follow platform conventions? (Standard transport controls, common keyboard shortcuts.)
5. **Error prevention**: does the design prevent mistakes? (Confirm before overwriting, validate input.)
6. **Recognition rather than recall**: are options visible? (Don't hide common features in menus.)
7. **Flexibility and efficiency**: are there shortcuts for experts? (Keyboard shortcuts, recent files, quick actions.)
8. **Aesthetic and minimalist design**: is there unnecessary information? (Remove clutter, show what matters.)
9. **Help users recognize, diagnose, recover from errors**: are error messages clear? (What went wrong, what to do about it.)
10. **Help and documentation**: is guidance available? (Tooltips, onboarding, help section.)

## Persona-Driven Analysis

Evaluate designs from each persona's perspective:

- **SNES enthusiast**: wants accuracy, technical detail, memory viewer. Tolerates complexity.
- **Musician**: wants instrument extraction, MIDI, per-track control. Needs intuitive audio controls.
- **Casual fan**: wants to play music easily. Needs simple UI, no learning curve.
- **Retro audiophile**: wants bit-perfect output, lossless export, DAC configuration. Values fidelity information.

## Competitive Benchmarking

Compare against established players:

- Audio players: foobar2000, Winamp, VLC, Apple Music, Spotify.
- SPC-specific: SNESAmp, spcplay, SPCTool.
- Retro audio: Game Music Emu, chip-player-js.

Note: what they do well, what they do poorly, and where SPC Player can differentiate.

## Severity Rating

- **Critical**: prevents task completion. Must fix before release.
- **Major**: significant friction or confusion. Fix soon.
- **Minor**: cosmetic or slight inconvenience. Fix when convenient.
