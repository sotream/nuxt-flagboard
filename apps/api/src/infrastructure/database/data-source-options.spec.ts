import { buildBaseOptions, ENTITIES_GLOB, MIGRATIONS_GLOB } from './data-source-options.js';

describe('buildBaseOptions', () => {
  const options = buildBaseOptions('postgres://user:pw@localhost:5434/flagboard');

  it('targets PostgreSQL with the given url', () => {
    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgres://user:pw@localhost:5434/flagboard',
    });
  });

  it('never synchronises the schema or runs migrations on startup', () => {
    expect(options).toMatchObject({ synchronize: false });
    expect(options).not.toHaveProperty('migrationsRun', true);
  });

  it('uses the built-in gen_random_uuid() so no extension needs installing', () => {
    expect(options).toMatchObject({ uuidExtension: 'pgcrypto', installExtensions: false });
  });

  it('finds entities and migrations as compiled files', () => {
    expect(ENTITIES_GLOB).toMatch(/modules\/\*\*\/entities\/\*\.entity\.js$/);
    expect(MIGRATIONS_GLOB).toMatch(/migrations\/\*\.js$/);
  });
});
