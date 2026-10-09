import bcrypt from 'bcryptjs';

/** bcrypt ignores everything after 72 bytes, so longer passwords are rejected instead of silently cut. */
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_COST = 10;

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, BCRYPT_COST);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

/**
 * Compared against when the email is unknown, so a sign-in for a missing user takes as long as one for an
 * existing user and response time does not reveal which emails exist.
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);
