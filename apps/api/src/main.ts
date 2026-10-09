import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { EnvironmentVariables } from './infrastructure/config/env.validation.js';
import { loadRootEnv } from './infrastructure/config/load-env.js';
import { configureApp } from './setup-app.js';

async function bootstrap(): Promise<void> {
  loadRootEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureApp(app);
  const env = app.get(EnvironmentVariables);
  if (env.TRUST_PROXY_HOPS > 0) {
    // Only behind that many reverse proxies, so clients cannot spoof their IP with X-Forwarded-For.
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }
  await app.listen(env.PORT);
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (for example when env validation failed), so print the message plainly.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
