import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { EnvironmentVariables } from './infrastructure/config/env.validation.js';
import { loadRootEnv } from './infrastructure/config/load-env.js';
import { configureApp } from './setup-app.js';

async function bootstrap(): Promise<void> {
  loadRootEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureApp(app);
  await app.listen(app.get(EnvironmentVariables).PORT);
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (for example when env validation failed), so print the message plainly.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
