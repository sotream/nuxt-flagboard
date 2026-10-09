import { describe, expect, it } from 'vitest';
import { ICON_PATHS } from '../../app/utils/icons';
import type { IconName } from '../../app/utils/icons';

const NAMES: IconName[] = [
  'flag',
  'projects',
  'key',
  'audit',
  'kill',
  'sun',
  'moon',
  'plus',
  'check',
  'x',
  'chevron',
  'copy',
  'warning',
  'user',
  'logout',
  'eye',
  'archive',
  'live',
  'rollout',
  'layers',
];

describe('ICON_PATHS', () => {
  it('has exactly the icons of the set', () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual([...NAMES].sort());
  });

  it.each(NAMES)('%s draws inside the 16 px grid, with no fill or colour of its own', (name) => {
    const markup = ICON_PATHS[name];
    expect(markup.length).toBeGreaterThan(10);
    expect(markup).not.toMatch(/fill=|stroke=|style=|#[0-9a-f]{3,6}|rgb\(/i);
    const numbers = [...markup.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    expect(Math.max(...numbers)).toBeLessThanOrEqual(16);
  });
});
