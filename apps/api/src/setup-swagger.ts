import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppEnv } from './infrastructure/config/env.validation.js';
import { EvaluationModule } from './modules/evaluation/evaluation.module.js';

export const SWAGGER_PATH = 'docs';

/**
 * Serves OpenAPI documentation of the public `/v1` API at `/docs` (JSON at `/docs-json`). Only the routes SDK
 * authors need are documented; the admin API is internal to the web app. Off when `APP_ENV=prod`: documentation
 * is useful while developing and needs no public endpoint in production. Returns whether it was mounted.
 */
export function setupSwagger(app: INestApplication, appEnv: AppEnv): boolean {
  if (appEnv === 'prod') {
    return false;
  }
  const config = new DocumentBuilder()
    .setTitle('Flagboard public API')
    .setDescription(
      'Evaluate feature flags with an environment API key. A server key (fb_srv_...) can read the snapshot and ' +
        'evaluate; a client key (fb_cli_...) can only evaluate flags marked client-visible.',
    )
    .setVersion('1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'An environment API key' },
      'api-key',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, { include: [EvaluationModule] });
  SwaggerModule.setup(SWAGGER_PATH, app, document);
  return true;
}
