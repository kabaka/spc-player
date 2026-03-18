---
name: ux-design
description: Interaction design patterns, information architecture, visual hierarchy, and component UX for web applications.
---

# UX Design

Use this skill when designing interactions, layouts, navigation, and component behavior.

## Design Process

1. **Define the user goal**: what are they trying to accomplish?
2. **Map the flow**: steps from goal to completion.
3. **Minimize friction**: reduce steps, clicks, and cognitive load.
4. **Handle errors**: what happens when something goes wrong?
5. **Consider edge cases**: empty states, loading states, error states, first-run experience.

## Information Architecture

- Group related controls together.
- Use progressive disclosure: show common actions first, advanced options on demand.
- Navigation should reflect the user's mental model, not the code architecture.
- Consistent placement: same type of action in the same location across views.

## Visual Hierarchy

- Size and weight signal importance: primary actions are prominent, secondary are subtle.
- Proximity groups related items.
- Contrast draws attention to active/important elements.
- Whitespace prevents overwhelm and creates rhythm.

## Interaction Patterns

- Direct manipulation where possible (drag to reorder, click to toggle).
- Immediate feedback for every action (loading indicator, success confirmation, error message).
- Undo over confirmation dialogs for reversible actions.
- Keyboard shortcuts for frequent actions with discoverability (tooltip, help overlay).

## State Design

Every interactive element has multiple states to consider:

- **Default**: normal appearance.
- **Hover**: cursor feedback (desktop).
- **Active/Pressed**: click/tap feedback.
- **Focused**: keyboard focus ring.
- **Disabled**: clearly non-interactive.
- **Loading**: activity indicator.
- **Error**: error message with recovery action.
- **Empty**: helpful messaging when no content exists.

## Responsive Behavior

- Design for the smallest target first (mobile), then enhance for larger screens.
- Touch targets: minimum 44×44px.
- Avoid hover-dependent interactions on mobile.
- Consider thumb zones for bottom navigation on phones.
