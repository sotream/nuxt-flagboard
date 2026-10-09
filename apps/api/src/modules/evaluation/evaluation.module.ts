import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { FlagsModule } from '../flags/flags.module.js';
import { ApiKeyAuthService } from './api-key-auth.service.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { EvaluationController } from './evaluation.controller.js';
import { EvaluationService } from './evaluation.service.js';
import { SnapshotService } from './snapshot.service.js';

@Module({
  imports: [ApiKeysModule, FlagsModule],
  controllers: [EvaluationController],
  providers: [ApiKeyAuthService, ApiKeyGuard, SnapshotService, EvaluationService],
})
export class EvaluationModule {}
