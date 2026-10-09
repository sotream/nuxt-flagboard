import { BadRequestException } from '@nestjs/common';
import type { FlagValue } from '@flagboard/core';

export type FlagType = 'boolean' | 'string';

const MAX_VALUE_LENGTH = 256;

/** Values are stored as text and read back by the flag's type: boolean flags hold `'true'` or `'false'`. */
export function parseFlagValue(type: FlagType, stored: string): FlagValue {
  return type === 'boolean' ? stored === 'true' : stored;
}

/**
 * Checks and normalises the on and off values of a new flag. A boolean flag defaults to true and false and must
 * be given JSON booleans. A string flag needs two different non-empty strings.
 */
export function resolveFlagValues(
  type: FlagType,
  onValue: FlagValue | undefined,
  offValue: FlagValue | undefined,
): { onValue: string; offValue: string } {
  if (type === 'boolean') {
    const on = onValue ?? true;
    const off = offValue ?? false;
    if (typeof on !== 'boolean' || typeof off !== 'boolean') {
      throw new BadRequestException('A boolean flag takes true or false as its values');
    }
    if (on === off) {
      throw new BadRequestException('onValue and offValue must be different');
    }
    return { onValue: String(on), offValue: String(off) };
  }
  if (typeof onValue !== 'string' || typeof offValue !== 'string') {
    throw new BadRequestException('A string flag needs onValue and offValue as strings');
  }
  if (
    onValue === '' ||
    offValue === '' ||
    onValue.length > MAX_VALUE_LENGTH ||
    offValue.length > MAX_VALUE_LENGTH
  ) {
    throw new BadRequestException(`Values must be 1 to ${MAX_VALUE_LENGTH} characters`);
  }
  if (onValue === offValue) {
    throw new BadRequestException('onValue and offValue must be different');
  }
  return { onValue, offValue };
}
