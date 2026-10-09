import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong horse battery staple', hash)).toBe(false);
  });

  it('never stores the password and salts every hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password-123'),
      hashPassword('same-password-123'),
    ]);
    expect(a).not.toContain('same-password-123');
    expect(a).not.toBe(b);
  });

  it('has a valid dummy hash that matches nothing realistic', async () => {
    expect(await verifyPassword('anything-at-all-123', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
