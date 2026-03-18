---
name: otel
description: OpenTelemetry client-side instrumentation — spans, metrics, semantic conventions for browser observability.
---

# OpenTelemetry (Client-Side)

Use this skill when adding observability, performance tracing, or metrics to the SPC Player.

## Overview

OpenTelemetry (OTel) provides a vendor-neutral standard for traces and metrics. For a client-side app, this means:

- **Traces**: track user interactions, file loading, audio pipeline setup.
- **Metrics**: playback duration, export times, error rates.
- **No logs export**: client-side OTel focuses on traces and metrics, not log shipping.

## Setup

```typescript
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';

const provider = new WebTracerProvider();
provider.addSpanProcessor(
  new SimpleSpanProcessor(new OTLPTraceExporter({ url: '/v1/traces' }))
);
provider.register({ contextManager: new ZoneContextManager() });

const tracer = provider.getTracer('spc-player');
```

## What to Instrument

| Operation | Span Name | Key Attributes |
| --------- | --------- | -------------- |
| Load SPC file | `spc.file.load` | `file.size`, `file.name` |
| Parse metadata | `spc.metadata.parse` | `spc.format` (id666/xid6) |
| Init audio context | `audio.context.init` | `audio.sample_rate` |
| Start playback | `spc.playback.start` | `spc.game`, `spc.title` |
| Export audio | `spc.export` | `export.format`, `export.duration` |
| WASM init | `wasm.init` | `wasm.module_size` |

## Semantic Conventions

Follow OTel semantic conventions where they exist. For SPC-specific attributes, prefix with `spc.`:

- `spc.file.size` — SPC file size in bytes
- `spc.game` — game title from metadata
- `spc.title` — track title from metadata
- `spc.channels.active` — number of active channels

## Metrics

Use the Metrics API for counters and histograms:

```typescript
const meter = provider.getMeter('spc-player');
const playCount = meter.createCounter('spc.play.count');
const loadDuration = meter.createHistogram('spc.file.load.duration', {
  unit: 'ms',
});
```

## Privacy

- Never include PII in spans or metrics.
- Don't trace file contents or full file paths.
- OTel data should be aggregated, not per-user.
- If no backend is configured, OTel should be a no-op (no errors, no network requests).

## Performance Impact

- Use `BatchSpanProcessor` in production (not `SimpleSpanProcessor`) to reduce overhead.
- Sampling: use a fixed-rate sampler (e.g., 10%) if traffic is high.
- OTel should never impact playback performance. If it does, reduce instrumentation.

## Development Mode

- In development, log spans to the console for debugging.
- Use `ConsoleSpanExporter` for local testing.
- Make OTel opt-in or configurable via settings.
