import { describe, expect, it } from 'vitest';
import { INTERACTION_WINDOW_MS, MAX_DEFER_MS, SECOND_MS, SPACING_MS } from '../../src/shared/constants';
import {
  canInterrupt,
  decideDelivery,
  deliveryDeadline,
  isInteracting,
  type DeliveryContext,
} from '../../src/extension/reminders/delivery';
import type { Occurrence } from '../../src/extension/reminders/scheduler';

const T0 = 1_000_000;
const occurrence = (status: Occurrence['status'] = 'pending'): Occurrence => ({
  id: 'occ-1',
  kinds: ['eye'],
  status,
  pendingSince: { mono: T0, wall: T0 },
  deliveredAtActiveMs: null,
  snoozes: 0,
  snoozedUntilActiveMs: null,
});

function ctx(overrides: Partial<DeliveryContext> = {}, atOffset = 0): DeliveryContext {
  return {
    at: { mono: T0 + atOffset, wall: T0 + atOffset },
    focused: true,
    paused: false,
    breakActive: false,
    lastHumanOpen: false,
    demoHoldsReal: false,
    focusMode: true,
    activeMs: 60 * 60 * SECOND_MS,
    lastSurfacedActiveMs: null,
    lastInteraction: null,
    ...overrides,
  };
}

const interactingAt = (offset: number) => ({ mono: T0 + offset, wall: T0 + offset });

describe('isInteracting', () => {
  it('is true only within 10 seconds of a keyboard or mouse selection signal', () => {
    const at = { mono: T0, wall: T0 };
    expect(isInteracting(null, at)).toBe(false);
    expect(isInteracting(interactingAt(-INTERACTION_WINDOW_MS + 1), at)).toBe(true);
    expect(isInteracting(interactingAt(-INTERACTION_WINDOW_MS), at)).toBe(false);
  });
});

describe('canInterrupt (R7.6, R6.5)', () => {
  it.each([
    ['unfocused window', { focused: false }],
    ['paused', { paused: true }],
    ['break in progress', { breakActive: true }],
    ['The Last Human open', { lastHumanOpen: true }],
    ['demo running', { demoHoldsReal: true }],
  ] as const)('is false when %s', (_label, overrides) => {
    expect(canInterrupt(ctx(overrides))).toBe(false);
  });

  it('requires 5 minutes of Active Time since the last surfacing', () => {
    const activeMs = 60 * 60 * SECOND_MS;
    expect(canInterrupt(ctx({ activeMs, lastSurfacedActiveMs: activeMs - SPACING_MS + 1 }))).toBe(false);
    expect(canInterrupt(ctx({ activeMs, lastSurfacedActiveMs: activeMs - SPACING_MS }))).toBe(true);
  });
});

describe('decideDelivery (R7.2–R7.4)', () => {
  it('surfaces at once when not interacting', () => {
    expect(decideDelivery(occurrence(), ctx())).toBe('surface');
  });

  it('surfaces at once with focus mode off, even while interacting', () => {
    expect(decideDelivery(occurrence(), ctx({ focusMode: false, lastInteraction: interactingAt(0) }))).toBe('surface');
  });

  it('waits while interacting in focus mode, then surfaces at the first 10-second pause', () => {
    const interaction = interactingAt(30 * SECOND_MS);
    expect(decideDelivery(occurrence(), ctx({ lastInteraction: interaction }, 35 * SECOND_MS))).toBe('wait');
    expect(decideDelivery(occurrence(), ctx({ lastInteraction: interaction }, 40 * SECOND_MS))).toBe('surface');
  });

  it('delivers subtly after 2 minutes of continuous interaction', () => {
    const interaction = interactingAt(MAX_DEFER_MS - SECOND_MS);
    expect(decideDelivery(occurrence(), ctx({ lastInteraction: interaction }, MAX_DEFER_MS - 1))).toBe('wait');
    expect(decideDelivery(occurrence(), ctx({ lastInteraction: interaction }, MAX_DEFER_MS))).toBe('subtle');
  });

  it.each(['surfaced', 'subtle', 'snoozed'] as const)('never re-delivers an occurrence that is %s', (status) => {
    expect(decideDelivery(occurrence(status), ctx())).toBe('wait');
  });

  it('waits when interruption is not allowed', () => {
    expect(decideDelivery(occurrence(), ctx({ focused: false }))).toBe('wait');
  });
});

describe('deliveryDeadline', () => {
  it('is the earlier of the interaction pause and the 2-minute cap while deferring', () => {
    const interaction = interactingAt(5 * SECOND_MS);
    expect(deliveryDeadline(occurrence(), ctx({ lastInteraction: interaction }, 6 * SECOND_MS))).toBe(
      T0 + 5 * SECOND_MS + INTERACTION_WINDOW_MS,
    );
    const late = interactingAt(MAX_DEFER_MS - SECOND_MS);
    expect(deliveryDeadline(occurrence(), ctx({ lastInteraction: late }, MAX_DEFER_MS - 1))).toBe(T0 + MAX_DEFER_MS);
  });

  it('is null when nothing is being deferred', () => {
    expect(deliveryDeadline(null, ctx())).toBeNull();
    expect(deliveryDeadline(occurrence(), ctx())).toBeNull();
    expect(deliveryDeadline(occurrence(), ctx({ focusMode: false, lastInteraction: interactingAt(0) }))).toBeNull();
  });
});
