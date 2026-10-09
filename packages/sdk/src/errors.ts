export type FlagboardErrorCode =
  /** The options are wrong (missing key, bad URL). Thrown immediately, before any request. */
  | 'BAD_CONFIG'
  | 'INVALID_KEY'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'BAD_REQUEST'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'BAD_RESPONSE';

/**
 * Every failure of the SDK. The message is written by the SDK, never copied from a response or a request, and the
 * API key is stripped from anything that could carry it, so an error is safe to log.
 */
export class FlagboardError extends Error {
  override readonly name = 'FlagboardError';

  constructor(
    readonly code: FlagboardErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
