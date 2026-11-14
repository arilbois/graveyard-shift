import { describe, expect, it } from 'vitest';
import * as C from '../../src/shared/constants';

describe('constants', () => {
  it('are all positive finite numbers', () => {
    for (const [name, value] of Object.entries(C)) {
      expect(Number.isFinite(value), name).toBe(true);
      expect(value, name).toBeGreaterThan(0);
    }
  });

  it('keep the relationships the design relies on', () => {
    // An eye rest is far shorter than a meaningful break, which is shorter than a long break (R5, R10).
    expect(C.EYE_REST_MS).toBeLessThan(C.MEANINGFUL_BREAK_MS);
    expect(C.MEANINGFUL_BREAK_MS).toBeLessThan(C.LONG_BREAK_MS);
    // Credits: a meaningful break counts for more than a short one.
    expect(C.MEANINGFUL_BREAK_CREDIT).toBeGreaterThan(C.SHORT_BREAK_CREDIT);
    // A welcome-back prompt covers gaps that could be a meaningful break.
    expect(C.WELCOME_BACK_MIN_GAP_MS).toBeLessThanOrEqual(C.MEANINGFUL_BREAK_MS);
    // Deferral is bounded and longer than the pause that ends it (R7.2).
    expect(C.INTERACTION_WINDOW_MS).toBeLessThan(C.MAX_DEFER_MS);
    // The tick is short enough that a deferred reminder is never held much past its cap.
    expect(C.TICK_MS).toBeLessThan(C.MAX_DEFER_MS);
    // A clock jump bigger than the tolerance can't hide inside a normal tick.
    expect(C.TICK_MS).toBeLessThan(C.CLOCK_TOLERANCE_MS);
    // A new Session needs a gap far longer than idle or a long break.
    expect(C.SESSION_RESET_GAP_MS).toBeGreaterThan(C.LONG_BREAK_MS);
    // The Last Human never repeats more often than its per-stretch cap allows (R11.5).
    expect(C.LH_MAX_PER_STRETCH).toBeLessThanOrEqual(C.LH_MAX_PER_SESSION);
  });
});
