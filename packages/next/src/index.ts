export {
  NextScopeSpanExporter,
  readableSpanToInput,
  spanAttributes,
  type NextScopeSpanExporterOptions,
} from './exporter.js'
export {
  getNextScopeRegistration,
  register,
  registerNextScope,
  shutdownNextScope,
  type NextScopeRegisterOptions,
  type NextScopeRegistration,
} from './register.js'
export {
  createRequestErrorHandler,
  onRequestError,
  requestErrorToInput,
  type NextRequestErrorContext,
  type NextRequestInfo,
} from './error.js'
export {
  withNextScopeSpan,
  withNextScopeSpanSync,
  type NextScopeManualSpanOptions,
} from './manual.js'
