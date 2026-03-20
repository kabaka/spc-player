/**
 * Lightweight tracing module mimicking OpenTelemetry semantics.
 *
 * Uses browser-native `performance.mark` / `performance.measure` for timing
 * and `console.group` for structured dev output. Zero external dependencies.
 *
 * All tracing is dev-mode only — production builds tree-shake this away
 * because every public function guards on `import.meta.env.DEV`.
 *
 * @see docs/requirements.md — Performance targets
 * @see .github/skills/otel/SKILL.md — Semantic conventions
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Span status matching OTel StatusCode semantics. */
export type SpanStatus = 'unset' | 'ok' | 'error';

/** Key-value attributes attached to a span. */
export type SpanAttributes = Record<string, string | number | boolean>;

/** Completed span record logged to the console. */
export interface SpanRecord {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly status: SpanStatus;
  readonly attributes: SpanAttributes;
  readonly error?: string;
}

/** Minimal tracer interface — mirrors OTel Tracer surface we need. */
export interface Tracer {
  readonly name: string;
  startSpan(name: string, attributes?: SpanAttributes): Span;
}

/** Active span that can accumulate attributes and be ended. */
export interface Span {
  readonly name: string;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: SpanStatus, message?: string): void;
  end(): SpanRecord;
}

// ---------------------------------------------------------------------------
// Implementation — only runs when DEV is true
// ---------------------------------------------------------------------------

let tracerInstance: Tracer | null = null;

function createSpan(spanName: string, attrs?: SpanAttributes): Span {
  const markStart = `${spanName}::start`;
  const markEnd = `${spanName}::end`;
  const attributes: SpanAttributes = { ...attrs };
  let status: SpanStatus = 'unset';
  let errorMessage: string | undefined;
  let ended = false;

  performance.mark(markStart);

  return {
    name: spanName,

    setAttribute(key, value) {
      if (!ended) {
        attributes[key] = value;
      }
    },

    setStatus(s, message) {
      if (!ended) {
        status = s;
        errorMessage = message;
      }
    },

    end(): SpanRecord {
      if (ended) {
        return {
          name: spanName,
          startTime: 0,
          duration: 0,
          status,
          attributes,
          error: errorMessage,
        };
      }

      ended = true;
      performance.mark(markEnd);

      let duration = 0;
      let startTime = 0;
      try {
        const measure = performance.measure(spanName, markStart, markEnd);
        duration = measure.duration;
        startTime = measure.startTime;
      } catch {
        // marks may have been cleared — degrade gracefully
      }

      const record: SpanRecord = {
        name: spanName,
        startTime,
        duration,
        status,
        attributes,
        error: errorMessage,
      };

      logSpan(record);

      // Clean up performance entries to avoid unbounded growth
      try {
        performance.clearMarks(markStart);
        performance.clearMarks(markEnd);
        performance.clearMeasures(spanName);
      } catch {
        // ignore
      }

      return record;
    },
  };
}

function logSpan(record: SpanRecord): void {
  const statusIcon =
    record.status === 'error' ? '❌' : record.status === 'ok' ? '✅' : '⏱️';
  const durationStr = `${record.duration.toFixed(2)}ms`;

  const hasAttributes = Object.keys(record.attributes).length > 0;

  if (hasAttributes || record.error) {
    console.groupCollapsed(
      `${statusIcon} [trace] ${record.name} — ${durationStr}`,
    );
    if (hasAttributes) {
      console.table(record.attributes);
    }
    if (record.error) {
      console.warn('Error:', record.error);
    }
    console.groupEnd();
  } else {
    console.log(`${statusIcon} [trace] ${record.name} — ${durationStr}`);
  }
}

function createTracer(name: string): Tracer {
  return {
    name,
    startSpan(spanName: string, attributes?: SpanAttributes): Span {
      return createSpan(spanName, attributes);
    },
  };
}

// ---------------------------------------------------------------------------
// No-op implementations for production
// ---------------------------------------------------------------------------

const NOOP_SPAN_RECORD: SpanRecord = Object.freeze({
  name: '',
  startTime: 0,
  duration: 0,
  status: 'unset' as const,
  attributes: {},
});

const noopSpan: Span = {
  name: '',
  setAttribute() {
    // no-op in production
  },
  setStatus() {
    // no-op in production
  },
  end() {
    return NOOP_SPAN_RECORD;
  },
};

const noopTracer: Tracer = {
  name: 'noop',
  startSpan() {
    return noopSpan;
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the singleton tracer instance.
 * In production, returns a no-op tracer (zero overhead).
 */
export function getTracer(name = 'spc-player'): Tracer {
  if (!import.meta.env.DEV) {
    return noopTracer;
  }
  if (!tracerInstance || tracerInstance.name !== name) {
    tracerInstance = createTracer(name);
  }
  return tracerInstance;
}

/**
 * Trace a synchronous function execution as a span.
 *
 * @example
 * const result = traceSync('spc.metadata.parse', () => parseSpc(buffer), {
 *   'spc.file.size': buffer.byteLength,
 * });
 */
export function traceSync<T>(
  name: string,
  fn: () => T,
  attributes?: SpanAttributes,
): T {
  if (!import.meta.env.DEV) {
    return fn();
  }

  const span = getTracer().startSpan(name, attributes);
  try {
    const result = fn();
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.setStatus(
      'error',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Trace an asynchronous function execution as a span.
 *
 * @example
 * const data = await traceAsync('spc.file.load', () => fetch(url), {
 *   'file.name': filename,
 * });
 */
export async function traceAsync<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: SpanAttributes,
): Promise<T> {
  if (!import.meta.env.DEV) {
    return fn();
  }

  const span = getTracer().startSpan(name, attributes);
  try {
    const result = await fn();
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.setStatus(
      'error',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    span.end();
  }
}
