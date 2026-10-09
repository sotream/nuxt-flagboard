const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

/** Formats a timestamp, or gives an empty string for one that is not a date: `Intl` throws on an Invalid Date. */
function formatWith(formatter: Intl.DateTimeFormat, iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '' : formatter.format(parsed);
}

export const formatDateTime = (iso: string): string => formatWith(dateTime, iso);
export const formatDate = (iso: string): string => formatWith(date, iso);
export const formatTime = (iso: string): string => formatWith(time, iso);
