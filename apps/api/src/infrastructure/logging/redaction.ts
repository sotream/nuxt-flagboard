/**
 * Paths pino replaces with `[Redacted]`. Request bodies are never logged at all; these cover headers and
 * any object that is logged by accident. Add a path here whenever a new secret-bearing field appears.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.refreshToken',
  '*.accessToken',
  '*.apiKey',
  '*.secret',
];

export const REDACTED = '[Redacted]';
