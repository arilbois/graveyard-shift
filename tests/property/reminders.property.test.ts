import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_SNOOZES, MINUTE_MS, SECOND_MS, SPACING_MS } from '../../src/shared/constants';
import { decideDelivery } from '../../src/extension/reminders/delivery';
import {
  INITIAL_REMINDERS,
  accumulate,
  applyConfig,
  evaluate,
  markDelivered,
  skip,
  snooze,
  type ReminderState,
  type Resolution,
} from '../../src/extension/reminders/scheduler';
import type { EffectiveConfig } from '../../src/shared/config';
import type { Instant } from '../../src/shared/time';
import { configWith } from '../support/config';

type Step =
  | { t: 'active'; ms: number; interacting: boolean }
  | { t: 'snooze'; stale: boolean }
  | { t: 'skip'; stale: boolean }
  | { t: 'config'; eye: boolean; movement: boolean; eyeMinutes: number };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 8,
    arbitrary: fc.record({
      t: fc.constant('active' as const),
      ms: fc.integer({ min: SECOND_MS, max: 4 * MINUTE_MS }),
      interacting: fc.boolean(),
    }),
  },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('snooze' as const), stale: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('skip' as const), stale: fc.boolean() }) },
  {
    weight: 1,
    arbitrary: fc.record({
      t: fc.constant('config' as const),
      eye: fc.boolean(),
      movement: fc.boolean(),
      eyeMinutes: fc.integer({ min: 5, max: 40 }),
    }),
  },
);

interface Trace {
  surfacings: { id: string; activeMs: number }[];
  resolutions: Resolution[];
  final: ReminderState;
}

function run(steps: readonly Step[], focusMode: boolean, duplicateIntents: boolean): Trace {
  let config: EffectiveConfig = configWith();
  let state = INITIAL_REMINDERS;
  let activeMs = 0;
  let at: Instant = { mono: 0, wall: 0 };
  let lastInteraction: Instant | null = null;
  const trace: Trace = { surfacings: [], resolutions: [], final: state };

  const apply = (result: { state: ReminderState; resolutions: readonly Resolution[] }): void => {
    state = result.state;
    trace.resolutions.push(...result.resolutions);
  };

  for (const step of steps) {
    switch (step.t) {
      case 'active':
        at = { mono: at.mono + step.ms, wall: at.wall + step.ms };
        activeMs += step.ms;
        if (step.interacting) lastInteraction = at;
        state = accumulate(state, step.ms, config);
        break;
      case 'snooze':
      case 'skip': {
        const id = step.stale || state.live === null ? 'occ-stale' : state.live.id;
        const times = duplicateIntents ? 2 : 1;
        for (let i = 0; i < times; i++) {
          apply(step.t === 'snooze' ? snooze(state, id, activeMs, config) : skip(state, id));
        }
        break;
      }
      case 'config':
        config = configWith({
          'reminders.eye.enabled': step.eye,
          'reminders.eye.minutes': step.eyeMinutes,
          'reminders.movement.enabled': step.movement,
        });
        apply(applyConfig(state, config));
        break;
    }

    apply(evaluate(state, { config, activeMs, at }));
    const { live } = state;
    if (live !== null) {
      const decision = decideDelivery(live, {
        at,
        focused: true,
        paused: false,
        breakActive: false,
        lastHumanOpen: false,
        demoHoldsReal: false,
        focusMode,
        activeMs,
        lastSurfacedActiveMs: state.lastSurfacedActiveMs,
        lastInteraction,
      });
      if (decision === 'surface') trace.surfacings.push({ id: live.id, activeMs });
      if (decision !== 'wait') state = markDelivered(state, decision === 'surface' ? 'surfaced' : 'subtle', activeMs);
    }
  }
  trace.final = state;
  return trace;
}

const scenario = fc.record({ steps: fc.array(stepArb, { maxLength: 250 }), focusMode: fc.boolean() });

describe('reminders (property)', () => {
  it('spaces surfacings at least 5 active minutes apart and surfaces each occurrence at most 3 times (invariant 3)', () => {
    fc.assert(
      fc.property(scenario, ({ steps, focusMode }) => {
        const { surfacings } = run(steps, focusMode, false);
        for (let i = 1; i < surfacings.length; i++) {
          const gap = (surfacings[i]?.activeMs ?? 0) - (surfacings[i - 1]?.activeMs ?? 0);
          expect(gap).toBeGreaterThanOrEqual(SPACING_MS);
        }
        const perId = new Map<string, number>();
        for (const s of surfacings) perId.set(s.id, (perId.get(s.id) ?? 0) + 1);
        for (const count of perId.values()) expect(count).toBeLessThanOrEqual(MAX_SNOOZES + 1);
      }),
    );
  });

  it('gives every occurrence exactly one outcome, never a second (R7.9, R8.5)', () => {
    fc.assert(
      fc.property(scenario, ({ steps, focusMode }) => {
        const ids = run(steps, focusMode, false).resolutions.map((r) => r.occurrence.id);
        expect(new Set(ids).size).toBe(ids.length);
      }),
    );
  });

  it('is deterministic (invariant 7)', () => {
    fc.assert(
      fc.property(scenario, ({ steps, focusMode }) => {
        expect(run(steps, focusMode, false)).toStrictEqual(run(steps, focusMode, false));
      }),
    );
  });

  it('ignores a duplicated intent after the first (invariant 8)', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 150 }), (steps) => {
        // Snoozing twice in a row is two real snoozes, so compare only skip duplication here.
        const skipsOnly = steps.map((s): Step => (s.t === 'snooze' ? { t: 'skip', stale: s.stale } : s));
        const once = run(skipsOnly, false, false);
        const twice = run(skipsOnly, false, true);
        expect(twice.resolutions).toStrictEqual(once.resolutions);
        expect(twice.final).toStrictEqual(once.final);
      }),
    );
  });

  it('never holds more than one live occurrence or duplicate kinds in it (R6.3)', () => {
    fc.assert(
      fc.property(scenario, ({ steps, focusMode }) => {
        const { final } = run(steps, focusMode, false);
        if (final.live !== null) {
          expect(new Set(final.live.kinds).size).toBe(final.live.kinds.length);
          expect(final.live.kinds.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});
