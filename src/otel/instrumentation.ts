/**
 * Instrumentation setup — initializes document load tracing.
 *
 * Call `initInstrumentation()` early in the app lifecycle (e.g., main.tsx).
 * Only activates in development mode; no-ops in production.
 */

import { ATTR, SPAN_DOCUMENT_LOAD } from './spans';
import { getTracer } from './tracer';

/**
 * Initialize client-side instrumentation.
 * Records a document load span using the Navigation Timing API.
 * Should be called once after React hydration completes.
 */
export function initInstrumentation(): void {
  if (!import.meta.env.DEV) return;

  // Defer to capture the full page load — run after paint
  requestAnimationFrame(() => {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;

    if (!nav) return;

    const tracer = getTracer();
    const span = tracer.startSpan(SPAN_DOCUMENT_LOAD, {
      'document.url': location.pathname,
      'document.dom_content_loaded_ms': Math.round(
        nav.domContentLoadedEventEnd - nav.startTime,
      ),
      'document.load_event_ms': Math.round(nav.loadEventEnd - nav.startTime),
      'document.dom_interactive_ms': Math.round(
        nav.domInteractive - nav.startTime,
      ),
      [ATTR.AUDIO_SAMPLE_RATE]: 0, // populated later when audio inits
    });

    span.setStatus('ok');
    span.end();
  });
}
