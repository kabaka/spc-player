---
name: deep-linking
description: URL routing, state serialization, and shareable deep links for SPC Player.
---

# Deep Linking

Use this skill when implementing URL-based navigation, shareable links, or browser history integration.

## URL Structure

Design clean, human-readable URLs:

```
/                           → Home / file picker
/play?src=url               → Play SPC from a URL
/play#local:id              → Play SPC from local IndexedDB
/play?src=url&t=30          → Start at 30 seconds
/play?src=url&ch=1,2,5      → Mute all channels except 1, 2, 5
```

- Use query parameters for shareable state (source URL, start time).
- Use hash fragments for local-only state (IndexedDB references).
- Keep URLs short and readable.

## State Serialization

Encode playback state in the URL so links can reproduce a specific configuration:

| Parameter | Type   | Description                            |
| --------- | ------ | -------------------------------------- |
| `src`     | URL    | Remote SPC file URL                    |
| `t`       | number | Start time in seconds                  |
| `ch`      | string | Active channels (comma-separated: 1-8) |
| `vol`     | number | Volume (0-100)                         |
| `speed`   | number | Playback speed (percentage)            |

### Rules

- Only include parameters that differ from defaults.
- URL-encode special characters properly.
- Validate all parameters from URLs — they are untrusted user input.
- Reject malformed or suspicious URLs.

## History API

```typescript
// Push state when user navigates
history.pushState({ src, time }, '', buildUrl(state));

// Handle back/forward
window.addEventListener('popstate', (e) => {
  if (e.state) {
    loadState(e.state);
  }
});
```

- Push state on meaningful navigation events (load new file, not on every time update).
- Replace state for minor changes (volume, seek position on pause).

## Initial Load

On page load:

1. Parse the URL for parameters.
2. Validate all parameters.
3. If `src` is present, fetch and play the SPC file.
4. If no parameters, show the file picker / home screen.

## Security

- Never auto-fetch arbitrary URLs without user consent or CORS validation.
- Sanitize all URL parameters before use.
- Do not include sensitive data in URLs.
- Validate that `src` URLs point to expected domains or are user-confirmed.
