---
name: accessibility
description: WCAG 2.2 AA compliance, ARIA patterns, keyboard navigation, and screen reader support.
---

# Accessibility

Use this skill when building or reviewing UI components for accessibility compliance. Use Context7 for current WCAG and ARIA documentation.

## Standards

- WCAG 2.2 AA compliance minimum.
- Follow WAI-ARIA Authoring Practices for complex widgets.

## Semantic HTML First

- Use `<button>` for actions, not `<div onClick>`.
- Use `<nav>`, `<main>`, `<section>`, `<header>`, `<footer>` for structure.
- Use `<h1>`–`<h6>` in correct hierarchy.
- Use `<ul>`/`<ol>` for lists.
- Use `<label>` associated with form controls.

## ARIA Guidelines

- Don't use ARIA when semantic HTML suffices.
- `aria-label` for elements that lack visible text (icon buttons).
- `aria-live` for dynamic content updates (playback position, status messages).
- `role` attributes for custom widgets (slider, tablist, toolbar).
- `aria-expanded`, `aria-selected`, `aria-pressed` for toggle states.
- `aria-describedby` for supplementary information.

## Keyboard Navigation

- All interactive elements reachable via Tab.
- Logical tab order (follows visual layout).
- Arrow keys for navigation within composite widgets (tabs, toolbars, lists).
- Escape to close modals, dropdowns, popovers.
- Space/Enter to activate buttons and links.
- Custom shortcuts documented and discoverable.

## Focus Management

- Focus moves to new content on route changes (skip to main content).
- Focus trapped in modal dialogs.
- Focus restored to trigger element when modal closes.
- Visible focus indicator (not just browser default — custom styled).
- Never remove focus outline without providing an alternative.

## Color and Visual

- Contrast ratio: 4.5:1 for normal text, 3:1 for large text (both themes).
- Don't convey information by color alone (add icon, text, or pattern).
- Respect `prefers-reduced-motion`: disable or simplify animations.
- Respect `prefers-contrast`: use high-contrast values when requested.

## Audio-Specific

- Transport controls announced by screen readers (e.g., "Play button", "Mute track 3, currently unmuted").
- Slider values announced (volume: 75%, speed: 1.5x).
- Visual-only indicators (VU meters, waveforms) have text alternatives or are marked decorative.
