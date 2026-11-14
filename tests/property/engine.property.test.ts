import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initialState, step, type CoreEvent, type CoreState, type Effect } from '../../src/extension/application/engine';
import { selectViewModel } from '../../src/extension/application/selectors';
import { countCap, displayedStage, stageFor } from '../../src/extension/companion/stage';
import { HOUR_MS, MINUTE_MS, SECOND_MS, SPACING_MS } from '../../src/shared/constants';
import { COMPANION_STAGES } from '../../src/shared/domain';
import type { Instant } from '../../src/shared/time';
import { configWith } from '../support/config';
import { TEST_ENV } from '../support/engineDriver';

type Action =
  | { a: 'work'; minutes: number }
  | { a: 'signal'; gapMs: number; source: 'keyboardSelection' | 'mouseSelection' | 'webview' }
  | { a: 'tick'; gapMs: number }
  | { a: 'sleep'; ms: number }
  | { a: 'wallJump'; ms: number }
  | { a: 'focus'; focused: boolean }
  | { a: 'windowActive'; active: boolean }
  | { a: 'skip' | 'snooze' | 'takeBreak'; stale: boolean }
  | { a: 'confirm'; yes: boolean; five: boolean }
  | { a: 'endBreak' }
  | { a: 'welcomeBack'; yes: boolean }
  | { a: 'eyeRest' | 'cancelEyeRest' | 'startBreak' | 'resume' }
  | { a: 'pause'; minutes: number | null }
  | { a: 'thresholds'; tired: number; extra1: number; extra2: number; focusMode: boolean };

const action: fc.Arbitrary<Action> = fc.oneof(
  // Realistic editor use: a burst of signals with natural pauses (expanded into many events).
  { weight: 10, arbitrary: fc.record({ a: fc.constant('work' as const), minutes: fc.integer({ min: 1, max: 30 }) }) },
  {
    weight: 4,
    arbitrary: fc.record({
      a: fc.constant('signal' as const),
      gapMs: fc.integer({ min: 0, max: 2 * MINUTE_MS }),
      source: fc.constantFrom('keyboardSelection' as const, 'mouseSelection' as const, 'webview' as const),
    }),
  },
  { weight: 3, arbitrary: fc.record({ a: fc.constant('tick' as const), gapMs: fc.integer({ min: 0, max: 15 * MINUTE_MS }) }) },
  {
    weight: 1,
    arbitrary: fc.record({
      a: fc.constant('sleep' as const),
      // Mostly short naps; occasionally long enough to start a new Session.
      ms: fc.oneof(
        { weight: 6, arbitrary: fc.integer({ min: 0, max: 2 * HOUR_MS }) },
        { weight: 1, arbitrary: fc.integer({ min: 6 * HOUR_MS, max: 8 * HOUR_MS }) },
      ),
    }),
  },
  { weight: 1, arbitrary: fc.record({ a: fc.constant('wallJump' as const), ms: fc.integer({ min: -HOUR_MS, max: HOUR_MS }) }) },
  {
    weight: 2,
    arbitrary: fc.record({
      a: fc.constant('focus' as const),
      focused: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ a: fc.constant('windowActive' as const), active: fc.boolean() }) },
  { weight: 5, arbitrary: fc.record({ a: fc.constantFrom('skip' as const, 'snooze' as const, 'takeBreak' as const), stale: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ a: fc.constant('confirm' as const), yes: fc.boolean(), five: fc.boolean() }) },
  { weight: 1, arbitrary: fc.constant({ a: 'endBreak' as const }) },
  { weight: 1, arbitrary: fc.record({ a: fc.constant('welcomeBack' as const), yes: fc.boolean() }) },
  { weight: 1, arbitrary: fc.constantFrom({ a: 'eyeRest' as const }, { a: 'cancelEyeRest' as const }, { a: 'startBreak' as const }) },
  { weight: 2, arbitrary: fc.constant({ a: 'resume' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      a: fc.constant('pause' as const),
      minutes: fc.option(fc.integer({ min: 1, max: 90 }), { nil: null, freq: 5 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      a: fc.constant('thresholds' as const),
      tired: fc.integer({ min: 1, max: 4 }),
      extra1: fc.integer({ min: 1, max: 3 }),
      extra2: fc.integer({ min: 1, max: 3 }),
      focusMode: fc.boolean(),
    }),
  },
);

function toEvent(s: CoreState, act: Action, now: Instant): CoreEvent {
  const live = s.reminders.live?.id ?? 'occ-none';
  const breakId = s.breaks.phase === 'none' ? 'brk-none' : s.breaks.id;
  switch (act.a) {
    case 'signal':
      return { type: 'signal', source: act.source, at: now };
    case 'work':
      return { type: 'signal', source: 'keyboardSelection', at: now };
    case 'tick':
    case 'sleep':
    case 'wallJump':
      return { type: 'tick', at: now };
    case 'focus':
      return { type: 'focus', focused: act.focused, at: now };
    case 'windowActive':
      return { type: 'windowActive', active: act.active, at: now };
    case 'skip':
      return { type: 'intent', intent: { kind: 'reminder.skip', occurrenceId: act.stale ? 'occ-stale' : live }, at: now };
    case 'snooze':
      return { type: 'intent', intent: { kind: 'reminder.snooze', occurrenceId: act.stale ? 'occ-stale' : live }, at: now };
    case 'takeBreak':
      return { type: 'intent', intent: { kind: 'reminder.takeBreak', occurrenceId: act.stale ? 'occ-stale' : live }, at: now };
    case 'confirm':
      return { type: 'intent', intent: { kind: 'break.confirm', breakId, confirmed: act.yes, atLeastFiveMinutes: act.five }, at: now };
    case 'endBreak':
      return { type: 'intent', intent: { kind: 'break.end', breakId }, at: now };
    case 'welcomeBack':
      return {
        type: 'intent',
        intent: { kind: 'welcomeBack.answer', promptId: s.welcomeBack.prompt?.id ?? 'wb-none', tookBreak: act.yes },
        at: now,
      };
    case 'eyeRest':
      return { type: 'intent', intent: { kind: 'eyeRest.start' }, at: now };
    case 'cancelEyeRest':
      return { type: 'intent', intent: { kind: 'eyeRest.cancel' }, at: now };
    case 'startBreak':
      return { type: 'intent', intent: { kind: 'break.start' }, at: now };
    case 'resume':
      return { type: 'intent', intent: { kind: 'pause.resume' }, at: now };
    case 'pause':
      return { type: 'intent', intent: { kind: 'pause.start', durationMs: act.minutes === null ? null : act.minutes * MINUTE_MS }, at: now };
    case 'thresholds': {
      const infected = act.tired + act.extra1;
      return {
        type: 'config',
        config: configWith({
          'companion.tiredAfterMissedBreaks': act.tired,
          'companion.infectedAfterMissedBreaks': infected,
          'companion.zombieAfterMissedBreaks': infected + act.extra2,
          'experience.focusMode': act.focusMode,
        }),
        at: now,
      };
    }
  }
}

function advance(now: Instant, act: Action): Instant {
  switch (act.a) {
    case 'work':
      return now;
    case 'signal':
    case 'tick':
      return { mono: now.mono + act.gapMs, wall: now.wall + act.gapMs };
    case 'sleep':
      return { mono: now.mono + SECOND_MS, wall: now.wall + act.ms };
    case 'wallJump':
      return { mono: now.mono + SECOND_MS, wall: now.wall + act.ms };
    default:
      return { mono: now.mono + SECOND_MS, wall: now.wall + SECOND_MS };
  }
}

interface Run {
  states: CoreState[];
  effects: Effect[][];
}

function simulate(actions: readonly Action[]): Run {
  let now: Instant = { mono: 1_000_000, wall: Date.UTC(2026, 10, 14, 9) };
  let state = initialState(configWith(), now, TEST_ENV, { focused: true, windowActive: false });
  const run: Run = { states: [state], effects: [] };
  const apply = (event: CoreEvent): void => {
    const result = step(state, event, TEST_ENV);
    state = result.state;
    run.states.push(state);
    run.effects.push([...result.effects]);
  };
  const half = 15 * SECOND_MS;

  for (const act of actions) {
    if (act.a === 'work') {
      // A keyboard signal every 30 s with a tick in between: interaction with natural pauses.
      for (let i = 0; i < act.minutes * 2; i++) {
        now = { mono: now.mono + half, wall: now.wall + half };
        apply({ type: 'tick', at: now });
        now = { mono: now.mono + half, wall: now.wall + half };
        apply({ type: 'signal', source: 'keyboardSelection', at: now });
      }
      continue;
    }
    now = advance(now, act);
    apply(toEvent(state, act, now));
  }
  return run;
}

const RANK = ['human', 'tired', 'infected', 'zombie'] as const;
const rank = (stage: (typeof RANK)[number]): number => RANK.indexOf(stage);
// `size: 'max'` so sequences are long enough to reach Zombie (several hours of simulated work).
const scenario = fc.array(action, { minLength: 1, maxLength: 160, size: 'max' });

/**
 * Guards against vacuous passes: across the generated runs, the interesting states must actually
 * occur (measured during development: an earlier generator never surfaced a reminder).
 */
describe('engine property generator', () => {
  it('reaches surfacing, every companion stage, Recovery, confirmed breaks and new Sessions', () => {
    const seen = { surfaced: 0, tired: 0, infected: 0, zombie: 0, recovery: 0, confirmed: 0, newSession: 0 };
    fc.assert(
      fc.property(scenario, (actions) => {
        const { states, effects } = simulate(actions);
        if (effects.some((list) => list.some((e) => e.type === 'surfaceReminder'))) seen.surfaced++;
        const stages = new Set(states.map((s) => s.companion.stage));
        if (stages.has('tired')) seen.tired++;
        if (stages.has('infected')) seen.infected++;
        if (stages.has('zombie')) seen.zombie++;
        if (states.some((s) => s.companion.recoveryUntil !== null)) seen.recovery++;
        if (states.some((s) => s.today.breaks > 0)) seen.confirmed++;
        if (new Set(states.map((s) => s.session.startedAtWall)).size > 1) seen.newSession++;
      }),
      { numRuns: 200, seed: 20261114 },
    );
    for (const [name, count] of Object.entries(seen)) expect(count, name).toBeGreaterThan(0);
  });
});

describe('engine (property)', () => {
  it('keeps the companion valid: rises at most one stage and one count per event, within the cap (invariant 5)', () => {
    fc.assert(
      fc.property(scenario, (actions) => {
        const { states } = simulate(actions);
        for (let i = 1; i < states.length; i++) {
          const prev = states[i - 1];
          const next = states[i];
          if (!prev || !next) continue;
          const t = next.config.companion.thresholds;
          const c = next.companion;
          expect(COMPANION_STAGES).toContain(displayedStage(c));
          expect(c.count).toBeGreaterThanOrEqual(0);
          expect(c.count).toBeLessThanOrEqual(countCap(t));
          expect(c.count - prev.companion.count).toBeLessThanOrEqual(1);
          expect(rank(c.stage) - rank(prev.companion.stage)).toBeLessThanOrEqual(1);
          expect(rank(c.stage)).toBeLessThanOrEqual(rank(stageFor(c.count, t)));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('never decreases activity or the stretch except at confirmed breaks and new Sessions (invariants 1, 4)', () => {
    fc.assert(
      fc.property(scenario, (actions) => {
        const { states } = simulate(actions);
        for (let i = 1; i < states.length; i++) {
          const prev = states[i - 1];
          const next = states[i];
          if (!prev || !next) continue;
          const newSession = next.session.startedAtWall !== prev.session.startedAtWall;
          if (newSession) continue;
          expect(next.session.activeMs).toBeGreaterThanOrEqual(prev.session.activeMs);
          if (next.session.stretchMs < prev.session.stretchMs) {
            expect(next.session.stretchMs).toBe(0);
            expect(next.today.meaningfulBreaks).toBeGreaterThan(prev.today.meaningfulBreaks);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('surfaces reminders at least 5 active minutes apart and never while unfocused, paused or on a break', () => {
    fc.assert(
      fc.property(scenario, (actions) => {
        const { states, effects } = simulate(actions);
        let last: { activeMs: number; session: number } | null = null;
        effects.forEach((list, i) => {
          const state = states[i + 1];
          if (!state || !list.some((e) => e.type === 'surfaceReminder')) return;
          expect(state.accounting.focused).toBe(true);
          expect(state.pause).toBeNull();
          expect(state.breaks.phase).toBe('none');
          if (last?.session === state.session.startedAtWall) {
            expect(state.session.activeMs - last.activeMs).toBeGreaterThanOrEqual(SPACING_MS);
          }
          last = { activeMs: state.session.activeMs, session: state.session.startedAtWall };
        });
      }),
      { numRuns: 100 },
    );
  });

  it('is deterministic, including the view model (invariant 7)', () => {
    fc.assert(
      fc.property(scenario, (actions) => {
        const a = simulate(actions);
        const b = simulate(actions);
        expect(b).toStrictEqual(a);
        const last = a.states[a.states.length - 1];
        if (last) expect(selectViewModel(last, { mono: 0, wall: 0 })).toStrictEqual(selectViewModel(last, { mono: 0, wall: 0 }));
      }),
      { numRuns: 100 },
    );
  });
});
