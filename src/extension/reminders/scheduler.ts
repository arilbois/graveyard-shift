import type { EffectiveConfig } from '../../shared/config';
import { COMBINE_WINDOW_MS, MAX_SNOOZES, MINUTE_MS, MISSED_AFTER_MS } from '../../shared/constants';
import { REMINDER_KINDS, type ReminderKind } from '../../shared/domain';
import type { Instant } from '../../shared/time';

/**
 * Reminder scheduling (R6, R8, design §4.6). All timing is in Active Time (the Session's `activeMs`),
 * so idle, unfocused, paused or asleep time never makes reminders pile up.
 *
 * There is at most one live occurrence. Kinds that become due while it is still pending or snoozed
 * join it; kinds that become due while it is on screen wait until it is resolved, so the card never
 * changes under the user's pointer.
 */

export type OccurrenceStatus = 'pending' | 'surfaced' | 'subtle' | 'snoozed';
export type Outcome = 'taken' | 'skipped' | 'missed' | 'withdrawn';

export interface Occurrence {
  readonly id: string;
  readonly kinds: readonly ReminderKind[];
  readonly status: OccurrenceStatus;
  /** When it last became pending; bounds focus-mode deferral (R7.2, R7.3). */
  readonly pendingSince: Instant;
  /** Active Time at the latest delivery (surfaced or subtle); starts the missed window (R7.9). */
  readonly deliveredAtActiveMs: number | null;
  readonly snoozes: number;
  readonly snoozedUntilActiveMs: number | null;
}

export interface ReminderState {
  readonly accum: Readonly<Record<ReminderKind, number>>;
  readonly live: Occurrence | null;
  /** Active Time of the last interruptive surfacing, for spacing (R6.5). */
  readonly lastSurfacedActiveMs: number | null;
  readonly seq: number;
}

export interface Resolution {
  readonly occurrence: Occurrence;
  readonly outcome: Outcome;
}

export interface SchedulerResult {
  readonly state: ReminderState;
  readonly resolutions: readonly Resolution[];
}

const ZERO_ACCUM: Readonly<Record<ReminderKind, number>> = { eye: 0, movement: 0, hydration: 0 };

export const INITIAL_REMINDERS: ReminderState = { accum: ZERO_ACCUM, live: null, lastSurfacedActiveMs: null, seq: 0 };

/** Break Reminders include movement or hydration; eye-only occurrences are not breaks (glossary). */
export function isBreakReminder(occurrence: Occurrence): boolean {
  return occurrence.kinds.some((kind) => kind !== 'eye');
}

/** A Missed Break is a Break Reminder that ended skipped or missed, counted once (R8.5). */
export function isMissedBreak(resolution: Resolution): boolean {
  return (
    (resolution.outcome === 'skipped' || resolution.outcome === 'missed') && isBreakReminder(resolution.occurrence)
  );
}

function intervalMs(config: EffectiveConfig, kind: ReminderKind): number {
  return config.reminders[kind].minutes * MINUTE_MS;
}

function enabled(config: EffectiveConfig, kind: ReminderKind): boolean {
  return config.reminders[kind].enabled;
}

const ok = (state: ReminderState, resolutions: readonly Resolution[] = []): SchedulerResult => ({ state, resolutions });

function resolve(state: ReminderState, outcome: Outcome): SchedulerResult {
  const { live } = state;
  if (live === null) return ok(state);
  const accum = { ...state.accum };
  for (const kind of live.kinds) accum[kind] = 0;
  return ok({ ...state, accum, live: null }, [{ occurrence: live, outcome }]);
}

/** Adds credited Active Time to every enabled kind. */
export function accumulate(state: ReminderState, ms: number, config: EffectiveConfig): ReminderState {
  if (ms <= 0) return state;
  const accum = { ...state.accum };
  for (const kind of REMINDER_KINDS) if (enabled(config, kind)) accum[kind] += ms;
  return { ...state, accum };
}

export interface EvaluateContext {
  readonly config: EffectiveConfig;
  readonly activeMs: number;
  readonly at: Instant;
}

function dueKinds(state: ReminderState, config: EffectiveConfig, excluded: readonly ReminderKind[]): ReminderKind[] {
  const candidates = REMINDER_KINDS.filter((kind) => enabled(config, kind) && !excluded.includes(kind));
  if (!candidates.some((kind) => state.accum[kind] >= intervalMs(config, kind))) return [];
  // Combine every kind that is within the combine window of its own interval (R6.4).
  return candidates.filter((kind) => state.accum[kind] >= intervalMs(config, kind) - COMBINE_WINDOW_MS);
}

/**
 * Time-driven transitions, run on every engine step: missed timeout, snooze expiry, and creating or
 * extending the live occurrence. Returns any resolution produced (at most one).
 */
export function evaluate(state: ReminderState, ctx: EvaluateContext): SchedulerResult {
  let current = state;
  const resolutions: Resolution[] = [];
  const { live } = current;

  if (
    live !== null &&
    (live.status === 'surfaced' || live.status === 'subtle') &&
    live.deliveredAtActiveMs !== null &&
    ctx.activeMs - live.deliveredAtActiveMs >= MISSED_AFTER_MS
  ) {
    const missed = resolve(current, 'missed');
    current = missed.state;
    resolutions.push(...missed.resolutions);
  }

  if (
    current.live?.status === 'snoozed' &&
    current.live.snoozedUntilActiveMs !== null &&
    ctx.activeMs >= current.live.snoozedUntilActiveMs
  ) {
    current = {
      ...current,
      live: { ...current.live, status: 'pending', pendingSince: ctx.at, snoozedUntilActiveMs: null },
    };
  }

  if (current.live === null) {
    const kinds = dueKinds(current, ctx.config, []);
    if (kinds.length > 0) {
      const seq = current.seq + 1;
      current = {
        ...current,
        seq,
        live: {
          id: `occ-${seq}`,
          kinds,
          status: 'pending',
          pendingSince: ctx.at,
          deliveredAtActiveMs: null,
          snoozes: 0,
          snoozedUntilActiveMs: null,
        },
      };
    }
  } else if (current.live.status === 'pending' || current.live.status === 'snoozed') {
    const joining = dueKinds(current, ctx.config, current.live.kinds);
    if (joining.length > 0) {
      const kinds = REMINDER_KINDS.filter((k) => current.live?.kinds.includes(k) === true || joining.includes(k));
      current = { ...current, live: { ...current.live, kinds } };
    }
  }

  return ok(current, resolutions);
}

/** Records delivery of the live pending occurrence (R7.1–R7.4). */
export function markDelivered(state: ReminderState, mode: 'surfaced' | 'subtle', activeMs: number): ReminderState {
  if (state.live?.status !== 'pending') return state;
  return {
    ...state,
    live: { ...state.live, status: mode, deliveredAtActiveMs: activeMs },
    lastSurfacedActiveMs: mode === 'surfaced' ? activeMs : state.lastSurfacedActiveMs,
  };
}

const isLive = (state: ReminderState, id: string): boolean => state.live?.id === id;

/** Snooze re-surfaces after `snoozeMinutes`; the third snooze resolves it as missed (R8.2, R8.3). */
export function snooze(state: ReminderState, id: string, activeMs: number, config: EffectiveConfig): SchedulerResult {
  const { live } = state;
  if (live?.id !== id) return ok(state);
  if (live.snoozes >= MAX_SNOOZES) return resolve(state, 'missed');
  return ok({
    ...state,
    live: {
      ...live,
      status: 'snoozed',
      snoozes: live.snoozes + 1,
      snoozedUntilActiveMs: activeMs + config.reminders.snoozeMinutes * MINUTE_MS,
      deliveredAtActiveMs: null,
    },
  });
}

export function skip(state: ReminderState, id: string): SchedulerResult {
  return isLive(state, id) ? resolve(state, 'skipped') : ok(state);
}

/** What "Take a break" on the live occurrence starts: an Eye Rest for eye-only, else the break flow (R8.1). */
export function takeBreakTarget(state: ReminderState, id: string): 'eyeRest' | 'break' | null {
  if (state.live?.id !== id) return null;
  return isBreakReminder(state.live) ? 'break' : 'eyeRest';
}

/** A confirmed Eye Rest resets the eye accumulator and takes care of the eye part of the live occurrence. */
export function applyEyeRest(state: ReminderState): SchedulerResult {
  const reset: ReminderState = { ...state, accum: { ...state.accum, eye: 0 } };
  const { live } = reset;
  if (!live?.kinds.includes('eye')) return ok(reset);
  if (live.kinds.length === 1) return resolve(reset, 'taken');
  return ok({ ...reset, live: { ...live, kinds: live.kinds.filter((kind) => kind !== 'eye') } });
}

/** A short confirmed break resolves only the occurrence it was started from (R5.7). */
export function applyShortBreak(state: ReminderState, occurrenceId: string | null): SchedulerResult {
  return occurrenceId !== null && isLive(state, occurrenceId) ? resolve(state, 'taken') : ok(state);
}

/** A Meaningful or Long Break resets every accumulator and resolves the live occurrence as taken (R5.6). */
export function applyMeaningfulBreak(state: ReminderState): SchedulerResult {
  const result = resolve(state, 'taken');
  return ok({ ...result.state, accum: ZERO_ACCUM }, result.resolutions);
}

/** Disabled kinds are withdrawn without an outcome and their accumulators reset (R2.9). */
export function applyConfig(state: ReminderState, config: EffectiveConfig): SchedulerResult {
  const accum = { ...state.accum };
  for (const kind of REMINDER_KINDS) if (!enabled(config, kind)) accum[kind] = 0;
  const next: ReminderState = { ...state, accum };
  const { live } = next;
  if (live === null) return ok(next);
  const kinds = live.kinds.filter((kind) => enabled(config, kind));
  if (kinds.length === live.kinds.length) return ok(next);
  if (kinds.length === 0) return ok({ ...next, live: null }, [{ occurrence: live, outcome: 'withdrawn' }]);
  return ok({ ...next, live: { ...live, kinds } });
}

/** A new Session withdraws everything and starts from zero; ids keep increasing (R4.7). */
export function resetForNewSession(state: ReminderState): SchedulerResult {
  const resolutions: Resolution[] = state.live === null ? [] : [{ occurrence: state.live, outcome: 'withdrawn' }];
  return ok({ accum: ZERO_ACCUM, live: null, lastSurfacedActiveMs: null, seq: state.seq }, resolutions);
}
