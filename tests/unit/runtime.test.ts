import { describe, expect, it } from 'vitest';
import { Runtime, type Cancel, type EffectSink, type RuntimeDeps, type Timers } from '../../src/extension/application/runtime';
import type { Effect } from '../../src/extension/application/engine';
import { EYE_REST_MS, MINUTE_MS, SECOND_MS, TICK_MS } from '../../src/shared/constants';
import type { CompanionViewModel } from '../../src/shared/viewModel';
import { configWith } from '../support/config';
import { FakeClock } from '../support/fakeClock';

/** Manual timers: nothing fires until the test calls `fire*`. */
class FakeTimers implements Timers {
  intervals = new Map<number, { cb: () => void; ms: number }>();
  timeouts = new Map<number, { cb: () => void; ms: number }>();
  private nextId = 0;

  setInterval(cb: () => void, ms: number): Cancel {
    const id = ++this.nextId;
    this.intervals.set(id, { cb, ms });
    return () => this.intervals.delete(id);
  }
  setTimeout(cb: () => void, ms: number): Cancel {
    const id = ++this.nextId;
    this.timeouts.set(id, { cb, ms });
    return () => this.timeouts.delete(id);
  }
  fireInterval(): void {
    for (const t of [...this.intervals.values()]) t.cb();
  }
  fireTimeouts(): void {
    const pending = [...this.timeouts.entries()];
    for (const [id, t] of pending) {
      this.timeouts.delete(id);
      t.cb();
    }
  }
}

function setup(overrides: Partial<RuntimeDeps> = {}) {
  const clock = new FakeClock();
  const timers = new FakeTimers();
  const applied: Effect[] = [];
  const published: CompanionViewModel[] = [];
  const errors: string[] = [];
  const effects: EffectSink = { apply: (effect) => applied.push(effect) };
  const runtime = new Runtime({
    clock,
    env: { localDay: () => '2026-11-14' },
    config: configWith({ 'reminders.movement.enabled': false, 'reminders.hydration.enabled': false }),
    focused: true,
    windowActive: false,
    timers,
    effects,
    log: { error: (message) => errors.push(message) },
    onViewModel: (vm) => published.push(vm),
    ...overrides,
  });
  const work = (minutes: number): void => {
    for (let i = 0; i < minutes * 4; i++) {
      clock.advance(15 * SECOND_MS);
      runtime.dispatch({ type: 'signal', source: i % 2 === 0 ? 'webview' : 'keyboardSelection' });
    }
  };
  return { clock, timers, runtime, applied, published, errors, work };
}

describe('Runtime', () => {
  it('runs one 15-second tick and publishes the initial view model on start', () => {
    const { runtime, timers, published } = setup();
    runtime.start();
    runtime.start();
    expect([...timers.intervals.values()].map((t) => t.ms)).toStrictEqual([TICK_MS]);
    expect(published).toHaveLength(1);
    expect(published[0]?.companion.stage).toBe('human');
  });

  it('stamps events with the clock and hands effects to the sink', () => {
    const { runtime, applied, work, clock } = setup();
    runtime.start();
    work(21);
    clock.advance(15 * SECOND_MS);
    runtime.dispatch({ type: 'tick' });
    expect(applied.map((e) => e.type)).toStrictEqual(['surfaceReminder', 'playCue']);
  });

  it('publishes the view model only when it changes', () => {
    const { runtime, published } = setup();
    runtime.start();
    runtime.dispatch({ type: 'tick' });
    runtime.dispatch({ type: 'tick' });
    expect(published).toHaveLength(1);
    runtime.dispatch({ type: 'intent', intent: { kind: 'pause.start', durationMs: null } });
    expect(published).toHaveLength(2);
    expect(published[1]?.status).toBe('paused');
    runtime.republish();
    expect(published).toHaveLength(3);
  });

  it('schedules a single one-shot timer for the nearest deadline', () => {
    const { runtime, timers, clock } = setup();
    runtime.start();
    runtime.dispatch({ type: 'intent', intent: { kind: 'eyeRest.start' } });
    expect([...timers.timeouts.values()].map((t) => t.ms)).toStrictEqual([EYE_REST_MS]);
    runtime.dispatch({ type: 'tick' });
    expect(timers.timeouts.size).toBe(1);
    clock.advance(EYE_REST_MS);
    timers.fireTimeouts();
    expect(runtime.viewModel.status).not.toBe('eyeRest');
    expect(runtime.snapshot.today.eyeRests).toBe(1);
    expect(timers.timeouts.size).toBe(0);
  });

  it('keeps running when an effect handler throws, logging only the effect type (R18.4)', () => {
    const { runtime, errors, work, clock } = setup({
      effects: {
        apply: () => {
          throw new Error('toast failed');
        },
      },
    });
    runtime.start();
    work(21);
    clock.advance(15 * SECOND_MS);
    runtime.dispatch({ type: 'tick' });
    expect(errors).toStrictEqual(['Effect "surfaceReminder" failed: toast failed', 'Effect "playCue" failed: toast failed']);
    work(1);
    expect(runtime.snapshot.session.activeMs).toBeGreaterThan(20 * MINUTE_MS);
  });

  it('keeps running when the view model listener throws', () => {
    const { runtime, errors } = setup({
      onViewModel: () => {
        throw new Error('webview gone');
      },
    });
    runtime.start();
    expect(errors).toStrictEqual(['View model listener failed: webview gone']);
  });

  it('stops all timers and ignores events after dispose (R18.1)', () => {
    const { runtime, timers, published } = setup();
    runtime.start();
    runtime.dispatch({ type: 'intent', intent: { kind: 'eyeRest.start' } });
    runtime.dispose();
    expect(timers.intervals.size).toBe(0);
    expect(timers.timeouts.size).toBe(0);
    const count = published.length;
    runtime.dispatch({ type: 'intent', intent: { kind: 'pause.start', durationMs: null } });
    timers.fireInterval();
    expect(published).toHaveLength(count);
    runtime.start();
    expect(timers.intervals.size).toBe(0);
  });
});
