import { describe, expect, it } from 'vitest';
import { ApiError } from '../../app/utils/api-error';

const problem = (status: number, body: unknown, type = 'application/problem+json') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': type },
  });

describe('ApiError.fromResponse (RFC 9457 problem details)', () => {
  it('takes the message from `detail`', async () => {
    const error = await ApiError.fromResponse(
      problem(401, {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid email or password',
      }),
    );
    expect(error).toMatchObject({ status: 401, message: 'Invalid email or password' });
  });

  it('lists the detail of every invalid field when the problem has `errors`', async () => {
    const error = await ApiError.fromResponse(
      problem(400, {
        type: 'urn:flagboard:problem:validation-failed',
        title: 'Validation failed',
        status: 400,
        detail: 'The request is not valid. See errors for each field.',
        code: 'VALIDATION_FAILED',
        errors: [
          { pointer: '#/email', detail: 'email must be an email' },
          { pointer: '#/password', detail: 'password should not be empty' },
        ],
      }),
    );
    expect(error.message).toBe('email must be an email; password should not be empty');
  });

  it('falls back to `title` when there is no detail, then to the status', async () => {
    expect(
      (await ApiError.fromResponse(problem(500, { title: 'Internal Server Error', status: 500 })))
        .message,
    ).toBe('Internal Server Error');
    expect((await ApiError.fromResponse(problem(502, ''))).message).toBe('Request failed (502)');
  });

  it('keeps the whole body, so the extension members are readable: `current` of a revision conflict', async () => {
    const error = await ApiError.fromResponse(
      problem(409, {
        type: 'urn:flagboard:problem:revision-mismatch',
        title: 'Revision mismatch',
        status: 409,
        detail: 'Someone else changed this first.',
        code: 'REVISION_MISMATCH',
        current: { revision: 5 },
      }),
    );
    expect(error.body).toMatchObject({ code: 'REVISION_MISMATCH', current: { revision: 5 } });
  });

  it('ignores extension members it does not know and a body that is not JSON', async () => {
    expect(
      (await ApiError.fromResponse(problem(400, { detail: 'x', somethingNew: [1, 2] }))).message,
    ).toBe('x');
    expect(
      (await ApiError.fromResponse(problem(500, '<html>oops</html>', 'text/html'))).message,
    ).toBe('Request failed (500)');
  });
});
