import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS } from '../../src/shared/constants';
import {
  initialAccounting,
  reduceAccounting,
  type AccountingEvent,
  type AccountingState,
} from '../../src/extension/session/accounting';
import type { Instant } from '../../src/shared/time';

const IDLE = 5 * MINUTE_MS;

/** How time moves before the next event: normal, sleep, wall jump forward or backwards. */
const timeStep = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 8 * MINUTE_MS }).map((ms) => ({ mono: ms, wall: ms })) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 3 * HOUR_MS }).map((ms) => ({ mono: 0, wall: ms })) },
  { weight: 1, arbitrary: fc.integer({ min: -2 * HOUR_MS, max: 2 * HOUR_MS }).map((ms) => ({ mono: 0, wall: ms })) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.integer({ min: 0, max: MINUTE_MS }), fc.integer({ min: -2 * MINUTE_MS, max: 2 * MINUTE_MS }))
      .map(([ms, drift]) => ({ mono: ms, wall: ms + drift })),
  },
);

type Kind = 'signal' | 'tick' | 'focusOn' | 'focusOff' | 'activeOn' | 'activeOff';
const step = fc.record({
  time: timeStep,
  kind: fc.constantFrom<Kind>('signal', 'signal', 'signal', 'tick', 'focusOn', 'focusOff', 'activeOn', 'activeOff'),
  suspended: fc.oneof({ weight: 4, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
});

function toEvent(kind: Kind, at: Instant): AccountingEvent {
  switch (kind) {
    case 'signal':
      return { type: 'signal', source: 'keyboardSelection', at };
    case 'tick':
      return { type: 'tick', at };
    case 'focusOn':
      return { type: 'focus', focused: true, at };
    case 'focusOff':
      return { type: 'focus', focused: false, at };
    case 'activeOn':
      return { type: 'windowActive', active: true, at };
    case 'activeOff':
      return { type: 'windowActive', active: false, at };
  }
}

describe('accounting (property)', () => {
  it('never credits negative time, more than the monotonic delta, or anything while unfocused or suspended', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.array(step, { maxLength: 200 }), (startFocused, steps) => {
        let state: AccountingState = initialAccounting(startFocused, false);
        let now: Instant = { mono: 1_000_000, wall: 1_800_000_000_000 };
        let lastCreditEnd = -Infinity;
        let total = 0;

        for (const s of steps) {
          now = { mono: now.mono + s.time.mono, wall: now.wall + s.time.wall };
          const wasFocused = state.focused;
          const { state: next, creditedMs } = reduceAccounting(state, toEvent(s.kind, now), {
            idleMs: IDLE,
            suspended: s.suspended,
          });

          expect(creditedMs).toBeGreaterThanOrEqual(0);
          expect(creditedMs).toBeLessThanOrEqual(IDLE);
          if (!wasFocused || s.suspended) expect(creditedMs).toBe(0);
          if (creditedMs > 0) {
            // Each credit covers [now - credit, now] on the monotonic clock; intervals never overlap,
            // so no stretch of time is ever counted twice.
            expect(now.mono - creditedMs).toBeGreaterThanOrEqual(lastCreditEnd);
            lastCreditEnd = now.mono;
          }

          total += creditedMs;
          state = next;
        }

        // Total credit can never exceed the total monotonic time that passed (invariant 2).
        expect(total).toBeLessThanOrEqual(now.mono - 1_000_000);
      }),
    );
  });

  it('credits the same total for the same sequence (determinism)', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 100 }), (steps) => {
        const run = (): number => {
          let state = initialAccounting(true, false);
          let now: Instant = { mono: 0, wall: 0 };
          let total = 0;
          for (const s of steps) {
            now = { mono: now.mono + s.time.mono, wall: now.wall + s.time.wall };
            const result = reduceAccounting(state, toEvent(s.kind, now), { idleMs: IDLE, suspended: s.suspended });
            state = result.state;
            total += result.creditedMs;
          }
          return total;
        };
        expect(run()).toBe(run());
      }),
    );
  });
});
