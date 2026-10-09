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
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotModifiedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
@ApiTags('Public API')
@ApiBearerAuth('api-key')
@ApiUnauthorizedResponse({ description: 'Missing, malformed, unknown or revoked API key' })
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
  @ApiOperation({
    summary: "Configuration of the key's environment, for local evaluation",
    description:
      'Server keys only. Send If-None-Match with the last ETag to get 304 when nothing changed.',
  })
  @ApiOkResponse({
    description:
      'Every non-archived flag with its salt, rollout, rules and kill switch. Has an ETag header.',
  })
  @ApiNotModifiedResponse({ description: 'The snapshot did not change since the ETag you sent' })
  @ApiForbiddenResponse({ description: 'A client key cannot read the snapshot' })
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
  @ApiOperation({
    summary: 'Evaluate flags for a context',
    description:
      'Returns a value and a reason per flag. An unknown flag, or one a client key may not see, has value null and reason FLAG_NOT_FOUND. Rules, salts and the attributes you sent are never returned.',
  })
  @ApiOkResponse({
    description: 'Results keyed by flag key',
    schema: {
      type: 'object',
      properties: {
        flags: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              value: { nullable: true, oneOf: [{ type: 'boolean' }, { type: 'string' }] },
              reason: { type: 'string', example: 'ROLLOUT_IN' },
              ruleIndex: { type: 'integer', description: 'Server keys only, for RULE_MATCH' },
            },
          },
        },
      },
    },
  })
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
