import { describe, expect, it } from 'vitest';
import { selectViewModel } from '../../src/extension/application/selectors';
import { HOUR_MS, MINUTE_MS } from '../../src/shared/constants';
import { configWith } from '../support/config';
import { EngineDriver } from '../support/engineDriver';

const breaksOnly = { 'reminders.eye.enabled': false };

describe('selectViewModel', () => {
  it('starts Human, idle, with baseline motion and sound', () => {
    const d = new EngineDriver();
    const vm = selectViewModel(d.state, d.clock.now());
    expect(vm.companion).toMatchObject({ stage: 'human', label: 'Feeling human', enabled: true });
    expect(vm.status).toBe('idle');
    expect(vm.motion).toBe('reduced');
    expect(vm.sound).toStrictEqual({ enabled: true, volume: 0.3 });
    expect(vm.reminder).toBeNull();
  });

  it('shows full motion only when reduced motion is turned off', () => {
    const d = new EngineDriver(configWith({ 'experience.reducedMotion': false }));
    expect(selectViewModel(d.state, d.clock.now()).motion).toBe('full');
  });

  it('shows a live reminder with copy, and marks quiet delivery', () => {
    const d = new EngineDriver(configWith(breaksOnly)).work(61);
    const vm = selectViewModel(d.state, d.clock.now());
    expect(vm.reminder).toMatchObject({ kinds: ['movement', 'hydration'], title: 'Time for a short break', subtle: false });
    expect(vm.status).toBe('active');
  });

  it('replaces the reminder card with a snoozed line while snoozed', () => {
    const d = new EngineDriver(configWith(breaksOnly)).work(61);
    d.intent({ kind: 'reminder.snooze', occurrenceId: d.live?.id ?? '' });
    const vm = selectViewModel(d.state, d.clock.now());
    expect(vm.reminder).toBeNull();
    expect(vm.snoozed?.text).toContain('about 10 min');
    expect(vm.notice).toBe("Okay. I'll check back in about 10 minutes.");
  });

  it('reports idle after the idle threshold, and unfocused when Kiro is in the background', () => {
    const d = new EngineDriver().work(5);
    d.clock.advance(6 * MINUTE_MS);
    expect(selectViewModel(d.state, d.clock.now()).status).toBe('idle');
    d.focus(false);
    expect(selectViewModel(d.state, d.clock.now()).status).toBe('unfocused');
  });

  it('shows the pause with time remaining', () => {
    const d = new EngineDriver();
    d.intent({ kind: 'pause.start', durationMs: HOUR_MS });
    const vm = selectViewModel(d.state, d.clock.now());
    expect(vm.status).toBe('paused');
    expect(vm.paused?.text).toContain('about 1 h');
  });

  it('frames stats around breaks and labels activity as an estimate', () => {
    const d = new EngineDriver().work(90);
    const vm = selectViewModel(d.state, d.clock.now());
    expect(vm.stats.text).toMatch(/^0 breaks today · about 1 h 29 min since a break · about 1 h 29 min of estimated IDE activity$/);
  });
});
