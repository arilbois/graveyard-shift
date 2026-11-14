import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/shared/constants';
import {
  NO_BREAK,
  breakSignal,
  cancelEyeRest,
  confirmBreak,
  endBreak,
  startBreak,
  startEyeRest,
  tickBreaks,
  type BreakResult,
  type BreakState,
} from '../../src/extension/session/breaks';
import { applyBreakToSession, creditSession, newSession } from '../../src/extension/session/lifecycle';
import type { Instant } from '../../src/shared/time';

type Op =
  | { op: 'eyeRest' }
  | { op: 'cancel' }
  | { op: 'start' }
  | { op: 'back' }
  | { op: 'signal' }
  | { op: 'tick' }
  | { op: 'confirm'; yes: boolean; five: boolean };

const op = fc.oneof(
  fc.constant<Op>({ op: 'eyeRest' }),
  fc.constant<Op>({ op: 'cancel' }),
  fc.constant<Op>({ op: 'start' }),
  fc.constant<Op>({ op: 'back' }),
  fc.constant<Op>({ op: 'signal' }),
  fc.constant<Op>({ op: 'signal' }),
  fc.constant<Op>({ op: 'tick' }),
  fc.record({ op: fc.constant('confirm' as const), yes: fc.boolean(), five: fc.boolean() }),
);

const stepArb = fc.record({ op, advance: fc.integer({ min: 0, max: 20 * MINUTE_MS }) });

function apply(state: BreakState, o: Op, at: Instant): BreakResult {
  const id = state.phase === 'none' ? 'brk' : state.id;
  switch (o.op) {
    case 'eyeRest':
      return startEyeRest(state, 'eye', at, null);
    case 'cancel':
      return cancelEyeRest(state);
    case 'start':
      return startBreak(state, 'brk', at, 'command', null);
    case 'back':
      return endBreak(state, id, at);
    case 'signal':
      return breakSignal(state, at);
    case 'tick':
      return tickBreaks(state, at);
    case 'confirm':
      return confirmBreak(state, id, o.yes, o.five);
  }
}

describe('breaks (property)', () => {
  it('records a break only from a completed eye rest or an explicit yes (R5.1)', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 80 }), (steps) => {
        let state: BreakState = NO_BREAK;
        let now: Instant = { mono: 0, wall: 1_800_000_000_000 };
        for (const s of steps) {
          now = { mono: now.mono + s.advance, wall: now.wall + s.advance };
          const before = state;
          const result = apply(state, s.op, now);
          if (result.outcome?.type === 'recorded') {
            const fromEye = s.op.op === 'tick' && before.phase === 'eyeRest';
            const fromYes = s.op.op === 'confirm' && s.op.yes && before.phase === 'awaitingConfirm';
            expect(fromEye || fromYes).toBe(true);
            if (fromEye) expect(result.outcome.record.kind).toBe('eyeRest');
          }
          if (s.op.op === 'signal') expect(result.outcome).toBeNull();
          state = result.state;
        }
      }),
    );
  });

  it('only Meaningful and Long Breaks reset the unbroken stretch (invariant 4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 * 60 * MINUTE_MS }),
        fc.constantFrom('eyeRest', 'short', 'meaningful', 'long'),
        (activeMs, kind) => {
          const session = creditSession(newSession({ mono: 0, wall: 0 }), activeMs);
          const after = applyBreakToSession(session, kind);
          expect(after.stretchMs).toBe(kind === 'meaningful' || kind === 'long' ? 0 : session.stretchMs);
          expect(after.activeMs).toBe(session.activeMs);
        },
      ),
    );
  });
});
