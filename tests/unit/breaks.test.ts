import { beforeEach, describe, expect, it } from 'vitest';
import {
  BREAK_END_GRACE_MS,
  CONFIRM_TIMEOUT_MS,
  EYE_REST_MS,
  HOUR_MS,
  LONG_BREAK_MS,
  MEANINGFUL_BREAK_MS,
  MINUTE_MS,
  SECOND_MS,
  SESSION_RESET_GAP_MS,
  WELCOME_BACK_MIN_GAP_MS,
  WELCOME_BACK_RATE_MS,
} from '../../src/shared/constants';
import {
  NO_BREAK,
  breakDeadline,
  breakSignal,
  cancelEyeRest,
  classifyBreak,
  confirmBreak,
  endBreak,
  isSuspending,
  startBreak,
  startEyeRest,
  tickBreaks,
  type BreakState,
} from '../../src/extension/session/breaks';
import {
  applyBreakToSession,
  creditSession,
  newSession,
  startsNewSession,
} from '../../src/extension/session/lifecycle';
import {
  NO_WELCOME_BACK,
  answerWelcomeBack,
  offerWelcomeBack,
  tickWelcomeBack,
  withdrawWelcomeBack,
} from '../../src/extension/session/welcomeBack';
import { FakeClock } from '../support/fakeClock';

let clock: FakeClock;
beforeEach(() => {
  clock = new FakeClock();
});

function onBreak(occurrenceId: string | null = 'occ-1-movement'): BreakState {
  return startBreak(NO_BREAK, 'brk-1', clock.now(), 'reminder', occurrenceId).state;
}

describe('classifyBreak', () => {
  it.each([
    [0, 'short'],
    [MEANINGFUL_BREAK_MS - 1, 'short'],
    [MEANINGFUL_BREAK_MS, 'meaningful'],
    [LONG_BREAK_MS - 1, 'meaningful'],
    [LONG_BREAK_MS, 'long'],
  ])('%i ms is %s', (ms, kind) => {
    expect(classifyBreak(ms)).toBe(kind);
  });
});

describe('eye rest (R5.2, R5.3)', () => {
  it('records an Eye Rest when the 20-second countdown completes', () => {
    const state = startEyeRest(NO_BREAK, 'eye-1', clock.now(), 'occ-1-eye').state;
    expect(isSuspending(state)).toBe(true);
    expect(breakDeadline(state)).toBe(clock.now().mono + EYE_REST_MS);

    clock.advance(EYE_REST_MS - 1);
    expect(tickBreaks(state, clock.now()).outcome).toBeNull();

    clock.advance(1);
    const done = tickBreaks(state, clock.now());
    expect(done.state).toStrictEqual(NO_BREAK);
    expect(done.outcome).toStrictEqual({
      type: 'recorded',
      record: { kind: 'eyeRest', durationMs: EYE_REST_MS, occurrenceId: 'occ-1-eye' },
    });
  });

  it('credits nothing when cancelled and hands back the occurrence', () => {
    const state = startEyeRest(NO_BREAK, 'eye-1', clock.now(), 'occ-1-eye').state;
    expect(cancelEyeRest(state)).toStrictEqual({
      state: NO_BREAK,
      outcome: { type: 'notCredited', occurrenceId: 'occ-1-eye' },
    });
  });

  it('is not interrupted by activity signals', () => {
    const state = startEyeRest(NO_BREAK, 'eye-1', clock.now(), null).state;
    clock.advance(5 * SECOND_MS);
    expect(breakSignal(state, clock.now()).state).toBe(state);
  });
});

describe('take a break (R5.4, R5.5)', () => {
  it('ignores signals during the 60-second grace period', () => {
    const state = onBreak();
    clock.advance(BREAK_END_GRACE_MS);
    expect(breakSignal(state, clock.now()).state).toBe(state);
  });

  it('ends at the first signal after the grace period and asks for confirmation', () => {
    const state = onBreak();
    clock.advance(7 * MINUTE_MS);
    const ended = breakSignal(state, clock.now()).state;
    expect(ended).toMatchObject({ phase: 'awaitingConfirm', id: 'brk-1', durationMs: 7 * MINUTE_MS });
    expect(isSuspending(ended)).toBe(false);
  });

  it('ends on "I\'m back" even within the grace period', () => {
    const state = onBreak();
    clock.advance(30 * SECOND_MS);
    expect(endBreak(state, 'brk-1', clock.now()).state).toMatchObject({
      phase: 'awaitingConfirm',
      durationMs: 30 * SECOND_MS,
    });
  });

  it('ignores "I\'m back" for a different break id', () => {
    const state = onBreak();
    expect(endBreak(state, 'brk-other', clock.now()).state).toBe(state);
  });

  it('measures breaks that include system sleep by wall time', () => {
    const state = onBreak();
    clock.advance(SECOND_MS);
    clock.sleep(20 * MINUTE_MS);
    const ended = breakSignal(state, clock.now()).state;
    expect(ended).toMatchObject({ phase: 'awaitingConfirm', durationMs: 20 * MINUTE_MS + SECOND_MS });
  });

  it('has an unknown duration when the wall clock moved backwards', () => {
    const state = onBreak();
    clock.advance(2 * MINUTE_MS);
    clock.shiftWall(-10 * MINUTE_MS);
    expect(breakSignal(state, clock.now()).state).toMatchObject({ phase: 'awaitingConfirm', durationMs: null });
  });

  it('does not start a second break or an eye rest while one is running', () => {
    const state = onBreak();
    expect(startBreak(state, 'brk-2', clock.now(), 'command', null).state).toBe(state);
    expect(startEyeRest(state, 'eye-2', clock.now(), null).state).toBe(state);
  });
});

describe('confirming a break (R5.1, R5.6, R5.7)', () => {
  function awaiting(minutes: number): BreakState {
    const state = onBreak('occ-3-movement+hydration');
    clock.advance(minutes * MINUTE_MS);
    return endBreak(state, 'brk-1', clock.now()).state;
  }

  it('records a Meaningful Break at exactly 5 minutes', () => {
    expect(confirmBreak(awaiting(5), 'brk-1', true, false).outcome).toStrictEqual({
      type: 'recorded',
      record: { kind: 'meaningful', durationMs: 5 * MINUTE_MS, occurrenceId: 'occ-3-movement+hydration' },
    });
  });

  it('records a short break just under 5 minutes', () => {
    const state = onBreak();
    clock.advance(MEANINGFUL_BREAK_MS - 1);
    const ended = endBreak(state, 'brk-1', clock.now()).state;
    expect(confirmBreak(ended, 'brk-1', true, false).outcome).toMatchObject({ record: { kind: 'short' } });
  });

  it('records a Long Break from 15 minutes', () => {
    expect(confirmBreak(awaiting(15), 'brk-1', true, false).outcome).toMatchObject({ record: { kind: 'long' } });
  });

  it('credits nothing when the user says no', () => {
    expect(confirmBreak(awaiting(9), 'brk-1', false, false)).toStrictEqual({
      state: NO_BREAK,
      outcome: { type: 'notCredited', occurrenceId: 'occ-3-movement+hydration' },
    });
  });

  it('uses the user\'s "5 minutes or more" answer when the duration is unknown', () => {
    const state = onBreak();
    clock.advance(MINUTE_MS);
    clock.shiftWall(-HOUR_MS);
    const ended = endBreak(state, 'brk-1', clock.now()).state;
    expect(confirmBreak(ended, 'brk-1', true, true).outcome).toMatchObject({ record: { kind: 'meaningful' } });
    expect(confirmBreak(ended, 'brk-1', true, false).outcome).toMatchObject({ record: { kind: 'short' } });
  });

  it('ignores answers for another break id', () => {
    const state = awaiting(6);
    expect(confirmBreak(state, 'brk-x', true, false)).toStrictEqual({ state, outcome: null });
  });

  it('lapses without credit when unanswered for 10 minutes', () => {
    const state = awaiting(6);
    expect(breakDeadline(state)).toBe(clock.now().mono + CONFIRM_TIMEOUT_MS);
    clock.advance(CONFIRM_TIMEOUT_MS - 1);
    expect(tickBreaks(state, clock.now()).outcome).toBeNull();
    clock.advance(1);
    expect(tickBreaks(state, clock.now()).outcome).toStrictEqual({
      type: 'notCredited',
      occurrenceId: 'occ-3-movement+hydration',
    });
  });
});

describe('welcome back (R5.8, R5.9)', () => {
  it('offers the prompt after an absence of at least 5 minutes', () => {
    const state = offerWelcomeBack(NO_WELCOME_BACK, 'wb-1', WELCOME_BACK_MIN_GAP_MS, clock.now());
    expect(state.prompt).toMatchObject({ id: 'wb-1', gapMs: WELCOME_BACK_MIN_GAP_MS });
  });

  it('does not offer it for shorter absences', () => {
    expect(offerWelcomeBack(NO_WELCOME_BACK, 'wb-1', WELCOME_BACK_MIN_GAP_MS - 1, clock.now())).toBe(NO_WELCOME_BACK);
  });

  it('does not offer it when the gap cannot be trusted', () => {
    expect(offerWelcomeBack(NO_WELCOME_BACK, 'wb-1', null, clock.now())).toBe(NO_WELCOME_BACK);
  });

  it('does not offer it for gaps that start a new Session', () => {
    expect(offerWelcomeBack(NO_WELCOME_BACK, 'wb-1', SESSION_RESET_GAP_MS, clock.now())).toBe(NO_WELCOME_BACK);
  });

  it('offers it at most once per 30 minutes', () => {
    const first = offerWelcomeBack(NO_WELCOME_BACK, 'wb-1', 10 * MINUTE_MS, clock.now());
    const answered = answerWelcomeBack(first, 'wb-1', false).state;
    clock.advance(WELCOME_BACK_RATE_MS - 1);
    expect(offerWelcomeBack(answered, 'wb-2', 10 * MINUTE_MS, clock.now())).toBe(answered);
    clock.advance(1);
    expect(offerWelcomeBack(answered, 'wb-2', 10 * MINUTE_MS, clock.now()).prompt?.id).toBe('wb-2');
  });

  it('does not offer it again if the wall clock moved back past the last offer', () => {
    const first = answerWelcomeBack(
      offerWelcomeBack(NO_WELCOME_BACK, 'wb-1', 10 * MINUTE_MS, clock.now()),
      'wb-1',
      false,
    ).state;
    clock.advance(HOUR_MS);
    clock.shiftWall(-2 * HOUR_MS);
    expect(offerWelcomeBack(first, 'wb-2', 10 * MINUTE_MS, clock.now())).toBe(first);
  });

  it('records the measured gap as a break only when the user says yes', () => {
    const offered = offerWelcomeBack(NO_WELCOME_BACK, 'wb-1', 12 * MINUTE_MS, clock.now());
    expect(answerWelcomeBack(offered, 'wb-1', true).record).toStrictEqual({
      kind: 'meaningful',
      durationMs: 12 * MINUTE_MS,
      occurrenceId: null,
    });
    expect(answerWelcomeBack(offered, 'wb-1', false).record).toBeNull();
    expect(answerWelcomeBack(offered, 'wb-other', true).record).toBeNull();
  });

  it('lapses quietly without credit and can be withdrawn', () => {
    const offered = offerWelcomeBack(NO_WELCOME_BACK, 'wb-1', 12 * MINUTE_MS, clock.now());
    clock.advance(CONFIRM_TIMEOUT_MS);
    expect(tickWelcomeBack(offered, clock.now()).prompt).toBeNull();
    expect(withdrawWelcomeBack(offered).prompt).toBeNull();
  });
});

describe('session lifecycle (R4.7)', () => {
  it('starts a new Session only for trusted gaps of at least 6 hours', () => {
    expect(startsNewSession(SESSION_RESET_GAP_MS - 1)).toBe(false);
    expect(startsNewSession(SESSION_RESET_GAP_MS)).toBe(true);
    expect(startsNewSession(null)).toBe(false);
  });

  it('accumulates active time and the unbroken stretch', () => {
    const session = creditSession(creditSession(newSession(clock.now()), MINUTE_MS), 2 * MINUTE_MS);
    expect(session).toMatchObject({ activeMs: 3 * MINUTE_MS, stretchMs: 3 * MINUTE_MS });
    expect(creditSession(session, 0)).toBe(session);
  });

  it.each([
    ['eyeRest', 60],
    ['short', 60],
    ['meaningful', 0],
    ['long', 0],
  ] as const)('a %s break leaves the stretch at %i minutes', (kind, minutes) => {
    const session = creditSession(newSession(clock.now()), 60 * MINUTE_MS);
    const after = applyBreakToSession(session, kind);
    expect(after.stretchMs).toBe(minutes * MINUTE_MS);
    expect(after.activeMs).toBe(60 * MINUTE_MS);
  });
});
