---
status: 'accepted'
date: 2026-03-22
---

# Procedural SNES Cartridge Placeholder for Cover Art with Optional RetroArch Integration

## Context and Problem Statement

SPC files do not contain embedded album art. Music players conventionally display cover art alongside the currently playing track — it provides visual identity, helps users distinguish tracks, and makes the player feel complete. SPC Player needs a strategy for displaying cover art in the VisualizationStage "Art" tab and potentially in the playlist sidebar.

Where should cover art come from, given that SPC files have no embedded images, the application is an offline-first PWA, and the user base spans casual listeners to retro audiophiles?

## Decision Drivers

- **Offline-first architecture** — SPC Player is a PWA that must function fully without network access; cover art should be available offline without prior setup
- **Zero-configuration default** — users should see meaningful visual identity for every track immediately, without configuring external services or uploading images
- **Privacy preservation** — no external API calls, tracking, or data transmission without explicit user opt-in
- **Deterministic rendering** — the same track should always produce the same visual, creating a consistent experience across sessions and devices
- **Performance** — cover art rendering must not impact audio playback or visualization frame budgets
- **No API key dependencies** — external services requiring API keys create onboarding friction and maintenance burden for a client-side application
- **CORS compatibility** — external image fetching from a client-side app must work without a proxy server
- **Storage efficiency** — cover art should not consume excessive IndexedDB space, especially for users with large SPC libraries

## Considered Options

- **Option 1: Procedural placeholder** — Canvas-drawn SNES cartridge with title-based color variation
- **Option 2: IGDB / MobyGames API integration** — External game database lookup for box art
- **Option 3: RetroArch thumbnail repository integration** — GitHub-hosted game box art from the libretro project
- **Option 4: User-uploaded cover art** — Manual image assignment stored in IndexedDB
- **Option 5: No cover art** — Leave the space blank or show a generic icon

## Decision Outcome

Chosen option: **"Procedural placeholder" (Option 1)** as the default cover art, because it satisfies all decision drivers without external dependencies, network requests, or user configuration. Every track gets a unique, deterministic visual identity derived from its game title, rendered instantly on the client with zero network cost.

**Also decided:** RetroArch thumbnail integration (Option 3) is deferred to Phase F as an opt-in feature. User-uploaded cover art (Option 4) may be added later as a complementary feature. IGDB/MobyGames integration (Option 2) is rejected.

### Procedural Placeholder Design

The placeholder renders a stylized SNES cartridge using Canvas 2D (ADR-0020):

1. **Cartridge shape** — a rounded rectangle with the characteristic SNES cartridge profile: label area occupying the upper two-thirds, connector pin silhouette along the bottom edge. Rendered with `fillRect()`, `roundRect()`, and `beginPath()`/`lineTo()` for the pin detail.

2. **Color derivation** — a deterministic hash of the game title string (e.g., simple `hashCode` → modular index into the 8-voice color palette) selects the primary cartridge color. The label area uses a lighter or darker variant. This ensures the same game always produces the same cartridge color, and different games are visually distinct.

3. **Title text** — the game title is rendered in `--spc-font-mono` centered on the cartridge label area. Font size is automatically calculated to fit the available width, with a minimum readable size and ellipsis truncation for very long titles.

4. **Rendering lifecycle** — the placeholder is generated once at track load time (or when the Art tab is first activated for a track) and cached as an `ImageBitmap` or offscreen canvas. No per-frame rendering cost. The cached image is discarded when the track changes.

5. **Size** — rendered at 240×240 CSS pixels (480×480 physical at 2× DPR). On mobile, displayed at 80×80 CSS pixels, downscaled from the same cached render.

### RetroArch Integration (Deferred to Phase F)

RetroArch maintains a large collection of SNES game box art in the `libretro-thumbnails` GitHub repository:

- **Repository**: `libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System`
- **Path pattern**: `Named_Boxarts/{Game Title}.png`
- **Access**: raw.githubusercontent.com (no API key, no rate limit for reasonable usage)

This will be implemented as an **opt-in** feature in Phase F:

- Disabled by default in Settings > Privacy.
- When enabled, the application fetches box art from GitHub's raw content CDN.
- A privacy disclosure explains: game titles are sent to GitHub to fetch images.
- Fetched images are cached in IndexedDB for offline use.
- Title matching requires fuzzy matching (SPC tag titles vs. RetroArch's naming convention).

This is deferred because: the binary downloads are large (PNG box art images), the GitHub raw URL is an external dependency that could change, and title matching requires a fuzzy matching implementation that adds scope.

### Consequences

- Good, because every track has a unique visual identity from the moment it loads — no blank spaces, no "missing art" states, no configuration required.
- Good, because the procedural placeholder works fully offline with zero network requests, aligning with the PWA's offline-first architecture.
- Good, because the deterministic hash-based coloring means the same game always looks the same — users develop visual memory for their library.
- Good, because rendering cost is negligible — one canvas draw at track load time, then a cached bitmap blit per frame (equivalent to drawing a static image).
- Good, because no external API keys, accounts, rate limits, or CORS configuration are needed for the default experience.
- Good, because no user data (game titles, listening habits) is transmitted to any external service by default.
- Good, because the SNES cartridge shape adds thematic personality that resonates with the retro gaming audience, rather than being a generic placeholder.
- Bad, because procedurally generated art is less visually appealing than actual game box art — users who care about aesthetics will want real artwork.
- Bad, because the hash-to-color mapping has only 8 distinct base colors (the voice palette), so some games will share the same cartridge color. Title text differentiates them, but the color space is limited.
- Bad, because the cartridge rendering code adds implementation surface (~100–150 lines of canvas drawing code) for what is essentially a fallback.
- Bad, because deferring RetroArch integration to Phase F means the full cover art experience is not available at initial release.

### Confirmation

- Implement the `CoverArtRenderer` and verify it produces visually distinct placeholders for at least 10 different game titles (different colors, readable text).
- Verify that the placeholder renders correctly at both 240×240 (desktop) and 80×80 (mobile) display sizes.
- Verify that the same game title always produces the identical placeholder image across page reloads and different browsers (deterministic rendering).
- Verify that no network requests are made when cover art is displayed with the default settings.
- Measure render time for placeholder generation — target under 5ms for a single 480×480 canvas draw.

## Pros and Cons of the Options

### Procedural Placeholder (Canvas-drawn SNES cartridge)

A procedurally generated SNES cartridge image rendered using Canvas 2D, with colors derived from a hash of the game title and the title rendered as text on the cartridge label.

- Good, because it works completely offline with zero network dependencies — fully compatible with the PWA's offline-first design.
- Good, because rendering is instant (single canvas draw, <5ms) and deterministic — no async operations, no loading states.
- Good, because every game gets a unique visual identity (color + title text) without any external data source.
- Good, because the SNES cartridge shape is thematically appropriate for a SNES music player, creating brand coherence.
- Good, because there are no privacy concerns — no data leaves the browser.
- Good, because there are no API keys, rate limits, accounts, or CORS issues to manage.
- Neutral, because the visual quality is lower than real box art, but acceptable as a default fallback.
- Bad, because the 8-color palette limits visual diversity — with hundreds of games, many will share the same base color.
- Bad, because the cartridge shape is a stylistic choice that may not appeal to all users — some may prefer minimalist or no-art approaches.

### IGDB / MobyGames API Integration

Fetch game box art from IGDB (Twitch-owned game database) or MobyGames API by searching for the game title extracted from SPC tags.

- Good, because these databases have extensive SNES game coverage with high-quality box art scans.
- Good, because IGDB's API is free for non-commercial use and returns structured game metadata beyond just images.
- Bad, because IGDB requires an API key (Twitch Client ID + OAuth token), creating onboarding friction — users would need to obtain their own key or the project would need to host a proxy service.
- Bad, because API calls from a client-side app face CORS restrictions — IGDB does not set permissive CORS headers for browser requests, requiring a server-side proxy. SPC Player has no backend.
- Bad, because rate limits (4 requests/second for IGDB) would throttle users browsing large libraries.
- Bad, because game title matching is imprecise — SPC tag titles (e.g., "Chrono Trigger") may not exactly match database entries, requiring fuzzy search that returns ambiguous results.
- Bad, because it violates the offline-first principle — cover art would be unavailable without network access and without prior caching.
- Bad, because sending game titles to a third-party API raises privacy concerns for users who do not expect their listening activity to be transmitted.

### RetroArch Thumbnail Repository

Fetch SNES game box art from the `libretro-thumbnails` GitHub repository, which hosts PNG images accessible via raw.githubusercontent.com URLs.

- Good, because the repository has excellent SNES game coverage (~1,500+ titles) with consistently formatted box art.
- Good, because raw.githubusercontent.com does not require API keys or authentication — images are directly accessible via URL.
- Good, because GitHub's CDN has strong global availability and performance.
- Good, because once fetched, images can be cached in IndexedDB for offline use.
- Bad, because the initial image fetch requires network access, violating the offline-first default.
- Bad, because game title → RetroArch filename matching requires fuzzy matching — RetroArch uses its own title formatting convention (e.g., "Chrono Trigger (USA)" vs. the SPC tag's "Chrono Trigger").
- Bad, because PNG box art images are relatively large (50–200 KB each), consuming IndexedDB storage — a library of 500 games could use 25–100 MB of cached art.
- Bad, because raw.githubusercontent.com URLs could change if the libretro-thumbnails repository is restructured or moved — the dependency is on an external project's URL scheme.
- Bad, because enabling this feature by default would send game titles (via URL requests) to GitHub without user consent.
- Neutral, because this is a viable opt-in feature but inappropriate as the zero-configuration default.

### User-Uploaded Cover Art

Allow users to manually assign cover art images to tracks or games, stored in IndexedDB.

- Good, because the user has full control over which image is displayed — they can use official box art, fan art, or any image they prefer.
- Good, because images are stored locally in IndexedDB — no external dependencies after upload.
- Good, because it works for obscure or homebrew SPC files that would not appear in any game database.
- Bad, because it requires manual effort for every game — a library of hundreds of games becomes a tedious data entry task.
- Bad, because new users see no cover art until they manually upload images, creating a poor first impression.
- Bad, because storing full-resolution images in IndexedDB consumes significant storage (comparable to RetroArch thumbnails).
- Bad, because it does not solve the "zero-configuration default" requirement — the first-run experience has no cover art.
- Neutral, because this feature is complementary to other approaches and may be added later as an override mechanism.

### No Cover Art

Display a blank space, generic music icon, or the project logo in place of cover art.

- Good, because it requires zero implementation effort.
- Good, because it avoids all complexity related to image sourcing, matching, caching, and privacy.
- Bad, because it makes the player feel incomplete — every major music player displays artwork, and its absence is conspicuous.
- Bad, because it wastes valuable screen real estate in the VisualizationStage Art tab — the tab would exist but show nothing useful.
- Bad, because it provides no visual differentiation between tracks — all entries in the playlist look identical.
- Bad, because it contradicts the project's design goal of a polished, full-featured music player experience.

## More Information

### Cover Art Source Priority (Future State)

When RetroArch integration and user uploads are eventually implemented, the cover art display will follow a priority order:

1. **User-uploaded art** (if the user has assigned custom art for this game) — highest priority, user intent overrides everything.
2. **RetroArch thumbnail** (if opt-in is enabled and art was fetched/cached) — real box art is preferred over procedural art.
3. **Procedural placeholder** — always-available fallback.

xid6 extended tags in SPC files theoretically support embedded images, but this is extremely rare in practice. If encountered, embedded art would slot in at priority 1 (alongside user-uploaded).

### Why Not IGDB Despite Good Coverage

IGDB was the strongest candidate for cover art quality and coverage. It was rejected primarily because SPC Player has no backend server — it is a fully client-side PWA deployed on GitHub Pages. IGDB's API does not support browser CORS, so every image request would need to be proxied through a server. Adding a proxy server would fundamentally change the project's architecture (currently zero-backend) and create an ongoing hosting and maintenance obligation. The RetroArch approach avoids this because raw.githubusercontent.com serves images with permissive CORS headers.

### Related Decisions

- [ADR-0020](0020-visualization-rendering-approach.md) — Canvas 2D is the rendering technology for all visualizations, including the procedural cover art placeholder.
- [ADR-0005](0005-state-management-architecture.md) — The `coverArt.externalFetchEnabled` setting is stored in the Zustand settings slice with IndexedDB persistence.
- [ADR-0011](0011-indexeddb-wrapper.md) — Cached RetroArch thumbnails (when the feature is implemented in Phase F) will be stored in IndexedDB.
