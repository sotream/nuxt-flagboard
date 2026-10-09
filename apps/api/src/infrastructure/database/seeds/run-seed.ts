import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module.js';
import { loadRootEnv } from '../../config/load-env.js';
import { readSeedConfig } from './seed-config.js';
import { runSeed } from './seed.js';

/** `pnpm db:seed`. Prints the two API keys once, because they cannot be read again. */
async function main(): Promise<void> {
  loadRootEnv();
  const config = readSeedConfig(process.env);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await runSeed(app, config);
    console.log(`Admin:  ${result.adminEmail} (password: SEED_ADMIN_PASSWORD from .env)`);
    if (result.viewerEmail)
      console.log(`Viewer: ${result.viewerEmail} (password: SEED_VIEWER_PASSWORD from .env)`);
    if (!result.created) {
      console.log(
        'The demo project already exists, so nothing was changed. API keys are shown only once, when created.',
      );
      return;
    }
    console.log('Created the "demo" project with sample flags.');
    console.log('\nAPI keys for the dev environment (shown once, copy them now):');
    console.log(`  server key: ${result.serverKey}`);
    console.log(`  client key: ${result.clientKey}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
