interface Problem {
  title?: unknown;
  detail?: unknown;
  errors?: unknown;
}

/** What to show a person for a problem: every invalid field, else the detail, else the title. */
function problemMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { title, detail, errors } = body as Problem;
  if (Array.isArray(errors)) {
    const fields = errors
      .map((error: unknown) => (error as { detail?: unknown } | null)?.detail)
      .filter((text): text is string => typeof text === 'string');
    if (fields.length > 0) return fields.join('; ');
  }
  if (typeof detail === 'string') return detail;
  return typeof title === 'string' ? title : undefined;
}

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

  /**
   * Builds an error from a non-2xx response. The API answers with RFC 9457 problem details: the message is the `detail`,
   * or the `detail` of every field in `errors` for a validation failure, or the `title`. Members this code does not know
   * are ignored (the RFC requires clients to), and `body` keeps them for the callers that do, such as `current`.
   */
  static async fromResponse(response: Response): Promise<ApiError> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    return new ApiError(
      response.status,
      problemMessage(body) ?? `Request failed (${response.status})`,
      body,
    );
  }

  static network(): ApiError {
    return new ApiError(0, 'Could not reach the server');
  }
}
