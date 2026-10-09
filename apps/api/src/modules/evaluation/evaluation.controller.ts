import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { PUBLIC_PREFIX } from '../../common/routes.js';
import { ApiKeyGuard } from './api-key.guard.js';
import type { RequestWithApiKey } from './api-key-principal.js';
import { EvaluateDto } from './dto/evaluate.dto.js';
import { EvaluationService } from './evaluation.service.js';
import { KeyKinds } from './key-kinds.decorator.js';
import { SnapshotService } from './snapshot.service.js';

/**
 * The public API for SDKs, authenticated with an API key instead of a user token (`@Public()` turns the user
 * guards off; `ApiKeyGuard` takes over).
 */
@Controller(PUBLIC_PREFIX)
@Public()
@UseGuards(ApiKeyGuard)
export class EvaluationController {
  constructor(
    private readonly snapshots: SnapshotService,
    private readonly evaluation: EvaluationService,
  ) {}

  /** Server keys only: the full configuration, for local evaluation. Supports `If-None-Match` (304). */
  @Get('snapshot')
  @KeyKinds('server')
  async snapshot(
    @Req() request: RequestWithApiKey,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const snapshot = await this.snapshots.get(request.apiKey!);
    // The response depends on the Authorization header, so shared caches must not store it.
    response.setHeader('ETag', snapshot.etag);
    response.setHeader('Cache-Control', 'private, no-cache');
    response.setHeader('Vary', 'Authorization');
    if (matchesEtag(ifNoneMatch, snapshot.etag)) {
      response.status(304).end();
      return;
    }
    response.type('application/json').send(snapshot.body);
  }

  /** Server and client keys: evaluates flags for a context. Never returns rules or attribute values. */
  @Post('evaluate')
  @HttpCode(200)
  @KeyKinds('server', 'client')
  evaluate(@Req() request: RequestWithApiKey, @Body() dto: EvaluateDto) {
    return this.evaluation.evaluate(request.apiKey!, dto);
  }
}

/** True when any validator in an `If-None-Match` list equals `etag` (weak validators compare by their value). */
export function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//, ''))
    .includes(etag);
}
