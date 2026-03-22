/**
 * High Contrast Mode detection and system color reading.
 *
 * When Windows High Contrast Mode (forced-colors: active) is enabled,
 * canvas-drawn content becomes invisible because the browser only applies
 * forced colors to DOM elements. This utility reads system colors from
 * a temporary DOM element so canvas renderers can adapt.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface HighContrastColors {
  /** System foreground / text color (CSS `CanvasText`). */
  text: string;
  /** System background color (CSS `Canvas`). */
  background: string;
  /** Highlight / selection background (CSS `Highlight`). */
  highlight: string;
  /** Highlight text (CSS `HighlightText`). */
  highlightText: string;
  /** Button text / border (CSS `ButtonText`). */
  buttonText: string;
  /** Link text color (CSS `LinkText`). */
  linkText: string;
}

// ── Detection ─────────────────────────────────────────────────────────

let cachedQuery: MediaQueryList | null = null;

function getQuery(): MediaQueryList {
  if (!cachedQuery) {
    cachedQuery = window.matchMedia('(forced-colors: active)');
  }
  return cachedQuery;
}

/**
 * Whether Windows High Contrast Mode (forced-colors: active) is active.
 */
export function isHighContrastActive(): boolean {
  return getQuery().matches;
}

/**
 * Subscribe to high contrast mode changes.
 * Returns an unsubscribe function.
 */
export function onHighContrastChange(
  callback: (isActive: boolean) => void,
): () => void {
  const query = getQuery();
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

// ── System Color Reading ──────────────────────────────────────────────

/**
 * Read forced-colors system colors by creating a temporary DOM element
 * with CSS system color keywords and reading computed styles.
 *
 * System color keywords resolve to the user's contrast theme colors
 * when `forced-colors: active`. Outside of forced-colors mode, they
 * resolve to browser defaults — callers should check `isHighContrastActive()`
 * before using these colors for rendering.
 */
export function getHighContrastColors(): HighContrastColors {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  el.style.top = '-9999px';
  el.style.width = '0';
  el.style.height = '0';
  el.style.overflow = 'hidden';

  // Force the element to be invisible but still computed
  document.body.appendChild(el);

  const read = (systemColor: string, fallback: string): string => {
    el.style.color = systemColor;
    const computed = getComputedStyle(el).color;
    return computed || fallback;
  };

  const colors: HighContrastColors = {
    text: read('CanvasText', '#ffffff'),
    background: read('Canvas', '#000000'),
    highlight: read('Highlight', '#1aebff'),
    highlightText: read('HighlightText', '#000000'),
    buttonText: read('ButtonText', '#ffffff'),
    linkText: read('LinkText', '#ffff00'),
  };

  document.body.removeChild(el);
  return colors;
}

// ── Cached Color Provider ─────────────────────────────────────────────

let cachedColors: HighContrastColors | null = null;
let cachedActive = false;
let cachedUnsub: (() => void) | null = null;

/**
 * Get cached high contrast state and colors.
 *
 * Returns `null` when forced-colors is not active.
 * Caches colors and invalidates on media query change.
 */
export function getHighContrast(): HighContrastColors | null {
  const active = isHighContrastActive();

  if (!active) {
    cachedColors = null;
    cachedActive = false;
    return null;
  }

  if (!cachedActive || !cachedColors) {
    cachedColors = getHighContrastColors();
    cachedActive = true;

    // Unsubscribe previous listener before registering a new one
    cachedUnsub?.();
    cachedUnsub = onHighContrastChange(() => {
      cachedColors = null;
      cachedActive = false;
    });
  }

  return cachedColors;
}
