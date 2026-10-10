# Errors

Every error response of the API is a problem details object ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)) with
the media type `application/problem+json`. The reasoning and the deviations are in
[ADR 0014](../adr/0014-http-standards-conformance.md).

```json
{
  "type": "urn:flagboard:problem:validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "The request is not valid. See errors for each field.",
  "instance": "/api/v1/projects/demo/flags",
  "code": "VALIDATION_FAILED",
  "errors": [
    {
      "pointer": "#/key",
      "detail": "key must be lower-case letters and digits separated by single dots, dashes or underscores"
    },
    { "pointer": "#/rules/0/serve", "detail": "serve must be one of the following values: on, off" }
  ]
}
```

| Member     | Meaning                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`     | A URI that names the kind of problem. `about:blank` for a plain HTTP error, which then means only what the status means; otherwise one of the URNs below.  |
| `title`    | A short summary of the type. The same for every problem of that type.                                                                                      |
| `status`   | The HTTP status, repeated.                                                                                                                                 |
| `detail`   | What happened this time, for a person. Do not parse it. Missing on a 5xx: the server says nothing about its internals.                                     |
| `instance` | The path of the request, without the query string.                                                                                                         |
| `code`     | Extension: a stable machine-readable name, `VALIDATION_FAILED`, `REVISION_MISMATCH`, `RATE_LIMITED`.                                                       |
| `errors`   | Extension, validation failures only: one entry per violated constraint. `pointer` is a JSON Pointer (RFC 6901) in URI fragment form into the request body. |
| `current`  | Extension, revision conflicts only: the current flag environment.                                                                                          |

Clients must ignore members they do not know. New members can be added without notice; the members above are kept.

## Problem types

| `type`                                    | Status | When                                                                                                         | Extensions        |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| `urn:flagboard:problem:validation-failed` | 400    | The body, query or path does not match the rules of the endpoint.                                            | `code`, `errors`  |
| `urn:flagboard:problem:revision-mismatch` | 409    | The `revision` sent is not the current one: someone changed the flag environment first. Nothing was changed. | `code`, `current` |
| `urn:flagboard:problem:rate-limited`      | 429    | A limit was used up. The `Retry-After` header says how many seconds to wait.                                 | `code`            |
| `about:blank`                             | any    | Everything else: 401, 403, 404, 405, 409 (other conflicts), 413, 415, 5xx.                                   | none              |

## Other headers on errors

- `401` always has `WWW-Authenticate: Bearer`, with `error="invalid_token"` when a token or key was sent and rejected.
- `405` has `Allow`, the methods the path supports.
- `429` and `503` can have `Retry-After`; the SDK waits for it.
- Admin API responses have `Cache-Control: no-store`.
