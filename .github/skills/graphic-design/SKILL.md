---
name: graphic-design
description: Color system design, typography selection, iconography conventions, and visual asset creation.
---

# Graphic Design

Use this skill when defining the visual identity, creating design tokens, or specifying visual assets.

## Color System

### Token Structure

- **Base palette**: raw color values (e.g., `blue-500: #3B82F6`).
- **Semantic tokens**: purpose-based (e.g., `color-primary`, `color-surface`, `color-error`).
- **Component tokens**: specific usage (e.g., `button-bg`, `track-muted-bg`).

### Dark and Light Themes

- Both themes derive from the same semantic token names.
- Dark theme: light text on dark backgrounds, reduced contrast to avoid eye strain.
- Light theme: dark text on light backgrounds, careful with pure white (use off-white).
- Active/accent colors should be vibrant enough to read in both themes.
- Test contrast ratios in both themes (WCAG AA minimum).

### Audio-Specific Colors

- VU meter gradient: green → yellow → red (traditional, universally recognized).
- Voice/track colors: distinct, colorblind-friendly palette for 8 voices.
- Waveform: medium contrast against background, accent color for playback cursor.

## Typography

- System font stack for performance: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`.
- Or a single web font (keep weight count low for bundle size).
- Type scale: use a modular scale (e.g., 1.25 ratio) for consistent heading sizes.
- Monospace font for technical displays (memory viewer, register values, hex data).

## Iconography

- Consistent style: all filled or all outlined, not mixed.
- Standard set for transport controls (play, pause, stop, skip, repeat, shuffle).
- Custom icons for SPC-specific features (voice toggle, BRR sample, DSP register).
- Minimum size: 24×24px for clarity, 44×44px touch target with padding.

## Design Tokens Format

Use CSS custom properties for runtime theming:

```css
:root {
  --color-bg: #ffffff;
  --color-text: #1a1a1a;
  --color-primary: #3b82f6;
}

[data-theme="dark"] {
  --color-bg: #0f0f0f;
  --color-text: #e5e5e5;
  --color-primary: #60a5fa;
}
```
