import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from '../../app/utils/format';

describe('format helpers with a date that is not a date', () => {
  it.each([formatDate, formatDateTime, formatTime])(
    '%o gives an empty string instead of throwing',
    (format) => {
      expect(format('not-a-date')).toBe('');
      expect(format('')).toBe('');
    },
  );
});

describe('format helpers', () => {
  const iso = '2026-10-09T10:05:00.000Z';

  it('formatTime gives only the time of day, to the minute', () => {
    expect(formatTime(iso)).toMatch(/^\d{1,2}[:.]\d{2}(\s?[AP]M)?$/i);
  });

  it('formatDate has no time and formatDateTime has both', () => {
    expect(formatDate(iso)).not.toMatch(/\d[:.]\d{2}/);
    expect(formatDateTime(iso)).toMatch(/\d[:.]\d{2}/);
  });
});
