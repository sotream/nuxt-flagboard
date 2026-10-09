/** A failed call to the API. `status` is 0 when the server could not be reached at all. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
    /** The parsed JSON body of the response, if there was one. A 409 carries the current state in it. */
    readonly body?: unknown,
  ) {
    super(message);
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** Builds an error from a non-2xx response, using the server's own message when it sent one. */
  static async fromResponse(response: Response): Promise<ApiError> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = Array.isArray(message)
      ? message.join('; ')
      : typeof message === 'string'
        ? message
        : undefined;
    return new ApiError(response.status, text ?? `Request failed (${response.status})`, body);
  }

  static network(): ApiError {
    return new ApiError(0, 'Could not reach the server');
  }
}
