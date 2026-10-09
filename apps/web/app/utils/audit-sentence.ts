import type { AuditEventView } from './api-types';
import { actionLabel } from './audit-format';
import type { IconName } from './icons';

export interface EventDescription {
  icon: IconName;
  sentences: string[];
}

const MAX_TEXT = 80;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** User text is shortened, never interpreted: the page renders these sentences as text nodes. */
const quote = (value: unknown): string => {
  const text = String(value);
  return `“${text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text}”`;
};
const rules = (value: unknown): string | undefined =>
  Array.isArray(value) ? `${value.length} ${value.length === 1 ? 'rule' : 'rules'}` : undefined;

type Fields = Record<string, unknown>;

const enabledSentence = (after: Fields, where: string): string | undefined =>
  typeof after.enabled === 'boolean'
    ? `Turned the flag ${after.enabled ? 'on' : 'off'} in ${where}`
    : undefined;

function rolloutSentence(before: Fields, after: Fields, where: string): string | undefined {
  const now = after.rolloutPercentage;
  if (typeof now !== 'number') return undefined;
  const was = before.rolloutPercentage;
  if (typeof was !== 'number') return `Set rollout to ${now}% in ${where}`;
  return `${now > was ? 'Raised' : 'Lowered'} rollout from ${was}% to ${now}% in ${where}`;
}

function rulesSentence(before: Fields, after: Fields, where: string): string | undefined {
  if (!('rules' in after)) return undefined;
  const [from, to] = [rules(before.rules), rules(after.rules)];
  return from && to
    ? `Changed targeting rules in ${where} (${from} to ${to})`
    : `Changed targeting rules in ${where}`;
}

/** One sentence per changed field, in a fixed order whatever the order of the keys in the stored JSON. */
function environmentSentences(event: AuditEventView, before: Fields, after: Fields): string[] {
  const where = event.environmentKey ?? 'this environment';
  return [
    enabledSentence(after, where),
    rolloutSentence(before, after, where),
    rulesSentence(before, after, where),
  ].filter((sentence): sentence is string => sentence !== undefined);
}

function flagEditSentences(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const sentences: string[] = [];
  if ('name' in after) {
    sentences.push(
      typeof before.name === 'string'
        ? `Renamed the flag from ${quote(before.name)} to ${quote(after.name)}`
        : `Renamed the flag to ${quote(after.name)}`,
    );
  }
  if ('description' in after) sentences.push('Changed the description');
  if (typeof after.clientVisible === 'boolean') {
    sentences.push(
      after.clientVisible
        ? 'Made the flag visible to client keys'
        : 'Hid the flag from client keys',
    );
  }
  return sentences;
}

function keySentence(verb: string, data: Record<string, unknown>, event: AuditEventView): string {
  const kind = data.kind === 'client' || data.kind === 'server' ? `${data.kind} key` : 'API key';
  const name = typeof data.name === 'string' ? ` ${quote(data.name)}` : '';
  return `${verb} the ${kind}${name}${event.environmentKey ? ` in ${event.environmentKey}` : ''}`;
}

interface Context {
  event: AuditEventView;
  before: Fields;
  after: Fields;
  where: string;
}
type Handler = (context: Context) => { icon: IconName; sentences: string[] };

const killSentence = ({ after, where }: Context): string => {
  const reason =
    typeof after.killReason === 'string' && after.killReason !== ''
      ? `. Reason: ${after.killReason.slice(0, MAX_TEXT)}`
      : '';
  return `Switched the kill switch on in ${where}${reason}`;
};

const createdFlagSentence = ({ event, after }: Context): string[] => {
  const label = after.name ?? after.key ?? event.flagKey;
  return label ? [`Created the flag ${quote(label)}`] : [];
};

// Handlers return sentences; an empty list means "nothing recognisable", and the caller falls back to the old label.
const HANDLERS: Record<string, Handler> = {
  'project.created': ({ after }) => ({
    icon: 'projects',
    sentences: typeof after.name === 'string' ? [`Created the project ${quote(after.name)}`] : [],
  }),
  'flag.created': (c) => ({ icon: 'flag', sentences: createdFlagSentence(c) }),
  'flag.updated': ({ before, after }) => ({
    icon: 'flag',
    sentences: flagEditSentences(before, after),
  }),
  'flag.archived': ({ after }) => ({
    icon: 'flag',
    sentences: [after.archived === false ? 'Restored the flag' : 'Archived the flag'],
  }),
  'flag.environment.updated': ({ event, before, after }) => ({
    icon: 'rollout',
    sentences: environmentSentences(event, before, after),
  }),
  'flag.kill_switch.enabled': (c) => ({ icon: 'kill', sentences: [killSentence(c)] }),
  'flag.kill_switch.disabled': ({ where }) => ({
    icon: 'kill',
    sentences: [`Released the kill switch in ${where}`],
  }),
  'api_key.created': ({ event, after }) => ({
    icon: 'key',
    sentences: [keySentence('Created', after, event)],
  }),
  'api_key.revoked': ({ event, before }) => ({
    icon: 'key',
    sentences: [keySentence('Revoked', before, event)],
  }),
};

/**
 * One or more plain sentences for an event, with an icon. Ids never appear. An action it does not know, or data of
 * an unexpected shape, falls back to the older label, so the log never hides an event and never throws.
 */
export function describeEvent(event: AuditEventView): EventDescription {
  const context: Context = {
    event,
    before: isRecord(event.before) ? event.before : {},
    after: isRecord(event.after) ? event.after : {},
    where: event.environmentKey ?? 'this environment',
  };
  const handler = HANDLERS[event.action];
  const described = handler?.(context);
  return {
    icon: described?.icon ?? 'audit',
    sentences:
      described && described.sentences.length > 0 ? described.sentences : [actionLabel(event)],
  };
}

export interface DayGroup {
  key: string;
  label: string;
  events: AuditEventView[];
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** The calendar date in `timeZone`, taken from the parts of the date, never from formatted text. */
function calendarDate(date: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

const keyOf = ({ year, month, day }: CalendarDate): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** "Wednesday 7 October", with the year when it is not the current one. Built from parts: no locale punctuation. */
function longLabel(date: Date, timeZone: string, withYear: boolean): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return [parts.weekday, parts.day, parts.month, withYear ? parts.year : undefined]
    .filter(Boolean)
    .join(' ');
}

interface Days {
  today: string;
  yesterday: string;
  timeZone: string;
}

function labelFor(date: Date, key: string, days: Days): string {
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  if (key === days.today) return 'Today';
  if (key === days.yesterday) return 'Yesterday';
  return longLabel(date, days.timeZone, key.slice(0, 4) !== days.today.slice(0, 4));
}

/**
 * Groups events (already newest first) by calendar day in `timeZone`, keeping the order given. "Yesterday" is worked
 * out from the calendar date, not by subtracting 24 hours, so a 23 or 25 hour day (daylight saving) is one day.
 * `now` is passed in, never read from the clock here, so the result is the same on every machine.
 */
export function groupByDay(events: AuditEventView[], now: Date, timeZone: string): DayGroup[] {
  const todayDate = calendarDate(now, timeZone);
  const today = keyOf(todayDate);
  const before = new Date(Date.UTC(todayDate.year, todayDate.month - 1, todayDate.day - 1));
  const yesterday = keyOf({
    year: before.getUTCFullYear(),
    month: before.getUTCMonth() + 1,
    day: before.getUTCDate(),
  });
  const days: Days = { today, yesterday, timeZone };
  const groups = new Map<string, DayGroup>();
  for (const event of events) {
    const date = new Date(event.createdAt);
    const key = Number.isNaN(date.getTime()) ? 'unknown' : keyOf(calendarDate(date, timeZone));
    const group = groups.get(key) ?? { key, label: labelFor(date, key, days), events: [] };
    group.events.push(event);
    groups.set(key, group);
  }
  return [...groups.values()];
}
