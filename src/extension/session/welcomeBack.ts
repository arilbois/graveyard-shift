import {
  CONFIRM_TIMEOUT_MS,
  SESSION_RESET_GAP_MS,
  WELCOME_BACK_MIN_GAP_MS,
  WELCOME_BACK_RATE_MS,
} from '../../shared/constants';
import type { Instant } from '../../shared/time';
import { classifyBreak, type BreakRecord } from './breaks';

/**
 * "Welcome back. Were you taking a break?" after an idle, unfocused, asleep or restarted period of at
 * least 5 minutes (R5.8). Yes credits the measured gap; No or no answer credits nothing.
 */

export interface WelcomeBackPrompt {
  readonly id: string;
  readonly gapMs: number;
  readonly offeredAt: Instant;
}

export interface WelcomeBackState {
  readonly prompt: WelcomeBackPrompt | null;
  readonly lastOfferedWall: number | null;
}

export const NO_WELCOME_BACK: WelcomeBackState = { prompt: null, lastOfferedWall: null };

/**
 * Offers the prompt when the gap is trusted, long enough, shorter than a session reset, and the last
 * offer was at least 30 minutes ago. An existing prompt is replaced by the newer, longer absence.
 */
export function offerWelcomeBack(
  state: WelcomeBackState,
  id: string,
  gapMs: number | null,
  at: Instant,
): WelcomeBackState {
  if (gapMs === null || gapMs < WELCOME_BACK_MIN_GAP_MS || gapMs >= SESSION_RESET_GAP_MS) return state;
  if (state.lastOfferedWall !== null) {
    const sinceLast = at.wall - state.lastOfferedWall;
    if (sinceLast < 0 || sinceLast < WELCOME_BACK_RATE_MS) return state;
  }
  return { prompt: { id, gapMs, offeredAt: at }, lastOfferedWall: at.wall };
}

export interface WelcomeBackAnswer {
  readonly state: WelcomeBackState;
  readonly record: BreakRecord | null;
}

export function answerWelcomeBack(state: WelcomeBackState, promptId: string, tookBreak: boolean): WelcomeBackAnswer {
  if (state.prompt?.id !== promptId) return { state, record: null };
  const { gapMs } = state.prompt;
  return {
    state: { ...state, prompt: null },
    record: tookBreak ? { kind: classifyBreak(gapMs), durationMs: gapMs, occurrenceId: null } : null,
  };
}

/** Withdraws the prompt when a break flow starts, so two confirmations never compete. */
export function withdrawWelcomeBack(state: WelcomeBackState): WelcomeBackState {
  return state.prompt === null ? state : { ...state, prompt: null };
}

/** An unanswered prompt quietly lapses after the confirmation timeout. */
export function tickWelcomeBack(state: WelcomeBackState, at: Instant): WelcomeBackState {
  if (state.prompt === null || at.mono - state.prompt.offeredAt.mono < CONFIRM_TIMEOUT_MS) return state;
  return { ...state, prompt: null };
}

export function welcomeBackDeadline(state: WelcomeBackState): number | null {
  return state.prompt === null ? null : state.prompt.offeredAt.mono + CONFIRM_TIMEOUT_MS;
}
