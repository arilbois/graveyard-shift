import type { StageThresholds } from '../../shared/config';
import {
  COUNT_CAP_OFFSET,
  MEANINGFUL_BREAK_CREDIT,
  RECOVERY_DISPLAY_MS,
  SHORT_BREAK_CREDIT,
} from '../../shared/constants';
import type { CompanionStage } from '../../shared/domain';
import type { Instant } from '../../shared/time';
import type { BreakKind } from '../session/breaks';

/**
 * Companion state machine (R10, design §4.7). The resting stage comes from the Missed Break Count
 * only, never from hours alone. It rises at most one step per event and passes through Recovery
 * on the way down. These are product mechanics, not health assessments.
 */

export type RestingStage = Exclude<CompanionStage, 'recovery'>;

const ORDER: readonly RestingStage[] = ['human', 'tired', 'infected', 'zombie'];

export interface CompanionState {
  readonly count: number;
  readonly stage: RestingStage;
  /** Recovery is shown until this instant; null when not recovering. Not persisted (a 3-minute visual). */
  readonly recoveryUntil: Instant | null;
}

export const INITIAL_COMPANION: CompanionState = { count: 0, stage: 'human', recoveryUntil: null };

export function stageFor(count: number, t: StageThresholds): RestingStage {
  if (count >= t.zombie) return 'zombie';
  if (count >= t.infected) return 'infected';
  if (count >= t.tired) return 'tired';
  return 'human';
}

export function countCap(t: StageThresholds): number {
  return t.zombie + COUNT_CAP_OFFSET;
}

const rank = (stage: RestingStage): number => ORDER.indexOf(stage);

/** Up by at most one step; down directly (downward moves are shown through Recovery). */
function stepToward(current: RestingStage, target: RestingStage): RestingStage {
  const from = rank(current);
  const to = rank(target);
  if (to <= from) return target;
  return ORDER[from + 1] ?? current;
}

/** A Missed Break adds exactly one, ends any Recovery early, and rises at most one stage (R10.5). */
export function applyMissedBreak(state: CompanionState, t: StageThresholds): CompanionState {
  const count = Math.min(countCap(t), state.count + 1);
  return { count, stage: stepToward(state.stage, stageFor(count, t)), recoveryUntil: null };
}

export interface CompanionBreakResult {
  readonly state: CompanionState;
  readonly recoveryStarted: boolean;
}

/** Confirmed breaks reduce the count; Eye Rests do not change it (R10.4, R10.6). */
export function applyBreak(state: CompanionState, kind: BreakKind, t: StageThresholds, at: Instant): CompanionBreakResult {
  if (kind === 'eyeRest') return { state, recoveryStarted: false };
  const count =
    kind === 'long' ? 0 : Math.max(0, state.count - (kind === 'meaningful' ? MEANINGFUL_BREAK_CREDIT : SHORT_BREAK_CREDIT));
  const recovering = state.stage !== 'human' || state.recoveryUntil !== null;
  return {
    state: {
      count,
      stage: stepToward(state.stage, stageFor(count, t)),
      recoveryUntil: recovering ? { mono: at.mono + RECOVERY_DISPLAY_MS, wall: at.wall + RECOVERY_DISPLAY_MS } : null,
    },
    recoveryStarted: recovering && state.recoveryUntil === null,
  };
}

/** New thresholds: clamp the count to the new cap and re-derive the stage (one step at most going up). */
export function applyThresholds(state: CompanionState, t: StageThresholds): CompanionState {
  const count = Math.min(countCap(t), state.count);
  return { ...state, count, stage: stepToward(state.stage, stageFor(count, t)) };
}

export function tickCompanion(state: CompanionState, at: Instant): CompanionState {
  if (state.recoveryUntil === null || at.mono < state.recoveryUntil.mono) return state;
  return { ...state, recoveryUntil: null };
}

export function displayedStage(state: CompanionState): CompanionStage {
  return state.recoveryUntil === null ? state.stage : 'recovery';
}

export function companionDeadline(state: CompanionState): number | null {
  return state.recoveryUntil?.mono ?? null;
}
