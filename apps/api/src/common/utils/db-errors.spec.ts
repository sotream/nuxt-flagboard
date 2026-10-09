import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from './db-errors.js';

const failed = (code: string) =>
  new QueryFailedError('INSERT ...', [], Object.assign(new Error('db'), { code }));

describe('isUniqueViolation', () => {
  it('recognises a PostgreSQL unique violation', () => {
    expect(isUniqueViolation(failed('23505'))).toBe(true);
  });

  it('does not treat other database errors as a unique violation', () => {
    expect(isUniqueViolation(failed('23503'))).toBe(false);
  });

  it('ignores errors that did not come from the database', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
