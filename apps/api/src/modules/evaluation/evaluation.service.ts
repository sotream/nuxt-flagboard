import { Injectable } from '@nestjs/common';
import { evaluate } from '@flagboard/core';
import type { Context, FlagValue, Reason } from '@flagboard/core';
import type { ApiKeyPrincipal } from './api-key-principal.js';
import type { EvaluateDto } from './dto/evaluate.dto.js';
import { SnapshotService } from './snapshot.service.js';

export interface FlagResult {
  /** `null` when the flag does not exist (or is not visible to this key): the caller applies its own default. */
  value: FlagValue | null;
  reason: Reason;
  /** Server keys only, and only for `RULE_MATCH`. */
  ruleIndex?: number;
}

export interface EvaluationResponse {
  flags: Record<string, FlagResult>;
}

@Injectable()
export class EvaluationService {
  constructor(private readonly snapshots: SnapshotService) {}

  /**
   * Evaluates the requested flags (or all of them) with the shared core. A client key only sees flags marked
   * client-visible; anything else is reported exactly like an unknown flag, so its existence cannot be probed.
   * The response never contains rules, salts or the attributes the caller sent.
   */
  async evaluate(principal: ApiKeyPrincipal, dto: EvaluateDto): Promise<EvaluationResponse> {
    const snapshot = await this.snapshots.get(principal);
    const isClient = principal.kind === 'client';
    const context: Context = { userId: dto.context?.userId, attributes: dto.context?.attributes };

    const visible = (key: string) => {
      const flag = snapshot.flags.get(key);
      return flag && (!isClient || flag.clientVisible) ? flag : undefined;
    };
    const keys = dto.flags
      ? [...new Set(dto.flags)]
      : [...snapshot.flags.keys()].filter((key) => visible(key));

    const entries = keys.map((key): [string, FlagResult] => {
      const flag = visible(key);
      const result = evaluate(flag?.config, context, '');
      if (!flag) {
        return [key, { value: null, reason: 'FLAG_NOT_FOUND' }];
      }
      const response: FlagResult = { value: result.value, reason: result.reason };
      if (!isClient && result.ruleIndex !== undefined) {
        response.ruleIndex = result.ruleIndex;
      }
      return [key, response];
    });
    // fromEntries defines own properties, so a requested key such as "__proto__" stays a plain key.
    return { flags: Object.fromEntries(entries) };
  }
}
