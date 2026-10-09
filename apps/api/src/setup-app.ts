import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { PUBLIC_PREFIX } from './common/routes.js';
import { PUBLIC_BODY_LIMIT } from './modules/evaluation/dto/evaluate.dto.js';

/** Settings shared by the real app and the tests, so tests exercise the same pipeline. */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  // Registered before Nest's own body parser, so `/v1` bodies are capped at 16 KB (413 above that) while the
  // admin API keeps the default limit. The wrapper has its own name on purpose: Nest skips its global JSON
  // parser when it finds a middleware called `jsonParser`, which would leave every other route without one.
  const parsePublicJson = json({ limit: PUBLIC_BODY_LIMIT });
  app.use(
    `/${PUBLIC_PREFIX}`,
    function publicBodyLimit(req: Request, res: Response, next: NextFunction) {
      parsePublicJson(req, res, next);
    },
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
