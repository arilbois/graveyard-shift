import {
  BREAK_END_GRACE_MS,
  CONFIRM_TIMEOUT_MS,
  EYE_REST_MS,
  LONG_BREAK_MS,
  MEANINGFUL_BREAK_MS,
} from '../../shared/constants';
import { trustedWallGap, type Instant } from '../../shared/time';

/**
 * Breaks are credited only when the user confirms them (R5, design §4.5). This module tracks the
 * eye-rest countdown and the take-a-break flow; the engine applies the effects of a recorded break.
 */

export type BreakSource = 'reminder' | 'longSession' | 'command';

/** Eye Rest is not a break; short/meaningful/long follow the 5 and 15 minute boundaries. */
export type BreakKind = 'eyeRest' | 'short' | 'meaningful' | 'long';

export interface BreakRecord {
  readonly kind: BreakKind;
  readonly durationMs: number;
  /** The reminder occurrence the break was started from, if any. */
  readonly occurrenceId: string | null;
}

export type BreakState =
  | { readonly phase: 'none' }
  | {
      readonly phase: 'eyeRest';
      readonly id: string;
      readonly startedAt: Instant;
      readonly occurrenceId: string | null;
    }
  | {
      readonly phase: 'onBreak';
      readonly id: string;
      readonly startedAt: Instant;
      readonly source: BreakSource;
      readonly occurrenceId: string | null;
    }
  | {
      readonly phase: 'awaitingConfirm';
      readonly id: string;
      readonly startedAt: Instant;
      readonly endedAt: Instant;
      /** Wall-clock length, or null when the wall clock moved backwards (R5.9). */
      readonly durationMs: number | null;
      readonly source: BreakSource;
      readonly occurrenceId: string | null;
    };

export type BreakOutcome =
  | { readonly type: 'recorded'; readonly record: BreakRecord }
  /** Eye rest cancelled, break declined or confirmation timed out: nothing is credited. */
  | { readonly type: 'notCredited'; readonly occurrenceId: string | null };

export interface BreakResult {
  readonly state: BreakState;
  readonly outcome: BreakOutcome | null;
}

export const NO_BREAK: BreakState = { phase: 'none' };

const same = (state: BreakState): BreakResult => ({ state, outcome: null });

export function classifyBreak(durationMs: number): Exclude<BreakKind, 'eyeRest'> {
  if (durationMs >= LONG_BREAK_MS) return 'long';
  if (durationMs >= MEANINGFUL_BREAK_MS) return 'meaningful';
  return 'short';
}

/** While these phases last, nothing is credited as Active Time and nothing is surfaced. */
export function isSuspending(state: BreakState): boolean {
  return state.phase === 'eyeRest' || state.phase === 'onBreak';
}

/** Elapsed time that survives sleep: the larger of monotonic and non-negative wall elapsed. */
function awayFor(from: Instant, to: Instant): number {
  return Math.max(to.mono - from.mono, trustedWallGap(from.wall, to) ?? 0);
}

export function startEyeRest(state: BreakState, id: string, at: Instant, occurrenceId: string | null): BreakResult {
  if (state.phase !== 'none') return same(state);
  return same({ phase: 'eyeRest', id, startedAt: at, occurrenceId });
}

export function cancelEyeRest(state: BreakState): BreakResult {
  if (state.phase !== 'eyeRest') return same(state);
  return { state: NO_BREAK, outcome: { type: 'notCredited', occurrenceId: state.occurrenceId } };
}

export function startBreak(
  state: BreakState,
  id: string,
  at: Instant,
  source: BreakSource,
  occurrenceId: string | null,
): BreakResult {
  if (state.phase !== 'none') return same(state);
  return same({ phase: 'onBreak', id, startedAt: at, source, occurrenceId });
}

function endAt(state: Extract<BreakState, { phase: 'onBreak' }>, at: Instant): BreakState {
  return {
    phase: 'awaitingConfirm',
    id: state.id,
    startedAt: state.startedAt,
    endedAt: at,
    durationMs: trustedWallGap(state.startedAt.wall, at),
    source: state.source,
    occurrenceId: state.occurrenceId,
  };
}

/** "I'm back" (R5.5). */
export function endBreak(state: BreakState, breakId: string, at: Instant): BreakResult {
  if (state.phase !== 'onBreak' || state.id !== breakId) return same(state);
  return same(endAt(state, at));
}

/** The first Activity Signal after the grace period ends a break and asks for confirmation (R5.5). */
export function breakSignal(state: BreakState, at: Instant): BreakResult {
  if (state.phase !== 'onBreak' || awayFor(state.startedAt, at) <= BREAK_END_GRACE_MS) return same(state);
  return same(endAt(state, at));
}

/**
 * The user's answer to "Count it as a break?". When the duration is unknown, the user's choice of
 * "5 minutes or more" decides whether it is meaningful.
 */
export function confirmBreak(
  state: BreakState,
  breakId: string,
  confirmed: boolean,
  atLeastFiveMinutes: boolean,
): BreakResult {
  if (state.phase !== 'awaitingConfirm' || state.id !== breakId) return same(state);
  if (!confirmed) return { state: NO_BREAK, outcome: { type: 'notCredited', occurrenceId: state.occurrenceId } };
  const durationMs = state.durationMs ?? (atLeastFiveMinutes ? MEANINGFUL_BREAK_MS : 0);
  return {
    state: NO_BREAK,
    outcome: {
      type: 'recorded',
      record: { kind: classifyBreak(durationMs), durationMs, occurrenceId: state.occurrenceId },
    },
  };
}

/** Time-driven transitions: the eye-rest countdown completes; an unanswered confirmation lapses. */
export function tickBreaks(state: BreakState, at: Instant): BreakResult {
  switch (state.phase) {
    case 'eyeRest':
      if (at.mono - state.startedAt.mono < EYE_REST_MS) return same(state);
      return {
        state: NO_BREAK,
        outcome: {
          type: 'recorded',
          record: { kind: 'eyeRest', durationMs: EYE_REST_MS, occurrenceId: state.occurrenceId },
        },
      };
    case 'awaitingConfirm':
      if (awayFor(state.endedAt, at) < CONFIRM_TIMEOUT_MS) return same(state);
      return { state: NO_BREAK, outcome: { type: 'notCredited', occurrenceId: state.occurrenceId } };
    case 'none':
    case 'onBreak':
      return same(state);
  }
}

/** Monotonic deadline of the next time-driven transition, for the runtime's one-shot timer. */
export function breakDeadline(state: BreakState): number | null {
  switch (state.phase) {
    case 'eyeRest':
      return state.startedAt.mono + EYE_REST_MS;
    case 'awaitingConfirm':
      return state.endedAt.mono + CONFIRM_TIMEOUT_MS;
    case 'none':
    case 'onBreak':
      return null;
  }
}
