// ── Platform detection ────────────────────────────────────────────────
// Uses navigator.userAgentData (Chromium) with fallback to navigator.platform
// (Safari/Firefox where userAgentData is not available).

let cachedIsMac: boolean | undefined;

export function isMacPlatform(): boolean {
  if (cachedIsMac === undefined) {
    if (typeof navigator === 'undefined') {
      cachedIsMac = false;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      cachedIsMac =
        nav.userAgentData?.platform === 'macOS' ||
        /Mac|iPhone|iPad/.test(navigator.platform);
    }
  }
  return cachedIsMac;
}
