import { describe, expect, it } from 'vitest';
import {
  INITIAL_COMPANION,
  applyBreak,
  applyMissedBreak,
  applyThresholds,
  companionDeadline,
  countCap,
  displayedStage,
  stageFor,
  tickCompanion,
  type CompanionState,
} from '../../src/extension/companion/stage';
import type { StageThresholds } from '../../src/shared/config';
import { RECOVERY_DISPLAY_MS } from '../../src/shared/constants';

const T: StageThresholds = { tired: 1, infected: 3, zombie: 5 };
const AT = { mono: 1_000, wall: 1_000 };

function missed(times: number, from: CompanionState = INITIAL_COMPANION, t = T): CompanionState {
  let state = from;
  for (let i = 0; i < times; i++) state = applyMissedBreak(state, t);
  return state;
}

describe('stageFor with default thresholds 1 / 3 / 5 (R10.2)', () => {
  it.each([
    [0, 'human'],
    [1, 'tired'],
    [2, 'tired'],
    [3, 'infected'],
    [4, 'infected'],
    [5, 'zombie'],
    [7, 'zombie'],
  ] as const)('%i missed breaks → %s', (count, stage) => {
    expect(stageFor(count, T)).toBe(stage);
  });

  it('follows custom thresholds', () => {
    const custom = { tired: 2, infected: 4, zombie: 8 };
    expect(stageFor(1, custom)).toBe('human');
    expect(stageFor(7, custom)).toBe('infected');
    expect(stageFor(8, custom)).toBe('zombie');
  });
});

describe('missed breaks', () => {
  it('walks Human → Tired → Infected → Zombie at 1, 3 and 5 missed breaks', () => {
    const stages = [1, 2, 3, 4, 5].map((n) => missed(n).stage);
    expect(stages).toStrictEqual(['tired', 'tired', 'infected', 'infected', 'zombie']);
  });

  it('caps the count at zombie + 2 (R10.3)', () => {
    expect(missed(20).count).toBe(countCap(T));
    expect(countCap(T)).toBe(7);
  });

  it('rises at most one stage per event even when thresholds jump (R10.5)', () => {
    const atThree = missed(3, INITIAL_COMPANION, { tired: 10, infected: 11, zombie: 12 });
    expect(atThree.stage).toBe('human');
    const lowered = applyThresholds(atThree, T);
    expect(lowered.stage).toBe('tired');
    expect(applyMissedBreak(lowered, T).stage).toBe('infected');
  });

  it('ends Recovery early', () => {
    const recovering = applyBreak(missed(2), 'short', T, AT).state;
    expect(displayedStage(recovering)).toBe('recovery');
    const after = applyMissedBreak(recovering, T);
    expect(after.recoveryUntil).toBeNull();
    expect(displayedStage(after)).toBe('tired');
  });
});

describe('breaks (R10.4, R10.6, R10.7)', () => {
  it('an Eye Rest changes nothing', () => {
    const state = missed(3);
    expect(applyBreak(state, 'eyeRest', T, AT)).toStrictEqual({ state, recoveryStarted: false });
  });

  it('a short break reduces the count by 1, a Meaningful Break by 2, a Long Break to 0', () => {
    const state = missed(5);
    expect(applyBreak(state, 'short', T, AT).state.count).toBe(4);
    expect(applyBreak(state, 'meaningful', T, AT).state.count).toBe(3);
    expect(applyBreak(state, 'long', T, AT).state.count).toBe(0);
    expect(applyBreak(INITIAL_COMPANION, 'meaningful', T, AT).state.count).toBe(0);
  });

  it('one Meaningful Break from Zombie never returns straight to Human', () => {
    for (let n = 5; n <= 7; n++) {
      const after = applyBreak(missed(n), 'meaningful', T, AT).state;
      expect(after.stage).not.toBe('human');
    }
    expect(applyBreak(missed(5), 'meaningful', T, AT).state.stage).toBe('infected');
  });

  it('a Long Break from Zombie returns to Human after Recovery', () => {
    const result = applyBreak(missed(7), 'long', T, AT);
    expect(result.recoveryStarted).toBe(true);
    expect(displayedStage(result.state)).toBe('recovery');
    expect(displayedStage(tickCompanion(result.state, { mono: AT.mono + RECOVERY_DISPLAY_MS, wall: 0 }))).toBe('human');
  });

  it('shows Recovery for 3 minutes only when the companion was unwell', () => {
    expect(applyBreak(INITIAL_COMPANION, 'meaningful', T, AT).recoveryStarted).toBe(false);
    const result = applyBreak(missed(1), 'meaningful', T, AT);
    expect(result.recoveryStarted).toBe(true);
    expect(companionDeadline(result.state)).toBe(AT.mono + RECOVERY_DISPLAY_MS);
    expect(displayedStage(tickCompanion(result.state, { mono: AT.mono + RECOVERY_DISPLAY_MS - 1, wall: 0 }))).toBe(
      'recovery',
    );
  });

  it('a second break during Recovery extends it without starting a second cue', () => {
    const first = applyBreak(missed(3), 'short', T, AT).state;
    const second = applyBreak(first, 'short', T, { mono: AT.mono + 60_000, wall: 0 });
    expect(second.recoveryStarted).toBe(false);
    expect(second.state.recoveryUntil?.mono).toBe(AT.mono + 60_000 + RECOVERY_DISPLAY_MS);
  });
});
