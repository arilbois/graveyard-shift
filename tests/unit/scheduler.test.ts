import { describe, expect, it } from 'vitest';
import { MINUTE_MS, MISSED_AFTER_MS } from '../../src/shared/constants';
import {
  INITIAL_REMINDERS,
  accumulate,
  applyConfig,
  applyEyeRest,
  applyMeaningfulBreak,
  applyShortBreak,
  evaluate,
  isMissedBreak,
  markDelivered,
  resetForNewSession,
  skip,
  snooze,
  takeBreakTarget,
  type ReminderState,
  type Resolution,
} from '../../src/extension/reminders/scheduler';
import type { EffectiveConfig } from '../../src/shared/config';
import type { Instant } from '../../src/shared/time';
import { configWith } from '../support/config';

const AT: Instant = { mono: 0, wall: 0 };
const DEFAULT = configWith();

/** Simulates `minutes` of Active Time in one-minute steps, evaluating after each. */
class Sim {
  state: ReminderState = INITIAL_REMINDERS;
  activeMs = 0;
  resolutions: Resolution[] = [];

  constructor(public config: EffectiveConfig = DEFAULT) {}

  run(minutes: number): this {
    for (let i = 0; i < minutes; i++) {
      this.activeMs += MINUTE_MS;
      this.state = accumulate(this.state, MINUTE_MS, this.config);
      this.eval();
    }
    return this;
  }

  eval(): this {
    const result = evaluate(this.state, { config: this.config, activeMs: this.activeMs, at: AT });
    this.state = result.state;
    this.resolutions.push(...result.resolutions);
    return this;
  }

  apply(result: { state: ReminderState; resolutions: readonly Resolution[] }): this {
    this.state = result.state;
    this.resolutions.push(...result.resolutions);
    return this;
  }

  deliver(mode: 'surfaced' | 'subtle' = 'surfaced'): this {
    this.state = markDelivered(this.state, mode, this.activeMs);
    return this;
  }

  get live() {
    return this.state.live;
  }
}

describe('due occurrences (R6.1–R6.3)', () => {
  it('creates an eye occurrence after 20 minutes of Active Time', () => {
    const sim = new Sim().run(19);
    expect(sim.live).toBeNull();
    sim.run(1);
    expect(sim.live).toMatchObject({ id: 'occ-1', kinds: ['eye'], status: 'pending' });
  });

  it('combines kinds due within 5 minutes into one occurrence (R6.4)', () => {
    const sim = new Sim(configWith({ 'reminders.eye.enabled': false })).run(60);
    expect(sim.live?.kinds).toStrictEqual(['movement', 'hydration']);
  });

  it('pulls in a kind that is not due yet but within the combine window', () => {
    const sim = new Sim(configWith({ 'reminders.eye.enabled': false, 'reminders.hydration.minutes': 64 })).run(60);
    expect(sim.live?.kinds).toStrictEqual(['movement', 'hydration']);
  });

  it('leaves out kinds further than 5 minutes from due', () => {
    const sim = new Sim(configWith({ 'reminders.eye.enabled': false, 'reminders.hydration.minutes': 66 })).run(60);
    expect(sim.live?.kinds).toStrictEqual(['movement']);
  });

  it('adds kinds that become due while the occurrence is still pending', () => {
    const sim = new Sim(configWith({ 'reminders.eye.enabled': false, 'reminders.hydration.minutes': 70 })).run(60);
    expect(sim.live?.kinds).toStrictEqual(['movement']);
    sim.run(9);
    expect(sim.live?.kinds).toStrictEqual(['movement']);
    sim.run(1);
    expect(sim.live?.kinds).toStrictEqual(['movement', 'hydration']);
    expect(sim.live?.id).toBe('occ-1');
  });

  it('does not change an occurrence that is on screen; waiting kinds follow after it resolves', () => {
    const sim = new Sim(configWith({ 'reminders.eye.enabled': false, 'reminders.hydration.minutes': 70 })).run(60);
    sim.deliver().run(10);
    expect(sim.live?.kinds).toStrictEqual(['movement']);
    sim.apply(skip(sim.state, 'occ-1')).eval();
    expect(sim.live).toMatchObject({ id: 'occ-2', kinds: ['hydration'] });
  });

  it('never accumulates time for disabled kinds', () => {
    const sim = new Sim(configWith({ 'reminders.eye.enabled': false })).run(30);
    expect(sim.state.accum.eye).toBe(0);
    expect(sim.live).toBeNull();
  });

  it('ignores zero or negative credit', () => {
    expect(accumulate(INITIAL_REMINDERS, 0, DEFAULT)).toBe(INITIAL_REMINDERS);
    expect(accumulate(INITIAL_REMINDERS, -5, DEFAULT)).toBe(INITIAL_REMINDERS);
  });
});

describe('outcomes (R8)', () => {
  it('skip resolves as skipped and restarts the interval', () => {
    const sim = new Sim().run(20).deliver();
    sim.apply(skip(sim.state, 'occ-1'));
    expect(sim.resolutions.map((r) => r.outcome)).toStrictEqual(['skipped']);
    expect(sim.live).toBeNull();
    expect(sim.state.accum.eye).toBe(0);
  });

  it('snooze re-surfaces after snoozeMinutes of Active Time', () => {
    const sim = new Sim().run(20).deliver();
    sim.apply(snooze(sim.state, 'occ-1', sim.activeMs, sim.config));
    expect(sim.live).toMatchObject({ status: 'snoozed', snoozes: 1 });
    sim.run(9);
    expect(sim.live?.status).toBe('snoozed');
    sim.run(1);
    expect(sim.live).toMatchObject({ id: 'occ-1', status: 'pending' });
  });

  it('honours a custom snooze length', () => {
    const sim = new Sim(configWith({ 'reminders.snoozeMinutes': 25 })).run(20).deliver();
    sim.apply(snooze(sim.state, 'occ-1', sim.activeMs, sim.config)).run(24);
    expect(sim.live?.status).toBe('snoozed');
    sim.run(1);
    expect(sim.live?.status).toBe('pending');
  });

  it('the third snooze resolves the occurrence as missed (R8.3)', () => {
    const sim = new Sim().run(20);
    for (let i = 0; i < 2; i++) {
      sim.deliver().apply(snooze(sim.state, 'occ-1', sim.activeMs, sim.config)).run(10);
    }
    expect(sim.resolutions).toHaveLength(0);
    sim.deliver().apply(snooze(sim.state, 'occ-1', sim.activeMs, sim.config));
    expect(sim.resolutions.map((r) => r.outcome)).toStrictEqual(['missed']);
    expect(sim.live).toBeNull();
  });

  it('resolves as missed exactly once after 15 minutes of Active Time without a response (R7.9)', () => {
    const sim = new Sim(configWith({ 'reminders.eye.minutes': 60 })).run(60).deliver('subtle');
    sim.run(MISSED_AFTER_MS / MINUTE_MS - 1);
    expect(sim.resolutions).toHaveLength(0);
    sim.run(1);
    expect(sim.resolutions.map((r) => r.outcome)).toStrictEqual(['missed']);
    sim.run(30);
    expect(sim.resolutions.filter((r) => r.occurrence.id === 'occ-1')).toHaveLength(1);
  });

  it('does not start the missed window before delivery', () => {
    const sim = new Sim().run(20).run(30);
    expect(sim.resolutions).toHaveLength(0);
    expect(sim.live?.status).toBe('pending');
  });

  it('ignores actions for ids that are not live (R7.8)', () => {
    const sim = new Sim().run(20).deliver();
    expect(skip(sim.state, 'occ-99').state).toBe(sim.state);
    expect(snooze(sim.state, 'occ-99', 0, DEFAULT).state).toBe(sim.state);
    sim.apply(skip(sim.state, 'occ-1'));
    expect(skip(sim.state, 'occ-1').resolutions).toHaveLength(0);
  });

  it('take a break starts an eye rest for eye-only and the break flow otherwise (R8.1)', () => {
    const eye = new Sim().run(20);
    expect(takeBreakTarget(eye.state, 'occ-1')).toBe('eyeRest');
    expect(takeBreakTarget(eye.state, 'occ-2')).toBeNull();
    const move = new Sim(configWith({ 'reminders.eye.enabled': false })).run(60);
    expect(takeBreakTarget(move.state, 'occ-1')).toBe('break');
  });
});

describe('missed breaks (R8.5)', () => {
  const resolution = (kinds: Resolution['occurrence']['kinds'], outcome: Resolution['outcome']): Resolution => ({
    occurrence: {
      id: 'x',
      kinds,
      status: 'surfaced',
      pendingSince: AT,
      deliveredAtActiveMs: 0,
      snoozes: 0,
      snoozedUntilActiveMs: null,
    },
    outcome,
  });

  it('counts skipped or missed Break Reminders, once each, however many kinds they cover', () => {
    expect(isMissedBreak(resolution(['movement', 'hydration'], 'skipped'))).toBe(true);
    expect(isMissedBreak(resolution(['eye', 'movement', 'hydration'], 'missed'))).toBe(true);
  });

  it('does not count eye-only, taken or withdrawn occurrences', () => {
    expect(isMissedBreak(resolution(['eye'], 'skipped'))).toBe(false);
    expect(isMissedBreak(resolution(['movement'], 'taken'))).toBe(false);
    expect(isMissedBreak(resolution(['movement'], 'withdrawn'))).toBe(false);
  });
});

describe('breaks applied to reminders', () => {
  it('an Eye Rest resets only the eye accumulator and resolves an eye-only occurrence', () => {
    const sim = new Sim().run(20).deliver();
    sim.apply(applyEyeRest(sim.state));
    expect(sim.resolutions.map((r) => r.outcome)).toStrictEqual(['taken']);
    expect(sim.state.accum).toStrictEqual({ eye: 0, movement: 20 * MINUTE_MS, hydration: 20 * MINUTE_MS });
  });

  it('an Eye Rest removes the eye part of a combined occurrence', () => {
    const sim = new Sim().run(60);
    expect(sim.live?.kinds).toContain('eye');
    sim.apply(applyEyeRest(sim.state));
    expect(sim.live?.kinds).toStrictEqual(['movement', 'hydration']);
    expect(sim.resolutions).toHaveLength(0);
  });

  it('a short break resolves only its own occurrence (R5.7)', () => {
    const sim = new Sim(configWith({ 'reminders.eye.enabled': false })).run(60).deliver();
    expect(applyShortBreak(sim.state, 'occ-9').resolutions).toHaveLength(0);
    sim.apply(applyShortBreak(sim.state, 'occ-1'));
    expect(sim.resolutions.map((r) => r.outcome)).toStrictEqual(['taken']);
  });

  it('a Meaningful Break resets every accumulator and resolves the live occurrence (R5.6)', () => {
    const sim = new Sim().run(45).deliver();
    sim.apply(applyMeaningfulBreak(sim.state));
    expect(sim.state.accum).toStrictEqual({ eye: 0, movement: 0, hydration: 0 });
    expect(sim.resolutions.map((r) => r.outcome)).toStrictEqual(['taken']);
  });
});

describe('settings changes (R2.6, R2.9)', () => {
  it('a shorter interval creates one occurrence, not one per missed period', () => {
    const eyeOnly = { 'reminders.movement.enabled': false, 'reminders.hydration.enabled': false };
    const sim = new Sim(configWith({ ...eyeOnly, 'reminders.eye.minutes': 120 })).run(100);
    expect(sim.live).toBeNull();
    sim.config = configWith({ ...eyeOnly, 'reminders.eye.minutes': 10 });
    sim.apply(applyConfig(sim.state, sim.config)).eval();
    expect(sim.live).toMatchObject({ id: 'occ-1', kinds: ['eye'] });
    expect(sim.state.seq).toBe(1);
  });

  it('disabling a kind withdraws it without an outcome that counts, and resets its time', () => {
    const sim = new Sim(configWith({ 'reminders.eye.enabled': false })).run(60).deliver();
    sim.config = configWith({ 'reminders.eye.enabled': false, 'reminders.movement.enabled': false });
    sim.apply(applyConfig(sim.state, sim.config));
    expect(sim.live?.kinds).toStrictEqual(['hydration']);
    expect(sim.state.accum.movement).toBe(0);

    sim.config = configWith({
      'reminders.eye.enabled': false,
      'reminders.movement.enabled': false,
      'reminders.hydration.enabled': false,
    });
    sim.apply(applyConfig(sim.state, sim.config));
    expect(sim.live).toBeNull();
    expect(sim.resolutions.map((r) => r.outcome)).toStrictEqual(['withdrawn']);
    expect(sim.resolutions.some(isMissedBreak)).toBe(false);
  });
});

describe('new Session (R4.7)', () => {
  it('withdraws the live occurrence, zeroes time and keeps ids unique', () => {
    const sim = new Sim().run(25);
    const reset = resetForNewSession(sim.state);
    expect(reset.resolutions.map((r) => r.outcome)).toStrictEqual(['withdrawn']);
    expect(reset.state).toStrictEqual({
      accum: { eye: 0, movement: 0, hydration: 0 },
      live: null,
      lastSurfacedActiveMs: null,
      seq: 1,
    });
  });
});
