export { initInstrumentation } from './instrumentation';
export {
  ATTR,
  SPAN_AUDIO_CONTEXT_INIT,
  SPAN_DOCUMENT_LOAD,
  SPAN_EXPORT,
  SPAN_PLAYBACK_START,
  SPAN_PLAYBACK_STOP,
  SPAN_SPC_FILE_LOAD,
  SPAN_SPC_METADATA_PARSE,
  SPAN_WASM_INIT,
} from './spans';
export type {
  Span,
  SpanAttributes,
  SpanRecord,
  SpanStatus,
  Tracer,
} from './tracer';
export { getTracer, traceAsync, traceSync } from './tracer';
