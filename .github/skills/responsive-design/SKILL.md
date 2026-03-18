---
name: responsive-design
description: Responsive layout patterns, breakpoints, touch targets, and viewport adaptation strategies.
---

# Responsive Design

Use this skill when designing or implementing layouts that adapt to different screen sizes and input methods.

## Breakpoints

| Name | Range | Target Devices |
| ---- | ----- | -------------- |
| Phone | < 640px | Mobile phones (portrait and landscape) |
| Tablet | 640–1024px | Tablets, small laptops |
| Desktop | > 1024px | Laptops, desktops, large monitors |

## Layout Strategy

- Mobile-first: start with the phone layout, enhance for larger screens.
- Use CSS Grid or Flexbox. Avoid fixed widths.
- Key breakpoint transitions:
  - **Phone**: single-column, bottom navigation, full-width player.
  - **Tablet**: two-column (sidebar + main), larger controls.
  - **Desktop**: multi-panel (sidebar, main player, detail panel), keyboard-centric.

## Touch Considerations

- Minimum touch target: 44×44px (Apple HIG) / 48×48dp (Material).
- Spacing between touch targets: at least 8px gap.
- No hover-dependent interactions. Use tap/long-press instead.
- Support swipe gestures where natural (swipe to dismiss, swipe between tracks).
- Consider thumb zones: primary actions near bottom of screen on phones.

## Platform Adaptations

- **iOS**: safe area insets (notch, home indicator), viewport-fit=cover.
- **Android**: system back gesture compatibility, status bar coloring.
- **Desktop**: scrollbar styling, hover states, right-click context menus.

## Typography

- Use relative units (`rem`, `em`) not fixed pixels for text.
- Minimum body text: 16px equivalent on mobile (prevents iOS zoom).
- Scale headings proportionally across breakpoints.

## Images and Icons

- Use SVG for icons (resolution-independent).
- Responsive images with `srcset` where applicable.
- Icon sizes scale with touch target requirements.

## Testing

- Test at each breakpoint and at intermediate sizes.
- Test landscape orientation on phones and tablets.
- Test with different system font sizes (accessibility zoom).
- Use Chrome DevTools device emulation and real devices.
