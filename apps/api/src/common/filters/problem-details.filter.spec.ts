import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { toProblem } from './problem-details.filter.js';

describe('toProblem (RFC 9457)', () => {
  it('uses about:blank and the HTTP reason for a plain HTTP error', () => {
    expect(toProblem(new NotFoundException('Project not found'))).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Project not found',
    });
  });

  it('has the same status in the body as in the response, and no Nest members', () => {
    const problem = toProblem(new ForbiddenException('No'));
    expect(problem.status).toBe(403);
    expect(problem).not.toHaveProperty('statusCode');
    expect(problem).not.toHaveProperty('message');
    expect(problem).not.toHaveProperty('error');
  });

  it('joins an array message into one detail', () => {
    expect(toProblem(new BadRequestException(['a is wrong', 'b is wrong'])).detail).toBe(
      'a is wrong; b is wrong',
    );
  });

  it('turns a known code into our problem type and keeps the code and other members as extensions', () => {
    const current = { revision: 4 };
    const problem = toProblem(
      new ConflictException({
        code: 'REVISION_MISMATCH',
        message: 'Someone changed it first.',
        current,
      }),
    );
    expect(problem).toEqual({
      type: 'urn:flagboard:problem:revision-mismatch',
      title: 'Revision mismatch',
      status: 409,
      detail: 'Someone changed it first.',
      code: 'REVISION_MISMATCH',
      current,
    });
  });

  it('keeps an unknown code as an extension but gives it no type of its own', () => {
    const problem = toProblem(new ConflictException({ code: 'SOMETHING_NEW', message: 'm' }));
    expect(problem).toMatchObject({ type: 'about:blank', code: 'SOMETHING_NEW' });
  });

  it('marks a 429 as rate-limited', () => {
    expect(
      toProblem(new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)),
    ).toMatchObject({
      type: 'urn:flagboard:problem:rate-limited',
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('answers an error from body-parser by its own 4xx status', () => {
    expect(toProblem(Object.assign(new Error('too big'), { status: 413 }))).toEqual({
      type: 'about:blank',
      title: 'Payload Too Large',
      status: 413,
      detail: 'Request body too large',
    });
  });

  it('hides everything about an unexpected error', () => {
    const problem = toProblem(new Error('connect ECONNREFUSED 10.0.0.5 password=hunter2'));
    expect(problem).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500 });
    expect(JSON.stringify(problem)).not.toContain('hunter2');
  });

  it('does not repeat the message of a 5xx HttpException either', () => {
    const problem = toProblem(new HttpException('database says: secret', 503));
    expect(problem.detail).toBeUndefined();
  });
});
