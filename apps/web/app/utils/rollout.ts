export const MIN_ROLLOUT = 0;
export const MAX_ROLLOUT = 100;

/**
 * Turns what was typed into a rollout percentage: a whole number from 0 to 100. Numbers outside the range are
 * pulled to the nearest end and fractions are rounded; anything that is not a number is rejected (undefined).
 */
export function parseRollout(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return undefined;
  const value = Math.round(Number(trimmed));
  return Math.min(MAX_ROLLOUT, Math.max(MIN_ROLLOUT, value));
}

/** One sentence about who gets the flag at this percentage, for people and for screen readers. */
export function describeRollout(percentage: number): string {
  if (percentage <= MIN_ROLLOUT)
    return 'Nobody is rolled in. Users get the off value unless a rule matches.';
  if (percentage >= MAX_ROLLOUT) return 'Everyone is rolled in, with or without a user id.';
  return `${percentage}% of users are rolled in. This needs a user id: requests without one get the off value.`;
}
