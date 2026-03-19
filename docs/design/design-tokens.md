# Design Tokens and Theme Architecture

**Status:** Draft (Revised)

Specification for SPC Player's visual design system. This document defines every CSS custom property, color value, spacing unit, typographic scale, and theming mechanism used across the application. It is the single source of truth for visual consistency.

**Architectural foundations:**

- ADR-0004: CSS Modules + CSS custom properties. No Tailwind, no CSS-in-JS.
- ADR-0005: Zustand persists theme to IndexedDB; localStorage mirror prevents FOWT.
- ADR-0012: 18 Radix UI primitives, all styled via CSS Modules with `[data-state]` selectors.

**Design direction:** Retro SNES nostalgia meets modern, minimal audio player. The SNES console's charcoal body and iconic purple accents inform the palette, modernized for screens and accessibility compliance.

---

### Revision Notes

Changes from initial draft, based on peer review:

- **C1:** Fixed `text-muted` contrast. Dark: `#666680` → `#606079`. Light: `#8888A0` → `#7E7E96`. Updated contrast table with verified computed ratios.
- **C2:** Eliminated system-preference `@media` fallback that duplicated ~50 light-theme properties. The blocking `<script>` now always sets `.dark` or `.light` on `<html>`, becoming the single source of truth. Removed `:root:not(.dark):not(.light)` selectors throughout.
- **M1:** Expanded all 8 `--spc-color-voice-N-subtle` properties in both theme blocks using `color-mix()`.
- **M2:** Added `--spc-color-selection-bg` and `--spc-color-selection-text` tokens. Added `::selection` rule in CSS example.
- **M3:** Added Firefox `scrollbar-color` and `scrollbar-width` support in `global.css`.
- **M4:** Spacing table now shows `rem` as primary value with `px` equivalent in parentheses.
- **m1:** Added comment explaining `--spc-easing-default` and `--spc-easing-in-out` are semantically different tokens that may diverge.
- **m2:** Added `system-ui` to `--spc-font-sans` font stack.
- **m3:** Added note that ADR-0004 class-based theme switching (`.dark`/`.light`) is canonical; the `dark-light-mode` skill's `data-theme` convention is not used.
- **m4:** Added comment explaining the `:root` transition is intentionally always-on and only affects theme-switch properties.
- **Suggestion:** Added `--spc-color-skeleton` token for loading skeleton UI.
- **Suggestion:** Extended `prefers-contrast: more` to increase focus ring width from 2px to 3px.

---

## 1. CSS Custom Property Naming Convention

All design tokens use the `--spc-` prefix to avoid collisions with Radix UI internals, browser defaults, and third-party CSS.

### Pattern

```
--spc-{category}-{name}
```

### Categories

| Category      | Prefix               | Examples                                             |
| ------------- | -------------------- | ---------------------------------------------------- |
| Color         | `--spc-color-`       | `--spc-color-bg`, `--spc-color-text`                 |
| Spacing       | `--spc-space-`       | `--spc-space-sm`, `--spc-space-md`                   |
| Font family   | `--spc-font-`        | `--spc-font-sans`, `--spc-font-mono`                 |
| Font size     | `--spc-font-size-`   | `--spc-font-size-md`, `--spc-font-size-2xl`          |
| Font weight   | `--spc-font-weight-` | `--spc-font-weight-normal`, `--spc-font-weight-bold` |
| Line height   | `--spc-leading-`     | `--spc-leading-tight`, `--spc-leading-normal`        |
| Border radius | `--spc-radius-`      | `--spc-radius-sm`, `--spc-radius-md`                 |
| Shadow        | `--spc-shadow-`      | `--spc-shadow-sm`, `--spc-shadow-lg`                 |
| Z-index       | `--spc-z-`           | `--spc-z-modal`, `--spc-z-tooltip`                   |
| Duration      | `--spc-duration-`    | `--spc-duration-fast`, `--spc-duration-normal`       |
| Easing        | `--spc-easing-`      | `--spc-easing-default`, `--spc-easing-out`           |

### Rules

- **Semantic names only.** Use purpose (`--spc-color-bg`), not value (`--spc-color-dark-grey`).
- **Theme-variant tokens are not exposed.** Components consume `--spc-color-bg`; the theme mechanism swaps the underlying value. No `--spc-color-bg-dark` / `--spc-color-bg-light` in component code.
- **Numeric suffixes** use a consistent scale: `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`.
- **No shorthand values in tokens.** Each token holds a single CSS value, not a shorthand (e.g., separate `--spc-shadow-sm` holds the full `box-shadow` value, but `--spc-space-sm` holds a single length).

---

## 2. Color Palette

### 2.1 Design Rationale

The color system draws from the SNES hardware aesthetic:

- **Dark theme** backgrounds use deep charcoal with a subtle blue-purple undertone, evoking the console's dark grey body.
- **Primary accent** is a vivid purple inspired by the SNES/SFC logo and controller accents.
- **Light theme** uses warm off-whites and cool greys for a clean, modern feel that still echoes the lighter Super Famicom shell.
- Audio visualization colors (VU meters, waveforms) use universally recognized conventions (green/yellow/red) independent of theme.

### 2.2 Semantic Color Tokens

Every color below is defined as a CSS custom property. Dark theme values are the defaults (`:root`). Light theme values are applied via `:root.light`. The blocking `<script>` in `<head>` always sets `.dark` or `.light` on `<html>` (see §8).

#### Backgrounds

| Token                        | Dark                  | Light                 | Usage                                                   |
| ---------------------------- | --------------------- | --------------------- | ------------------------------------------------------- |
| `--spc-color-bg`             | `#0E0E16`             | `#F5F5F8`             | Page/app background                                     |
| `--spc-color-bg-subtle`      | `#161622`             | `#EDEDF2`             | Slightly offset background (sidebars, alternating rows) |
| `--spc-color-surface`        | `#1E1E2E`             | `#FFFFFF`             | Card, panel, dialog backgrounds                         |
| `--spc-color-surface-raised` | `#282840`             | `#FFFFFF`             | Elevated surfaces (popovers, dropdown menus)            |
| `--spc-color-overlay`        | `rgba(0, 0, 0, 0.60)` | `rgba(0, 0, 0, 0.40)` | Modal/dialog backdrop                                   |

#### Text

| Token                        | Dark      | Light     | Contrast on bg | Usage                                                                                 |
| ---------------------------- | --------- | --------- | -------------- | ------------------------------------------------------------------------------------- |
| `--spc-color-text`           | `#EDEDF0` | `#1A1A28` | ≥ 15:1         | Primary text, headings                                                                |
| `--spc-color-text-secondary` | `#9999B0` | `#5A5A70` | ≥ 6:1          | Secondary text, descriptions                                                          |
| `--spc-color-text-muted`     | `#606079` | `#7E7E96` | ≥ 3:1          | Tertiary text, timestamps. Large text (≥ 18px) only, or non-essential decorative text |
| `--spc-color-text-inverse`   | `#0E0E16` | `#F5F5F8` | —              | Text on accent-colored backgrounds                                                    |

#### Borders

| Token                       | Dark      | Light     | Usage                                              |
| --------------------------- | --------- | --------- | -------------------------------------------------- |
| `--spc-color-border`        | `#2E2E44` | `#D4D4DC` | Default borders (inputs, cards, dividers)          |
| `--spc-color-border-subtle` | `#232338` | `#E4E4EC` | Subtle dividers, separator lines                   |
| `--spc-color-border-strong` | `#3E3E58` | `#B4B4C4` | Emphasized borders (focused inputs, active states) |

#### Accent (SNES Purple)

| Token                       | Dark                       | Light                      | Usage                                                |
| --------------------------- | -------------------------- | -------------------------- | ---------------------------------------------------- |
| `--spc-color-accent`        | `#8B5CF6`                  | `#7C3AED`                  | Primary accent: buttons, links, active indicators    |
| `--spc-color-accent-hover`  | `#7C4DEE`                  | `#6D28D9`                  | Accent hover state                                   |
| `--spc-color-accent-active` | `#6D28D9`                  | `#5B21B6`                  | Accent pressed/active state                          |
| `--spc-color-accent-subtle` | `rgba(139, 92, 246, 0.15)` | `rgba(124, 58, 237, 0.10)` | Accent background tint (selected items, active tabs) |
| `--spc-color-accent-text`   | `#C4B5FD`                  | `#6D28D9`                  | Accent-colored text (links, labels). ≥ 4.5:1 on bg   |

#### Status

| Token                 | Dark      | Light     | Usage                                 |
| --------------------- | --------- | --------- | ------------------------------------- |
| `--spc-color-success` | `#22C55E` | `#16A34A` | Success messages, positive indicators |
| `--spc-color-warning` | `#F59E0B` | `#D97706` | Warning messages, caution indicators  |
| `--spc-color-error`   | `#EF4444` | `#DC2626` | Errors, destructive actions           |
| `--spc-color-info`    | `#3B82F6` | `#2563EB` | Informational messages                |

#### Interactive States

| Token                       | Dark                        | Light                 | Usage                                 |
| --------------------------- | --------------------------- | --------------------- | ------------------------------------- |
| `--spc-color-hover`         | `rgba(255, 255, 255, 0.06)` | `rgba(0, 0, 0, 0.04)` | Hover overlay on interactive surfaces |
| `--spc-color-active`        | `rgba(255, 255, 255, 0.10)` | `rgba(0, 0, 0, 0.07)` | Active/pressed overlay                |
| `--spc-color-disabled-bg`   | `#1A1A26`                   | `#E8E8EE`             | Disabled element background           |
| `--spc-color-disabled-text` | `#4A4A60`                   | `#A0A0B0`             | Disabled element text                 |
| `--spc-color-focus-ring`    | `#8B5CF6`                   | `#7C3AED`             | Focus outline (matches accent)        |

#### Selection

| Token                        | Dark                       | Light                      | Usage                                             |
| ---------------------------- | -------------------------- | -------------------------- | ------------------------------------------------- |
| `--spc-color-selection-bg`   | `rgba(139, 92, 246, 0.15)` | `rgba(124, 58, 237, 0.10)` | Text selection background (maps to accent-subtle) |
| `--spc-color-selection-text` | `#EDEDF0`                  | `#1A1A28`                  | Text selection foreground (maps to text)          |

#### Skeleton / Loading

| Token                  | Dark      | Light     | Usage                                   |
| ---------------------- | --------- | --------- | --------------------------------------- |
| `--spc-color-skeleton` | `#1E1E2E` | `#E4E4EC` | Loading skeleton placeholder background |

### 2.3 Audio Visualization Colors

These colors are **theme-independent** — they use the same values in both themes to maintain recognition of standard audio conventions.

#### VU Meter

| Token                   | Value     | Usage                                      |
| ----------------------- | --------- | ------------------------------------------ |
| `--spc-color-vu-green`  | `#22C55E` | Signal level: safe (0 dB to −12 dB)        |
| `--spc-color-vu-yellow` | `#FBBF24` | Signal level: warm (−12 dB to −3 dB)       |
| `--spc-color-vu-red`    | `#EF4444` | Signal level: hot/clipping (−3 dB to 0 dB) |
| `--spc-color-vu-bg`     | `#1A1A2A` | VU meter background (consistent dark)      |

VU meter gradient specification for CSS/Canvas:

```
linear-gradient(to top, #22C55E 0%, #22C55E 60%, #FBBF24 60%, #FBBF24 85%, #EF4444 85%, #EF4444 100%)
```

#### Voice Channel Colors

Eight distinct colors for the S-DSP's 8 voice channels. These are designed for colorblind safety: they vary in both hue and luminance, and channels are always labeled with numbers (#0–#7) so color is never the sole differentiator.

| Channel | Token                 | Dark      | Light     | Hue     |
| ------- | --------------------- | --------- | --------- | ------- |
| 0       | `--spc-color-voice-0` | `#60A5FA` | `#2563EB` | Blue    |
| 1       | `--spc-color-voice-1` | `#A78BFA` | `#7C3AED` | Violet  |
| 2       | `--spc-color-voice-2` | `#FB7185` | `#E11D48` | Rose    |
| 3       | `--spc-color-voice-3` | `#FBBF24` | `#D97706` | Amber   |
| 4       | `--spc-color-voice-4` | `#34D399` | `#059669` | Emerald |
| 5       | `--spc-color-voice-5` | `#22D3EE` | `#0891B2` | Cyan    |
| 6       | `--spc-color-voice-6` | `#FB923C` | `#EA580C` | Orange  |
| 7       | `--spc-color-voice-7` | `#F472B6` | `#DB2777` | Pink    |

Dark values are used for indicators, waveform lines, and channel badges on dark backgrounds. Light values are darker variants for legibility on light backgrounds.

Each voice color also has a subtle variant for backgrounds (e.g., mute/solo indicator backgrounds):

| Channel | Token                        |
| ------- | ---------------------------- |
| 0       | `--spc-color-voice-0-subtle` |
| 1       | `--spc-color-voice-1-subtle` |
| 2       | `--spc-color-voice-2-subtle` |
| 3       | `--spc-color-voice-3-subtle` |
| 4       | `--spc-color-voice-4-subtle` |
| 5       | `--spc-color-voice-5-subtle` |
| 6       | `--spc-color-voice-6-subtle` |
| 7       | `--spc-color-voice-7-subtle` |

These are implemented via `color-mix()` in both theme blocks — see §8.2.

#### Waveform

| Token                         | Dark                       | Light                      | Usage                          |
| ----------------------------- | -------------------------- | -------------------------- | ------------------------------ |
| `--spc-color-waveform`        | `#8B5CF6`                  | `#7C3AED`                  | Waveform line (matches accent) |
| `--spc-color-waveform-fill`   | `rgba(139, 92, 246, 0.20)` | `rgba(124, 58, 237, 0.15)` | Waveform area fill             |
| `--spc-color-waveform-cursor` | `#EDEDF0`                  | `#1A1A28`                  | Playback position cursor       |
| `--spc-color-waveform-bg`     | `#161622`                  | `#EDEDF2`                  | Waveform display background    |

### 2.4 Contrast Ratio Verification

All text/background combinations must meet WCAG 2.2 AA minimums. The table below documents verified computed ratios for the primary token pairings.

| Text Token       | Background Token | Dark Ratio | Light Ratio | AA Requirement | Pass  |
| ---------------- | ---------------- | ---------- | ----------- | -------------- | ----- |
| `text`           | `bg`             | 16.44:1    | 15.79:1     | 4.5:1 (normal) | Yes   |
| `text`           | `surface`        | 14.04:1    | 17.18:1     | 4.5:1 (normal) | Yes   |
| `text-secondary` | `bg`             | 6.90:1     | 6.16:1      | 4.5:1 (normal) | Yes   |
| `text-secondary` | `surface`        | 5.89:1     | 6.71:1      | 4.5:1 (normal) | Yes   |
| `text-muted`     | `bg`             | 3.15:1     | 3.63:1      | 3:1 (large)    | Yes\* |
| `accent-text`    | `bg`             | 10.41:1    | 6.53:1      | 4.5:1 (normal) | Yes   |
| `accent-text`    | `surface`        | 8.88:1     | 7.10:1      | 4.5:1 (normal) | Yes   |
| `text-inverse`   | `accent`         | 4.54:1     | 5.24:1      | 4.5:1 (normal) | Yes   |

\*`text-muted` passes AA for large text only (≥ 18px / ≥ 14px bold). Do not use for body-size text conveying essential information.

**Verification process:** These ratios were computed using the WCAG 2.2 relative luminance formula against the specified hex values. Before implementation, re-verify every token pair through a contrast checker (e.g., WebAIM, Chrome DevTools contrast audit). Adjust values if any pair falls below the threshold after any future color changes.

---

## 3. Spacing Scale

Base unit: **4px**. All spacing derives from multiples of 4px.

### Named Scale

| Token            | Value            | Usage                                         |
| ---------------- | ---------------- | --------------------------------------------- |
| `--spc-space-0`  | `0`              | Zero spacing (explicit reset)                 |
| `--spc-space-1`  | `0.25rem` (4px)  | Tight inline spacing (icon-to-label gap)      |
| `--spc-space-2`  | `0.5rem` (8px)   | Default inline spacing, small gaps            |
| `--spc-space-3`  | `0.75rem` (12px) | Compact padding (tags, badges, small buttons) |
| `--spc-space-4`  | `1rem` (16px)    | Default padding (cards, inputs, list items)   |
| `--spc-space-5`  | `1.25rem` (20px) | Medium padding                                |
| `--spc-space-6`  | `1.5rem` (24px)  | Section padding, larger gaps between groups   |
| `--spc-space-8`  | `2rem` (32px)    | Large section spacing, panel padding          |
| `--spc-space-10` | `2.5rem` (40px)  | Page-level vertical spacing                   |
| `--spc-space-12` | `3rem` (48px)    | Major section breaks                          |
| `--spc-space-16` | `4rem` (64px)    | Hero/header spacing                           |

### Semantic Aliases

For quick reference when the numeric scale is unclear:

| Alias             | Maps to                         | When to use                                                  |
| ----------------- | ------------------------------- | ------------------------------------------------------------ |
| `--spc-space-xs`  | `--spc-space-1` (0.25rem / 4px) | Tightest spacing: icon gaps, inline elements                 |
| `--spc-space-sm`  | `--spc-space-2` (0.5rem / 8px)  | Small gaps: between related items, compact lists             |
| `--spc-space-md`  | `--spc-space-4` (1rem / 16px)   | Default: card padding, form field spacing, list item padding |
| `--spc-space-lg`  | `--spc-space-6` (1.5rem / 24px) | Larger gaps: between section groups, panel margins           |
| `--spc-space-xl`  | `--spc-space-8` (2rem / 32px)   | Section-level: between major UI regions                      |
| `--spc-space-2xl` | `--spc-space-12` (3rem / 48px)  | Page-level: top/bottom page margins, major dividers          |

### Usage Guidelines

- **Component internal padding:** `--spc-space-md` (1rem / 16px) is the default. Use `--spc-space-sm` (0.5rem / 8px) for compact components (toolbar buttons, tags).
- **Gap between sibling elements:** `--spc-space-sm` (0.5rem / 8px) for tight lists, `--spc-space-md` (1rem / 16px) for standard lists, `--spc-space-lg` (1.5rem / 24px) for card grids.
- **Touch targets:** Minimum 44×44px interactive area. Use `--spc-space-3` (0.75rem / 12px) padding on a 20px icon to reach 44px, or `--spc-space-2` (0.5rem / 8px) padding on a 28px button label.
- **Don't mix units.** Always use tokens, never raw `px` values in component CSS.

---

## 4. Typography

### 4.1 Font Stacks

```css
--spc-font-sans:
  system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
  'Helvetica Neue', Arial, sans-serif;

--spc-font-mono:
  'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas,
  'Courier New', monospace;
```

**Rationale:** System fonts for zero network cost and native platform feel. No web fonts to download. `system-ui` is listed first for broadest modern browser coverage, followed by per-platform fallbacks. The mono stack supports technical displays (memory viewer, register dumps, hex addresses, BRR sample data).

### 4.2 Type Scale

Modular scale with ~1.25 ratio. All sizes in `rem` for accessibility (respects user font size settings).

| Token                 | Size       | px equiv. | Usage                                        |
| --------------------- | ---------- | --------- | -------------------------------------------- |
| `--spc-font-size-xs`  | `0.75rem`  | 12px      | Labels, badges, timestamps, track duration   |
| `--spc-font-size-sm`  | `0.875rem` | 14px      | Secondary text, table data, sidebar items    |
| `--spc-font-size-md`  | `1rem`     | 16px      | Body text, form inputs, list items (default) |
| `--spc-font-size-lg`  | `1.125rem` | 18px      | Emphasized body, sub-headings                |
| `--spc-font-size-xl`  | `1.25rem`  | 20px      | Section headings (h3)                        |
| `--spc-font-size-2xl` | `1.5rem`   | 24px      | Page sub-headings (h2)                       |
| `--spc-font-size-3xl` | `1.875rem` | 30px      | Page headings (h1)                           |
| `--spc-font-size-4xl` | `2.25rem`  | 36px      | Hero text (rarely used)                      |

### 4.3 Line Heights

| Token                   | Value  | Usage                             |
| ----------------------- | ------ | --------------------------------- |
| `--spc-leading-none`    | `1`    | Single-line labels, icons, badges |
| `--spc-leading-tight`   | `1.25` | Headings, compact UI              |
| `--spc-leading-normal`  | `1.5`  | Body text (default)               |
| `--spc-leading-relaxed` | `1.75` | Long-form text, descriptions      |

### 4.4 Font Weights

| Token                        | Value | Usage                          |
| ---------------------------- | ----- | ------------------------------ |
| `--spc-font-weight-normal`   | `400` | Body text, descriptions        |
| `--spc-font-weight-medium`   | `500` | Labels, button text, nav items |
| `--spc-font-weight-semibold` | `600` | Section headings, emphasis     |
| `--spc-font-weight-bold`     | `700` | Page headings, strong emphasis |

### 4.5 Typographic Pairings

Common text treatments and which tokens to combine:

| Treatment          | Font   | Size  | Weight     | Line Height | Color                           |
| ------------------ | ------ | ----- | ---------- | ----------- | ------------------------------- |
| Page heading       | `sans` | `3xl` | `bold`     | `tight`     | `text`                          |
| Section heading    | `sans` | `xl`  | `semibold` | `tight`     | `text`                          |
| Body text          | `sans` | `md`  | `normal`   | `normal`    | `text`                          |
| Secondary text     | `sans` | `sm`  | `normal`   | `normal`    | `text-secondary`                |
| Label              | `sans` | `sm`  | `medium`   | `none`      | `text-secondary`                |
| Button text        | `sans` | `sm`  | `medium`   | `none`      | `text-inverse` or `accent-text` |
| Track title        | `sans` | `md`  | `medium`   | `tight`     | `text`                          |
| Track metadata     | `sans` | `xs`  | `normal`   | `tight`     | `text-muted`                    |
| Hex/register value | `mono` | `sm`  | `normal`   | `none`      | `text`                          |
| Memory address     | `mono` | `xs`  | `normal`   | `none`      | `text-secondary`                |

---

## 5. Border Radii, Shadows, Z-Index

### 5.1 Border Radii

| Token               | Value    | Usage                                                    |
| ------------------- | -------- | -------------------------------------------------------- |
| `--spc-radius-none` | `0`      | Sharp corners (inline code, table cells)                 |
| `--spc-radius-sm`   | `4px`    | Subtle rounding (tags, badges, small buttons)            |
| `--spc-radius-md`   | `8px`    | Default rounding (cards, inputs, panels)                 |
| `--spc-radius-lg`   | `12px`   | Prominent rounding (dialogs, large cards)                |
| `--spc-radius-xl`   | `16px`   | Feature panels, hero elements                            |
| `--spc-radius-full` | `9999px` | Circles and pills (avatars, toggle thumbs, pill buttons) |

### 5.2 Shadows

Shadows are theme-dependent. Dark backgrounds require more opaque shadows to remain visible; light theme uses softer shadows.

#### Dark Theme Shadows

| Token             | Value                                  | Usage                         |
| ----------------- | -------------------------------------- | ----------------------------- |
| `--spc-shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.40)`        | Subtle depth: buttons, inputs |
| `--spc-shadow-md` | `0 4px 8px -1px rgba(0, 0, 0, 0.50)`   | Cards, dropdown menus         |
| `--spc-shadow-lg` | `0 10px 20px -4px rgba(0, 0, 0, 0.60)` | Popovers, elevated panels     |
| `--spc-shadow-xl` | `0 20px 30px -6px rgba(0, 0, 0, 0.70)` | Modals, dialogs               |

#### Light Theme Shadows

| Token             | Value                                  | Usage            |
| ----------------- | -------------------------------------- | ---------------- |
| `--spc-shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.06)`        | Subtle depth     |
| `--spc-shadow-md` | `0 4px 6px -1px rgba(0, 0, 0, 0.10)`   | Cards, menus     |
| `--spc-shadow-lg` | `0 10px 15px -3px rgba(0, 0, 0, 0.12)` | Popovers, panels |
| `--spc-shadow-xl` | `0 20px 25px -5px rgba(0, 0, 0, 0.15)` | Modals, dialogs  |

### 5.3 Z-Index Layers

A fixed layer system prevents z-index escalation. Every z-index in the codebase must use one of these tokens — never a raw number.

| Token              | Value | Usage                                   |
| ------------------ | ----- | --------------------------------------- |
| `--spc-z-base`     | `0`   | Default stacking context                |
| `--spc-z-raised`   | `10`  | Sticky headers, floating action buttons |
| `--spc-z-dropdown` | `100` | Dropdown menus, select popups           |
| `--spc-z-sticky`   | `200` | Sticky elements (player bar, toolbars)  |
| `--spc-z-overlay`  | `300` | Modal/dialog backdrop overlays          |
| `--spc-z-modal`    | `400` | Modal/dialog content                    |
| `--spc-z-popover`  | `500` | Popovers, floating panels               |
| `--spc-z-toast`    | `600` | Toast notifications                     |
| `--spc-z-tooltip`  | `700` | Tooltips (always on top)                |

**Radix portals:** Radix renders portals (Dialog, Popover, Tooltip, etc.) at the end of `<body>`. Their z-index must use `--spc-z-modal`, `--spc-z-popover`, or `--spc-z-tooltip` respectively to layer correctly. Since Radix portals are siblings in the DOM (not nested), the numeric values establish the correct stacking order.

---

## 6. Breakpoints

Mobile-first responsive design with three breakpoints, per requirements and ADR-0004.

| Name    | Range    | CSS Media Query              | Target                            |
| ------- | -------- | ---------------------------- | --------------------------------- |
| Phone   | < 640px  | (default — no query)         | Phones portrait and landscape     |
| Tablet  | ≥ 640px  | `@media (min-width: 640px)`  | Tablets, small laptops            |
| Desktop | ≥ 1024px | `@media (min-width: 1024px)` | Laptops, desktops, large monitors |

### Integration with CSS Modules

CSS custom properties cannot be used in `@media` query expressions. Breakpoint values are documented constants, not tokens. To maintain consistency across `.module.css` files, create a shared reference file:

```css
/* src/styles/breakpoints.css — reference only, not imported */
/* Phone:   default (no media query needed)                  */
/* Tablet:  @media (min-width: 640px) { ... }                */
/* Desktop: @media (min-width: 1024px) { ... }               */
```

In each component's `.module.css`, write media queries directly:

```css
/* PlayerControls.module.css */
.controls {
  /* Phone layout: single row, stacked */
  flex-direction: column;
  padding: var(--spc-space-sm);
}

@media (min-width: 640px) {
  .controls {
    /* Tablet: horizontal layout */
    flex-direction: row;
    padding: var(--spc-space-md);
  }
}

@media (min-width: 1024px) {
  .controls {
    /* Desktop: spacious layout */
    padding: var(--spc-space-lg);
  }
}
```

### Responsive Token Overrides

Some tokens may benefit from responsive adjustment. These are not automatic — components opt in via media queries. Common patterns:

| Token            | Phone            | Tablet           | Desktop          |
| ---------------- | ---------------- | ---------------- | ---------------- |
| Font size (body) | 16px (1rem)      | 16px (1rem)      | 16px (1rem)      |
| Font size (h1)   | 24px (1.5rem)    | 30px (1.875rem)  | 30px (1.875rem)  |
| Section padding  | `--spc-space-sm` | `--spc-space-md` | `--spc-space-lg` |
| Card padding     | `--spc-space-3`  | `--spc-space-4`  | `--spc-space-4`  |

Body text remains 16px at all breakpoints to prevent iOS auto-zoom on form inputs and to maintain readability.

---

## 7. Motion and Animation

### 7.1 Duration Tokens

| Token                    | Value   | Usage                                            |
| ------------------------ | ------- | ------------------------------------------------ |
| `--spc-duration-instant` | `50ms`  | Immediate feedback (checkbox check, toggle snap) |
| `--spc-duration-fast`    | `100ms` | Hover states, focus rings, small color changes   |
| `--spc-duration-normal`  | `200ms` | Theme transition, panel open/close, tab switch   |
| `--spc-duration-slow`    | `300ms` | Dialog enter/exit, route transitions             |
| `--spc-duration-slower`  | `500ms` | Complex animations (onboarding, page entrance)   |

### 7.2 Easing Functions

| Token                  | Value                               | Usage                                                           |
| ---------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `--spc-easing-default` | `cubic-bezier(0.4, 0, 0.2, 1)`      | General-purpose (Material ease)                                 |
| `--spc-easing-in`      | `cubic-bezier(0.4, 0, 1, 1)`        | Elements exiting/accelerating away                              |
| `--spc-easing-out`     | `cubic-bezier(0, 0, 0.2, 1)`        | Elements entering/decelerating in                               |
| `--spc-easing-in-out`  | `cubic-bezier(0.4, 0, 0.2, 1)`      | Symmetric transitions (currently identical to default)          |
| `--spc-easing-bounce`  | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful overshoot (use sparingly — toggle snaps, notifications) |

> **Note:** `--spc-easing-default` and `--spc-easing-in-out` currently share the same value. They are semantically distinct tokens: `default` is the general-purpose choice, while `in-out` is for explicit symmetric enter/exit transitions. They are kept separate so they can diverge independently if a future design revision calls for a different symmetric curve.

### 7.3 Reduced Motion

Respect `prefers-reduced-motion` by disabling all non-essential animations:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --spc-duration-instant: 0ms;
    --spc-duration-fast: 0ms;
    --spc-duration-normal: 0ms;
    --spc-duration-slow: 0ms;
    --spc-duration-slower: 0ms;
  }
}
```

This zeroes all duration tokens globally, causing CSS transitions using these tokens to resolve instantly. Components don't need conditional logic — the tokens handle it.

**Exceptions:** Audio playback position, VU meter levels, and waveform rendering are functional (not decorative) animations driven by `requestAnimationFrame`, not CSS transitions. These continue operating under `prefers-reduced-motion` because stopping them would remove meaningful real-time information. However, purely decorative VU meter glow effects or waveform fill pulses should check the media query and disable.

### 7.4 Theme Transition

When the theme changes (dark ↔ light), apply a brief transition on `background-color` and `color` properties to avoid a jarring snap:

```css
:root {
  /* This transition is intentionally always-on. It only affects
     background-color and color (the two properties that change during
     theme switches). During normal interaction it has no visible effect
     because these values are stable. The prefers-reduced-motion override
     in §7.3 sets --spc-duration-normal to 0ms, disabling it for users
     who prefer reduced motion. */
  transition:
    background-color var(--spc-duration-normal) var(--spc-easing-default),
    color var(--spc-duration-normal) var(--spc-easing-default);
}
```

This is applied to `:root` only. Individual components inherit the transition behavior through CSS custom property resolution. The `prefers-reduced-motion` override above sets `--spc-duration-normal` to `0ms`, disabling the theme transition for users who prefer reduced motion.

---

## 8. Theme Switching Implementation

### 8.1 Mechanism

Theme switching uses a CSS class on the `<html>` element, per ADR-0004.

| Class on `<html>` | Theme applied |
| ----------------- | ------------- |
| `.dark`           | Dark theme    |
| `.light`          | Light theme   |

Three user-facing states: **Dark**, **Light**, **System** (auto). The "System" option resolves to `.dark` or `.light` at runtime via the blocking `<script>` in `<head>` (see §8.3). A class is always present on `<html>` — there is no "unset" state in the DOM.

> **Note on `data-theme`:** The `dark-light-mode` skill references a `data-theme` attribute convention. The ADR-0004 class-based approach (`.dark`/`.light` on `<html>`) is canonical for this project. Do not use `data-theme`.

### 8.2 CSS Structure

All tokens are defined in a single `tokens.css` file, imported once at the application root.

```css
/* src/styles/tokens.css */

/* ============================================================
   DEFAULT: Dark theme
   Dark is the default because it matches the SNES aesthetic
   and is the more common preference for audio/music apps.
   ============================================================ */
:root {
  /* --- Backgrounds --- */
  --spc-color-bg: #0e0e16;
  --spc-color-bg-subtle: #161622;
  --spc-color-surface: #1e1e2e;
  --spc-color-surface-raised: #282840;
  --spc-color-overlay: rgba(0, 0, 0, 0.6);

  /* --- Text --- */
  --spc-color-text: #ededf0;
  --spc-color-text-secondary: #9999b0;
  --spc-color-text-muted: #606079;
  --spc-color-text-inverse: #0e0e16;

  /* --- Borders --- */
  --spc-color-border: #2e2e44;
  --spc-color-border-subtle: #232338;
  --spc-color-border-strong: #3e3e58;

  /* --- Accent --- */
  --spc-color-accent: #8b5cf6;
  --spc-color-accent-hover: #7c4dee;
  --spc-color-accent-active: #6d28d9;
  --spc-color-accent-subtle: rgba(139, 92, 246, 0.15);
  --spc-color-accent-text: #c4b5fd;

  /* --- Status --- */
  --spc-color-success: #22c55e;
  --spc-color-warning: #f59e0b;
  --spc-color-error: #ef4444;
  --spc-color-info: #3b82f6;

  /* --- Interactive --- */
  --spc-color-hover: rgba(255, 255, 255, 0.06);
  --spc-color-active: rgba(255, 255, 255, 0.1);
  --spc-color-disabled-bg: #1a1a26;
  --spc-color-disabled-text: #4a4a60;
  --spc-color-focus-ring: #8b5cf6;

  /* --- Selection --- */
  --spc-color-selection-bg: rgba(139, 92, 246, 0.15);
  --spc-color-selection-text: #ededf0;

  /* --- Skeleton / Loading --- */
  --spc-color-skeleton: #1e1e2e;

  /* --- Voice Channels --- */
  --spc-color-voice-0: #60a5fa;
  --spc-color-voice-1: #a78bfa;
  --spc-color-voice-2: #fb7185;
  --spc-color-voice-3: #fbbf24;
  --spc-color-voice-4: #34d399;
  --spc-color-voice-5: #22d3ee;
  --spc-color-voice-6: #fb923c;
  --spc-color-voice-7: #f472b6;

  /* --- Voice Channel Subtle Variants --- */
  --spc-color-voice-0-subtle: color-mix(in srgb, #60a5fa 15%, transparent);
  --spc-color-voice-1-subtle: color-mix(in srgb, #a78bfa 15%, transparent);
  --spc-color-voice-2-subtle: color-mix(in srgb, #fb7185 15%, transparent);
  --spc-color-voice-3-subtle: color-mix(in srgb, #fbbf24 15%, transparent);
  --spc-color-voice-4-subtle: color-mix(in srgb, #34d399 15%, transparent);
  --spc-color-voice-5-subtle: color-mix(in srgb, #22d3ee 15%, transparent);
  --spc-color-voice-6-subtle: color-mix(in srgb, #fb923c 15%, transparent);
  --spc-color-voice-7-subtle: color-mix(in srgb, #f472b6 15%, transparent);

  /* --- Audio Visualization (theme-independent) --- */
  --spc-color-vu-green: #22c55e;
  --spc-color-vu-yellow: #fbbf24;
  --spc-color-vu-red: #ef4444;
  --spc-color-vu-bg: #1a1a2a;

  /* --- Waveform --- */
  --spc-color-waveform: #8b5cf6;
  --spc-color-waveform-fill: rgba(139, 92, 246, 0.2);
  --spc-color-waveform-cursor: #ededf0;
  --spc-color-waveform-bg: #161622;

  /* --- Shadows (dark) --- */
  --spc-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --spc-shadow-md: 0 4px 8px -1px rgba(0, 0, 0, 0.5);
  --spc-shadow-lg: 0 10px 20px -4px rgba(0, 0, 0, 0.6);
  --spc-shadow-xl: 0 20px 30px -6px rgba(0, 0, 0, 0.7);

  /* === Non-color tokens (theme-independent) === */

  /* --- Fonts --- */
  --spc-font-sans:
    system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  --spc-font-mono:
    'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas,
    'Courier New', monospace;

  /* --- Font Sizes --- */
  --spc-font-size-xs: 0.75rem;
  --spc-font-size-sm: 0.875rem;
  --spc-font-size-md: 1rem;
  --spc-font-size-lg: 1.125rem;
  --spc-font-size-xl: 1.25rem;
  --spc-font-size-2xl: 1.5rem;
  --spc-font-size-3xl: 1.875rem;
  --spc-font-size-4xl: 2.25rem;

  /* --- Font Weights --- */
  --spc-font-weight-normal: 400;
  --spc-font-weight-medium: 500;
  --spc-font-weight-semibold: 600;
  --spc-font-weight-bold: 700;

  /* --- Line Heights --- */
  --spc-leading-none: 1;
  --spc-leading-tight: 1.25;
  --spc-leading-normal: 1.5;
  --spc-leading-relaxed: 1.75;

  /* --- Spacing --- */
  --spc-space-0: 0;
  --spc-space-1: 0.25rem;
  --spc-space-2: 0.5rem;
  --spc-space-3: 0.75rem;
  --spc-space-4: 1rem;
  --spc-space-5: 1.25rem;
  --spc-space-6: 1.5rem;
  --spc-space-8: 2rem;
  --spc-space-10: 2.5rem;
  --spc-space-12: 3rem;
  --spc-space-16: 4rem;

  /* --- Spacing aliases --- */
  --spc-space-xs: var(--spc-space-1);
  --spc-space-sm: var(--spc-space-2);
  --spc-space-md: var(--spc-space-4);
  --spc-space-lg: var(--spc-space-6);
  --spc-space-xl: var(--spc-space-8);
  --spc-space-2xl: var(--spc-space-12);

  /* --- Border Radii --- */
  --spc-radius-none: 0;
  --spc-radius-sm: 4px;
  --spc-radius-md: 8px;
  --spc-radius-lg: 12px;
  --spc-radius-xl: 16px;
  --spc-radius-full: 9999px;

  /* --- Z-Index --- */
  --spc-z-base: 0;
  --spc-z-raised: 10;
  --spc-z-dropdown: 100;
  --spc-z-sticky: 200;
  --spc-z-overlay: 300;
  --spc-z-modal: 400;
  --spc-z-popover: 500;
  --spc-z-toast: 600;
  --spc-z-tooltip: 700;

  /* --- Motion --- */
  --spc-duration-instant: 50ms;
  --spc-duration-fast: 100ms;
  --spc-duration-normal: 200ms;
  --spc-duration-slow: 300ms;
  --spc-duration-slower: 500ms;

  --spc-easing-default: cubic-bezier(0.4, 0, 0.2, 1);
  --spc-easing-in: cubic-bezier(0.4, 0, 1, 1);
  --spc-easing-out: cubic-bezier(0, 0, 0.2, 1);
  /* Same curve as --spc-easing-default today. Kept as a separate semantic
     token so symmetric enter/exit transitions can diverge from the
     general-purpose default independently in a future revision. */
  --spc-easing-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --spc-easing-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* --- Theme transition ---
     Intentionally always-on. Only background-color and color are
     transitioned — during normal interaction these values are stable so
     the transition has no visible effect. It activates only when the
     theme class changes. prefers-reduced-motion zeroes --spc-duration-normal,
     disabling this for users who prefer reduced motion. */
  transition:
    background-color var(--spc-duration-normal) var(--spc-easing-default),
    color var(--spc-duration-normal) var(--spc-easing-default);
}

/* ============================================================
   LIGHT THEME
   Applied via .light class on <html>. The blocking <script> in
   <head> always sets .dark or .light, so no @media fallback is
   needed (see §8.3).
   ============================================================ */
:root.light {
  /* --- Backgrounds --- */
  --spc-color-bg: #f5f5f8;
  --spc-color-bg-subtle: #ededf2;
  --spc-color-surface: #ffffff;
  --spc-color-surface-raised: #ffffff;
  --spc-color-overlay: rgba(0, 0, 0, 0.4);

  /* --- Text --- */
  --spc-color-text: #1a1a28;
  --spc-color-text-secondary: #5a5a70;
  --spc-color-text-muted: #7e7e96;
  --spc-color-text-inverse: #f5f5f8;

  /* --- Borders --- */
  --spc-color-border: #d4d4dc;
  --spc-color-border-subtle: #e4e4ec;
  --spc-color-border-strong: #b4b4c4;

  /* --- Accent --- */
  --spc-color-accent: #7c3aed;
  --spc-color-accent-hover: #6d28d9;
  --spc-color-accent-active: #5b21b6;
  --spc-color-accent-subtle: rgba(124, 58, 237, 0.1);
  --spc-color-accent-text: #6d28d9;

  /* --- Status --- */
  --spc-color-success: #16a34a;
  --spc-color-warning: #d97706;
  --spc-color-error: #dc2626;
  --spc-color-info: #2563eb;

  /* --- Interactive --- */
  --spc-color-hover: rgba(0, 0, 0, 0.04);
  --spc-color-active: rgba(0, 0, 0, 0.07);
  --spc-color-disabled-bg: #e8e8ee;
  --spc-color-disabled-text: #a0a0b0;
  --spc-color-focus-ring: #7c3aed;

  /* --- Selection --- */
  --spc-color-selection-bg: rgba(124, 58, 237, 0.1);
  --spc-color-selection-text: #1a1a28;

  /* --- Skeleton / Loading --- */
  --spc-color-skeleton: #e4e4ec;

  /* --- Voice Channels --- */
  --spc-color-voice-0: #2563eb;
  --spc-color-voice-1: #7c3aed;
  --spc-color-voice-2: #e11d48;
  --spc-color-voice-3: #d97706;
  --spc-color-voice-4: #059669;
  --spc-color-voice-5: #0891b2;
  --spc-color-voice-6: #ea580c;
  --spc-color-voice-7: #db2777;

  /* --- Voice Channel Subtle Variants --- */
  --spc-color-voice-0-subtle: color-mix(in srgb, #2563eb 15%, transparent);
  --spc-color-voice-1-subtle: color-mix(in srgb, #7c3aed 15%, transparent);
  --spc-color-voice-2-subtle: color-mix(in srgb, #e11d48 15%, transparent);
  --spc-color-voice-3-subtle: color-mix(in srgb, #d97706 15%, transparent);
  --spc-color-voice-4-subtle: color-mix(in srgb, #059669 15%, transparent);
  --spc-color-voice-5-subtle: color-mix(in srgb, #0891b2 15%, transparent);
  --spc-color-voice-6-subtle: color-mix(in srgb, #ea580c 15%, transparent);
  --spc-color-voice-7-subtle: color-mix(in srgb, #db2777 15%, transparent);

  /* --- Waveform --- */
  --spc-color-waveform: #7c3aed;
  --spc-color-waveform-fill: rgba(124, 58, 237, 0.15);
  --spc-color-waveform-cursor: #1a1a28;
  --spc-color-waveform-bg: #ededf2;

  /* --- Shadows (light) --- */
  --spc-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --spc-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --spc-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.12);
  --spc-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
}

/* ============================================================
   REDUCED MOTION
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  :root {
    --spc-duration-instant: 0ms;
    --spc-duration-fast: 0ms;
    --spc-duration-normal: 0ms;
    --spc-duration-slow: 0ms;
    --spc-duration-slower: 0ms;
  }
}

/* ============================================================
   HIGH CONTRAST
   Increase contrast for users who request it.
   ============================================================ */
@media (prefers-contrast: more) {
  :root {
    --spc-color-border: #4e4e68;
    --spc-color-border-subtle: #3e3e58;
    --spc-color-text-secondary: #b0b0c8;
    --spc-color-text-muted: #8888a0;
    /* Widen focus ring for increased visibility */
    --spc-focus-ring-width: 3px;
  }

  :root.light {
    --spc-color-border: #9a9ab0;
    --spc-color-border-subtle: #b0b0c0;
    --spc-color-text-secondary: #444458;
    --spc-color-text-muted: #666678;
    /* Widen focus ring for increased visibility */
    --spc-focus-ring-width: 3px;
  }
}
```

### 8.3 FOWT Prevention

Flash of wrong theme is prevented by a blocking inline `<script>` in `index.html` that runs before React hydration. Per ADR-0004 and ADR-0005:

1. On every theme change, the Zustand settings slice writes the preference to IndexedDB (async, via `persist` middleware) **and** mirrors it to `localStorage` (sync).
2. A blocking `<script>` in `<head>` reads `localStorage` and applies the class before first paint. If no preference is stored ("System" mode), the script checks `matchMedia('(prefers-color-scheme: light)')` and sets the appropriate class. A class is always set — there is no CSS `@media` fallback.

```html
<!-- index.html — in <head>, before any stylesheet or app script -->
<script>
  (function () {
    var theme = localStorage.getItem('spc-theme');
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.classList.add(theme);
    } else {
      // No stored preference ("System" mode). Resolve from OS preference.
      // Default to dark (the SNES aesthetic default) if matchMedia is
      // unavailable or does not match light.
      var preferLight =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: light)').matches;
      document.documentElement.classList.add(preferLight ? 'light' : 'dark');
    }
  })();
</script>
```

**localStorage key:** `spc-theme`
**Possible values:** `'dark'`, `'light'`, or absent (system preference — resolved at runtime by the script above)

The Zustand settings slice mirrors every theme change:

```typescript
// In the settings slice's setTheme action:
if (theme === 'system') {
  localStorage.removeItem('spc-theme');
  // Re-resolve from OS preference and apply class immediately
  const preferLight = window.matchMedia(
    '(prefers-color-scheme: light)',
  ).matches;
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(preferLight ? 'light' : 'dark');
} else {
  localStorage.setItem('spc-theme', theme);
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(theme);
}
```

### 8.4 System Preference Listener

When the user selects "System" theme, the app listens for OS-level changes and updates the class on `<html>`:

```typescript
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', (e) => {
  // Only respond if user preference is 'system' (no stored theme)
  const stored = localStorage.getItem('spc-theme');
  if (!stored) {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(e.matches ? 'dark' : 'light');
  }
});
```

Because a class is always present on `<html>`, the CSS needs only `:root` (dark default) and `:root.light` selectors — no `@media (prefers-color-scheme)` fallback in `tokens.css`.

---

## 9. Radix UI Integration

### 9.1 Design Token Consumption

Radix components are unstyled. They expose data attributes (`data-state`, `data-side`, `data-orientation`, etc.) that CSS Modules target. All visual styling comes from the design tokens defined above.

#### Pattern: Styling a Radix Component

```css
/* Dialog.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: var(--spc-color-overlay);
  z-index: var(--spc-z-overlay);
  animation: fadeIn var(--spc-duration-slow) var(--spc-easing-out);
}

.overlay[data-state='closed'] {
  animation: fadeOut var(--spc-duration-normal) var(--spc-easing-in);
}

.content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--spc-color-surface);
  border: 1px solid var(--spc-color-border);
  border-radius: var(--spc-radius-lg);
  padding: var(--spc-space-lg);
  box-shadow: var(--spc-shadow-xl);
  z-index: var(--spc-z-modal);
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
}

.content[data-state='open'] {
  animation: dialogIn var(--spc-duration-slow) var(--spc-easing-out);
}

.content[data-state='closed'] {
  animation: dialogOut var(--spc-duration-normal) var(--spc-easing-in);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes dialogOut {
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
}
```

```tsx
// Dialog component (React)
import { Dialog } from 'radix-ui';
import styles from './Dialog.module.css';

export function AppDialog({ trigger, title, children }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title>{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

### 9.2 Common Radix Styling Patterns

#### Slider (Volume, Speed, ADSR Parameters)

```css
/* Slider.module.css */
.track {
  position: relative;
  display: flex;
  align-items: center;
  height: 6px;
  background: var(--spc-color-bg-subtle);
  border-radius: var(--spc-radius-full);
  flex-grow: 1;
}

.range {
  position: absolute;
  height: 100%;
  background: var(--spc-color-accent);
  border-radius: var(--spc-radius-full);
}

.thumb {
  display: block;
  width: 16px;
  height: 16px;
  background: var(--spc-color-accent);
  border: 2px solid var(--spc-color-surface);
  border-radius: var(--spc-radius-full);
  box-shadow: var(--spc-shadow-sm);
  transition: transform var(--spc-duration-fast) var(--spc-easing-default);
}

.thumb:hover {
  transform: scale(1.15);
}

.thumb:focus-visible {
  outline: 2px solid var(--spc-color-focus-ring);
  outline-offset: 2px;
}

/* Ensure 44px touch target */
.thumb::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 44px;
}
```

#### Toggle (Mute/Solo Buttons)

```css
/* Toggle.module.css */
.toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: var(--spc-space-2);
  border-radius: var(--spc-radius-sm);
  color: var(--spc-color-text-secondary);
  background: transparent;
  border: 1px solid var(--spc-color-border);
  font-size: var(--spc-font-size-sm);
  font-weight: var(--spc-font-weight-medium);
  cursor: pointer;
  transition:
    background var(--spc-duration-fast) var(--spc-easing-default),
    color var(--spc-duration-fast) var(--spc-easing-default);
}

.toggle:hover {
  background: var(--spc-color-hover);
}

.toggle[data-state='on'] {
  background: var(--spc-color-accent-subtle);
  color: var(--spc-color-accent-text);
  border-color: var(--spc-color-accent);
}

.toggle:focus-visible {
  outline: 2px solid var(--spc-color-focus-ring);
  outline-offset: 2px;
}

.toggle:disabled {
  background: var(--spc-color-disabled-bg);
  color: var(--spc-color-disabled-text);
  cursor: not-allowed;
}
```

#### Tabs (Analysis Sub-Tabs)

```css
/* Tabs.module.css */
.list {
  display: flex;
  gap: var(--spc-space-1);
  border-bottom: 1px solid var(--spc-color-border-subtle);
  padding: 0 var(--spc-space-md);
}

.trigger {
  padding: var(--spc-space-2) var(--spc-space-4);
  font-size: var(--spc-font-size-sm);
  font-weight: var(--spc-font-weight-medium);
  color: var(--spc-color-text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition:
    color var(--spc-duration-fast) var(--spc-easing-default),
    border-color var(--spc-duration-fast) var(--spc-easing-default);
}

.trigger:hover {
  color: var(--spc-color-text);
}

.trigger[data-state='active'] {
  color: var(--spc-color-accent-text);
  border-bottom-color: var(--spc-color-accent);
}

.trigger:focus-visible {
  outline: 2px solid var(--spc-color-focus-ring);
  outline-offset: -2px;
}

.content {
  padding: var(--spc-space-md);
}
```

### 9.3 Override Strategy

Radix components ship with no default styles, so "overriding" is not the concern — **initial styling** is. The strategy is:

1. **Every Radix component gets a co-located `.module.css` file.** This file contains all styles for that component's visual appearance, using design tokens exclusively.
2. **State styling uses `[data-state]` attribute selectors.** Never apply state classes manually — let Radix manage `data-state="open"`, `data-state="checked"`, `data-state="active"`, etc.
3. **Portal z-index uses tokens.** Radix portals render at end of `<body>`. CSS Modules for portal content use `--spc-z-modal`, `--spc-z-popover`, `--spc-z-tooltip` as appropriate.
4. **Focus styles are explicit.** Use `:focus-visible` (not `:focus`) with `--spc-color-focus-ring`. Never rely on browser defaults.
5. **Animation timing uses tokens.** All `animation-duration` and `transition-duration` values reference `--spc-duration-*` tokens, ensuring `prefers-reduced-motion` zeroing works globally.

### 9.4 Focus Ring Specification

All interactive elements (Radix and custom) use a consistent focus indicator:

```css
.interactive:focus-visible {
  outline: var(--spc-focus-ring-width, 2px) solid var(--spc-color-focus-ring);
  outline-offset: 2px;
}
```

- **Width:** 2px default, 3px under `prefers-contrast: more` (via `--spc-focus-ring-width`)
- **Style:** solid
- **Color:** accent purple (`--spc-color-focus-ring`)
- **Offset:** 2px from the element edge
- **Selector:** `:focus-visible` (keyboard focus only, not mouse clicks)

---

## 10. Token File Organization

### File Structure

```
src/
  styles/
    tokens.css          ← All custom properties (the CSS from §8.2)
    reset.css           ← CSS reset / normalize
    global.css          ← Imports tokens.css + reset.css, sets body defaults
```

### Import Order

`global.css` is imported once at the application entry point (`main.tsx`):

```typescript
// src/main.tsx
import './styles/global.css';
// ... React app initialization
```

Component `.module.css` files reference tokens via `var(--spc-*)` — no explicit import needed because custom properties cascade from `:root`.

### Global CSS (`global.css`)

```css
@import './reset.css';
@import './tokens.css';

body {
  font-family: var(--spc-font-sans);
  font-size: var(--spc-font-size-md);
  font-weight: var(--spc-font-weight-normal);
  line-height: var(--spc-leading-normal);
  color: var(--spc-color-text);
  background-color: var(--spc-color-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* Firefox scrollbar styling */
  scrollbar-color: var(--spc-color-border) var(--spc-color-bg-subtle);
  scrollbar-width: thin;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

/* Text selection */
::selection {
  background: var(--spc-color-selection-bg);
  color: var(--spc-color-selection-text);
}

/* Scrollbar styling for WebKit browsers (Chrome, Safari, Edge) */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--spc-color-bg-subtle);
}

::-webkit-scrollbar-thumb {
  background: var(--spc-color-border);
  border-radius: var(--spc-radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--spc-color-border-strong);
}
```

---

## 11. Quick Reference: Complete Token Index

All CSS custom properties in one table for scanning.

### Colors (theme-dependent)

| Token                                                             | Category    |
| ----------------------------------------------------------------- | ----------- |
| `--spc-color-bg`                                                  | Background  |
| `--spc-color-bg-subtle`                                           | Background  |
| `--spc-color-surface`                                             | Background  |
| `--spc-color-surface-raised`                                      | Background  |
| `--spc-color-overlay`                                             | Background  |
| `--spc-color-text`                                                | Text        |
| `--spc-color-text-secondary`                                      | Text        |
| `--spc-color-text-muted`                                          | Text        |
| `--spc-color-text-inverse`                                        | Text        |
| `--spc-color-selection-bg`                                        | Selection   |
| `--spc-color-selection-text`                                      | Selection   |
| `--spc-color-skeleton`                                            | Loading     |
| `--spc-color-border`                                              | Border      |
| `--spc-color-border-subtle`                                       | Border      |
| `--spc-color-border-strong`                                       | Border      |
| `--spc-color-accent`                                              | Accent      |
| `--spc-color-accent-hover`                                        | Accent      |
| `--spc-color-accent-active`                                       | Accent      |
| `--spc-color-accent-subtle`                                       | Accent      |
| `--spc-color-accent-text`                                         | Accent      |
| `--spc-color-success`                                             | Status      |
| `--spc-color-warning`                                             | Status      |
| `--spc-color-error`                                               | Status      |
| `--spc-color-info`                                                | Status      |
| `--spc-color-hover`                                               | Interactive |
| `--spc-color-active`                                              | Interactive |
| `--spc-color-disabled-bg`                                         | Interactive |
| `--spc-color-disabled-text`                                       | Interactive |
| `--spc-color-focus-ring`                                          | Interactive |
| `--spc-color-voice-0` through `--spc-color-voice-7`               | Audio       |
| `--spc-color-voice-0-subtle` through `--spc-color-voice-7-subtle` | Audio       |
| `--spc-color-waveform`                                            | Audio       |
| `--spc-color-waveform-fill`                                       | Audio       |
| `--spc-color-waveform-cursor`                                     | Audio       |
| `--spc-color-waveform-bg`                                         | Audio       |
| `--spc-shadow-sm`                                                 | Shadow      |
| `--spc-shadow-md`                                                 | Shadow      |
| `--spc-shadow-lg`                                                 | Shadow      |
| `--spc-shadow-xl`                                                 | Shadow      |

### Colors (theme-independent)

| Token                   | Category |
| ----------------------- | -------- |
| `--spc-color-vu-green`  | Audio    |
| `--spc-color-vu-yellow` | Audio    |
| `--spc-color-vu-red`    | Audio    |
| `--spc-color-vu-bg`     | Audio    |

### Non-Color Tokens (theme-independent)

| Token                                                    | Value                                                 |
| -------------------------------------------------------- | ----------------------------------------------------- |
| `--spc-font-sans`                                        | System sans-serif stack (system-ui first)             |
| `--spc-font-mono`                                        | System monospace stack                                |
| `--spc-font-size-xs`                                     | `0.75rem`                                             |
| `--spc-font-size-sm`                                     | `0.875rem`                                            |
| `--spc-font-size-md`                                     | `1rem`                                                |
| `--spc-font-size-lg`                                     | `1.125rem`                                            |
| `--spc-font-size-xl`                                     | `1.25rem`                                             |
| `--spc-font-size-2xl`                                    | `1.5rem`                                              |
| `--spc-font-size-3xl`                                    | `1.875rem`                                            |
| `--spc-font-size-4xl`                                    | `2.25rem`                                             |
| `--spc-font-weight-normal`                               | `400`                                                 |
| `--spc-font-weight-medium`                               | `500`                                                 |
| `--spc-font-weight-semibold`                             | `600`                                                 |
| `--spc-font-weight-bold`                                 | `700`                                                 |
| `--spc-leading-none`                                     | `1`                                                   |
| `--spc-leading-tight`                                    | `1.25`                                                |
| `--spc-leading-normal`                                   | `1.5`                                                 |
| `--spc-leading-relaxed`                                  | `1.75`                                                |
| `--spc-space-0` through `--spc-space-16`                 | `0` to `4rem`                                         |
| `--spc-space-xs` through `--spc-space-2xl`               | Aliases                                               |
| `--spc-radius-none` through `--spc-radius-full`          | `0` to `9999px`                                       |
| `--spc-z-base` through `--spc-z-tooltip`                 | `0` to `700`                                          |
| `--spc-duration-instant` through `--spc-duration-slower` | `50ms` to `500ms`                                     |
| `--spc-easing-default` through `--spc-easing-bounce`     | Cubic bezier values                                   |
| `--spc-focus-ring-width`                                 | `2px` (default), `3px` under `prefers-contrast: more` |
