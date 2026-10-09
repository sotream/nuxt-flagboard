import type { Context, EvaluationResult, FlagValue, Reason } from '@flagboard/core';
import { FlagboardError } from './errors.js';
import { HttpClient, parseJson, resolveOptions } from './http.js';
import type { ClientOptions } from './types.js';

export interface RemoteClient {
  /**
   * Evaluates one flag on the server. It never throws: if the request fails you get `defaultValue` with the reason
   * `ERROR` (and `onError` is called), and an unknown flag gives `defaultValue` with `FLAG_NOT_FOUND`.
   */
  evaluate(flagKey: string, context: Context, defaultValue: FlagValue): Promise<EvaluationResult>;
  /** Evaluates every flag this key may see. Never throws: on failure the result is empty. */
  evaluateAll(context: Context): Promise<Record<string, EvaluationResult>>;
  /** Cancels requests in flight and refuses new ones. */
  close(): void;
}

interface ServerFlagResult {
  value: FlagValue | null;
  reason: Reason;
  ruleIndex?: number;
}

/**
 * Evaluates on the Flagboard server with `POST /v1/evaluate`. Works with server and client keys. Use it in
 * browsers (client key) or when you do not want to keep a snapshot in memory.
 */
export function createRemoteClient(options: ClientOptions): RemoteClient {
  const { baseUrl, key, timeoutMs } = resolveOptions(options);
  const http = new HttpClient(baseUrl, key, timeoutMs, options.fetch ?? fetch);

  const report = (error: unknown): void => {
    if (error instanceof FlagboardError) options.onError?.(error);
  };

  async function call(body: object): Promise<Record<string, ServerFlagResult>> {
    const result = await http.send('POST', '/v1/evaluate', { body });
    const parsed = parseJson(result.text) as { flags?: unknown } | null;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.flags !== 'object' ||
      parsed.flags === null
    ) {
      throw new FlagboardError('BAD_RESPONSE', 'The evaluation response has an unexpected shape');
    }
    return parsed.flags as Record<string, ServerFlagResult>;
  }

  return {
    async evaluate(flagKey, context, defaultValue) {
      try {
        const flags = await call({ flags: [flagKey], context });
        const found = Object.hasOwn(flags, flagKey) ? flags[flagKey] : undefined;
        if (!found || found.value === null || found.value === undefined) {
          return { value: defaultValue, reason: 'FLAG_NOT_FOUND' };
        }
        return found.ruleIndex === undefined
          ? { value: found.value, reason: found.reason }
          : { value: found.value, reason: found.reason, ruleIndex: found.ruleIndex };
      } catch (error) {
        report(error);
        return { value: defaultValue, reason: 'ERROR' };
      }
    },

    async evaluateAll(context) {
      try {
        const flags = await call({ context });
        const results: Record<string, EvaluationResult> = {};
        for (const [flagKey, found] of Object.entries(flags)) {
          if (found.value !== null && found.value !== undefined) {
            results[flagKey] = { value: found.value, reason: found.reason };
            if (found.ruleIndex !== undefined) results[flagKey].ruleIndex = found.ruleIndex;
          }
        }
        return results;
      } catch (error) {
        report(error);
        return {};
      }
    },

    close: () => http.close(),
  };
}
