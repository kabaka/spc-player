export { getTracer, traceSync, traceAsync } from './tracer';
export type {
  Span,
  SpanRecord,
  SpanAttributes,
  SpanStatus,
  Tracer,
} from './tracer';
export { initInstrumentation } from './instrumentation';
export {
  SPAN_DOCUMENT_LOAD,
  SPAN_SPC_FILE_LOAD,
  SPAN_SPC_METADATA_PARSE,
  SPAN_AUDIO_CONTEXT_INIT,
  SPAN_WASM_INIT,
  SPAN_PLAYBACK_START,
  SPAN_PLAYBACK_STOP,
  SPAN_EXPORT,
  ATTR,
} from './spans';
