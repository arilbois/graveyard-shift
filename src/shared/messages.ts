import { COMPANION_STAGES, REMINDER_KINDS } from './domain';
import type { UserIntent } from './intents';
import type { CompanionViewModel } from './viewModel';

/**
 * Message protocol v1 between the Host and Webviews (design §7.2, R15.3). Both sides import these
 * validators, so the rules cannot drift. Validators are hand-written type guards that check exact
 * keys, literal values and id format; anything else is dropped.
 */

export const PROTOCOL_VERSION = 1;

export type WebviewSurface = 'sidebar' | 'lastHuman';

/** Intents a Webview may send. Pausing is command-only, so it is not accepted here. */
export type WebviewIntent = Exclude<UserIntent, { kind: 'pause.start' }>;

export type WebviewToHost =
  | { readonly v: 1; readonly type: 'ready'; readonly surface: WebviewSurface }
  | { readonly v: 1; readonly type: 'intent'; readonly intent: WebviewIntent }
  | { readonly v: 1; readonly type: 'ui/interaction' }
  | { readonly v: 1; readonly type: 'sound/setEnabled'; readonly enabled: boolean };

export type Cue = 'reminder' | 'recovery';

export type HostToWebview =
  | { readonly v: 1; readonly type: 'snapshot'; readonly viewModel: CompanionViewModel }
  | { readonly v: 1; readonly type: 'cue'; readonly cue: Cue };

type Rec = Readonly<Record<string, unknown>>;

const ID_PATTERN = /^[A-Za-z0-9#+-]{1,64}$/;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Rec, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

const isBool = (value: unknown): value is boolean => typeof value === 'boolean';

function isWebviewIntent(value: unknown): value is WebviewIntent {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'reminder.takeBreak':
    case 'reminder.snooze':
    case 'reminder.skip':
      return hasExactKeys(value, ['kind', 'occurrenceId']) && isId(value.occurrenceId);
    case 'eyeRest.start':
    case 'eyeRest.cancel':
    case 'break.start':
    case 'pause.resume':
      return hasExactKeys(value, ['kind']);
    case 'break.end':
      return hasExactKeys(value, ['kind', 'breakId']) && isId(value.breakId);
    case 'break.confirm':
      return (
        hasExactKeys(value, ['kind', 'breakId', 'confirmed', 'atLeastFiveMinutes']) &&
        isId(value.breakId) &&
        isBool(value.confirmed) &&
        isBool(value.atLeastFiveMinutes)
      );
    case 'welcomeBack.answer':
      return hasExactKeys(value, ['kind', 'promptId', 'tookBreak']) && isId(value.promptId) && isBool(value.tookBreak);
    default:
      return false;
  }
}

export function parseWebviewMessage(raw: unknown): WebviewToHost | null {
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION) return null;
  switch (raw.type) {
    case 'ready':
      return hasExactKeys(raw, ['v', 'type', 'surface']) && (raw.surface === 'sidebar' || raw.surface === 'lastHuman')
        ? { v: 1, type: 'ready', surface: raw.surface }
        : null;
    case 'intent':
      return hasExactKeys(raw, ['v', 'type', 'intent']) && isWebviewIntent(raw.intent)
        ? { v: 1, type: 'intent', intent: raw.intent }
        : null;
    case 'ui/interaction':
      return hasExactKeys(raw, ['v', 'type']) ? { v: 1, type: 'ui/interaction' } : null;
    case 'sound/setEnabled':
      return hasExactKeys(raw, ['v', 'type', 'enabled']) && isBool(raw.enabled)
        ? { v: 1, type: 'sound/setEnabled', enabled: raw.enabled }
        : null;
    default:
      return null;
  }
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNullOr = (value: unknown, check: (v: Rec) => boolean): boolean =>
  value === null || (isRecord(value) && check(value));

/** Structural check of a snapshot: every field the Webview renders has the expected type. */
export function isCompanionViewModel(value: unknown): value is CompanionViewModel {
  if (!isRecord(value) || value.protocol !== PROTOCOL_VERSION) return false;
  const { companion, sound, stats, reminder } = value;
  return (
    isRecord(companion) &&
    isBool(companion.enabled) &&
    COMPANION_STAGES.some((stage) => stage === companion.stage) &&
    isString(companion.label) &&
    isString(companion.line) &&
    isString(companion.description) &&
    (value.motion === 'full' || value.motion === 'reduced') &&
    isRecord(sound) &&
    isBool(sound.enabled) &&
    isNumber(sound.volume) &&
    isString(value.status) &&
    isString(value.statusText) &&
    isNullOr(
      reminder,
      (r) =>
        isId(r.id) &&
        Array.isArray(r.kinds) &&
        r.kinds.every((k) => REMINDER_KINDS.some((kind) => kind === k)) &&
        isString(r.title) &&
        isString(r.body) &&
        isBool(r.subtle),
    ) &&
    isNullOr(value.demo, (d) => isString(d.label)) &&
    isNullOr(value.snoozed, (s) => isString(s.text)) &&
    (value.notice === null || isString(value.notice)) &&
    isNullOr(value.eyeRest, (e) => isNumber(e.endsAtWall) && isString(e.text)) &&
    isNullOr(value.onBreak, (b) => isId(b.id) && isNumber(b.startedAtWall) && isString(b.text)) &&
    isNullOr(value.confirmBreak, (c) => isId(c.id) && isString(c.question) && isBool(c.askDuration)) &&
    isNullOr(value.welcomeBack, (w) => isId(w.id) && isString(w.question)) &&
    isNullOr(value.paused, (p) => isString(p.text)) &&
    isRecord(stats) &&
    isString(stats.text)
  );
}

export function parseHostMessage(raw: unknown): HostToWebview | null {
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.type === 'snapshot' && hasExactKeys(raw, ['v', 'type', 'viewModel']) && isCompanionViewModel(raw.viewModel)) {
    return { v: 1, type: 'snapshot', viewModel: raw.viewModel };
  }
  if (raw.type === 'cue' && hasExactKeys(raw, ['v', 'type', 'cue']) && (raw.cue === 'reminder' || raw.cue === 'recovery')) {
    return { v: 1, type: 'cue', cue: raw.cue };
  }
  return null;
}

const KNOWN_TYPES: readonly string[] = ['ready', 'intent', 'ui/interaction', 'sound/setEnabled', 'snapshot', 'cue'];

/**
 * A safe label for logging a dropped message: its type only if it is a known protocol type, so no
 * user data (paths, text) can ever reach the log through a crafted `type` (R14.7).
 */
export function messageTypeForLog(raw: unknown): string {
  return isRecord(raw) && isString(raw.type) && KNOWN_TYPES.includes(raw.type) ? raw.type : 'unknown';
}
