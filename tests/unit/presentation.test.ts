import { describe, expect, it } from 'vitest';
import { selectViewModel } from '../../src/extension/application/selectors';
import {
  PAUSE_CHOICES,
  statusBarContent,
  toastContent,
  toastIntent,
} from '../../src/extension/notifications/presentation';
import { HOUR_MS, MINUTE_MS } from '../../src/shared/constants';
import { configWith } from '../support/config';
import { EngineDriver } from '../support/engineDriver';

const breaksOnly = configWith({ 'reminders.eye.enabled': false });
const vmOf = (d: EngineDriver) => selectViewModel(d.state, d.clock.now());

describe('toasts (R7.4)', () => {
  it('shows the reminder text with exactly three actions', () => {
    expect(toastContent(['movement', 'hydration'])).toStrictEqual({
      message: 'Time for a short break. Stretch your legs and grab some water.',
      actions: ['Take a break', 'Snooze', 'Skip'],
    });
  });

  it('maps each action to an intent for that occurrence, and closing to nothing (R7.7)', () => {
    expect(toastIntent('occ-4', 'Take a break')).toStrictEqual({ kind: 'reminder.takeBreak', occurrenceId: 'occ-4' });
    expect(toastIntent('occ-4', 'Snooze')).toStrictEqual({ kind: 'reminder.snooze', occurrenceId: 'occ-4' });
    expect(toastIntent('occ-4', 'Skip')).toStrictEqual({ kind: 'reminder.skip', occurrenceId: 'occ-4' });
    expect(toastIntent('occ-4', undefined)).toBeNull();
  });

  it('a stale toast action is ignored by the core (R7.8)', () => {
    const d = new EngineDriver(breaksOnly).work(61);
    const id = d.live?.id ?? '';
    d.intent({ kind: 'reminder.skip', occurrenceId: id });
    const before = d.state;
    const late = toastIntent(id, 'Skip');
    if (late) d.intent(late);
    expect(d.state.companion).toStrictEqual(before.companion);
    expect(d.state.today.skipped).toBe(1);
  });
});

describe('status bar (R1.6, R17.2)', () => {
  it('shows the stage and time since a break', () => {
    const content = statusBarContent(vmOf(new EngineDriver().work(42)));
    expect(content).toMatchObject({ visible: true, attention: false, text: '$(heart) Feeling human · 41m since break' });
    expect(content.accessibilityLabel).toBe('Feeling human. About 41 min of estimated activity since a break.');
  });

  it('formats hours compactly', () => {
    const d = new EngineDriver(configWith({ 'reminders.eye.enabled': false, 'reminders.movement.enabled': false, 'reminders.hydration.enabled': false }));
    d.work(126);
    expect(statusBarContent(vmOf(d)).text).toBe('$(heart) Feeling human · 2h 5m since break');
  });

  it('switches to a calm attention state while a reminder is live', () => {
    const content = statusBarContent(vmOf(new EngineDriver(breaksOnly).work(61)));
    expect(content).toMatchObject({ attention: true, text: '$(bell-dot) Break reminder' });
  });

  it('shows Paused', () => {
    const d = new EngineDriver();
    d.intent({ kind: 'pause.start', durationMs: null });
    expect(statusBarContent(vmOf(d))).toMatchObject({ visible: true, text: '$(debug-pause) Paused' });
  });

  it('hides when the companion is disabled, unless something needs attention', () => {
    expect(statusBarContent(vmOf(new EngineDriver(configWith({ 'companion.enabled': false })))).visible).toBe(false);
  });
});

describe('pause choices', () => {
  it('offers 30 minutes, 1 hour and until restart', () => {
    expect(PAUSE_CHOICES.map((c) => c.durationMs)).toStrictEqual([30 * MINUTE_MS, HOUR_MS, null]);
  });
});
