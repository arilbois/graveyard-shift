import { describe, expect, it } from 'vitest';
import { nextDeadline } from '../../src/extension/application/engine';
import { displayedStage } from '../../src/extension/companion/stage';
import {
  EYE_REST_MS,
  HOUR_MS,
  MAX_DEFER_MS,
  MINUTE_MS,
  SECOND_MS,
  SESSION_RESET_GAP_MS,
} from '../../src/shared/constants';
import { configWith } from '../support/config';
import { EngineDriver } from '../support/engineDriver';

const breaksOnly = { 'reminders.eye.enabled': false };
const eyeOnly = { 'reminders.movement.enabled': false, 'reminders.hydration.enabled': false };

describe('reminders end to end', () => {
  it('surfaces the eye reminder after 20 minutes of estimated activity, with a soft cue', () => {
    // work(N) credits N minutes minus 30 s: the first signal of a chain credits nothing.
    const d = new EngineDriver(configWith(eyeOnly)).work(20);
    expect(d.state.session.activeMs).toBe(19.5 * MINUTE_MS);
    expect(d.surfaced()).toStrictEqual([]);
    // Due at the next signal; that signal is interaction, so it surfaces at the 15 s tick after it.
    d.work(1);
    expect(d.surfaced()).toStrictEqual(['occ-1']);
    expect(d.cues()).toStrictEqual(['reminder']);
    expect(d.state.today.remindersSurfaced).toBe(1);
  });

  it('plays no cue when sounds are off', () => {
    const d = new EngineDriver(configWith({ ...eyeOnly, 'experience.sounds': false })).work(21);
    expect(d.surfaced()).toHaveLength(1);
    expect(d.cues()).toStrictEqual([]);
  });

  it('defers while the user keeps interacting, then delivers quietly after 2 minutes (R7.2, R7.3)', () => {
    const d = new EngineDriver(configWith(eyeOnly)).work(20);
    // Due after 30 s of typing; keep typing for the whole 2-minute deferral and a little more.
    d.type(30 + MAX_DEFER_MS / SECOND_MS - 5);
    expect(d.live?.status).toBe('pending');
    d.type(10);
    expect(d.surfaced()).toStrictEqual([]);
    expect(d.live?.status).toBe('subtle');
    d.work(5);
    expect(d.surfaced()).toStrictEqual([]);
  });

  it('surfaces immediately during interaction when focus mode is off', () => {
    const d = new EngineDriver(configWith({ ...eyeOnly, 'experience.focusMode': false })).work(19.5);
    d.type(60);
    expect(d.surfaced()).toStrictEqual(['occ-1']);
  });

  it('never surfaces in an unfocused window and accrues nothing there (R7.6, R21.1)', () => {
    const d = new EngineDriver(configWith(eyeOnly)).work(19.5);
    d.focus(false);
    d.work(30);
    expect(d.surfaced()).toStrictEqual([]);
    expect(d.state.session.activeMs).toBeLessThan(20 * MINUTE_MS);
  });

  it('does not accrue while away, even with Kiro focused', () => {
    const d = new EngineDriver().work(10);
    const before = d.state.session.activeMs;
    d.away(60);
    expect(d.state.session.activeMs).toBe(before);
  });
});

describe('companion reacts to missed breaks, not hours (R10)', () => {
  it('turns Tired after one skipped Break Reminder', () => {
    const d = new EngineDriver(configWith(breaksOnly)).work(61);
    const id = d.live?.id ?? '';
    d.intent({ kind: 'reminder.skip', occurrenceId: id });
    expect(d.state.companion.stage).toBe('tired');
    expect(d.state.today.skipped).toBe(1);
  });

  it('does not change for skipped eye-only reminders', () => {
    const d = new EngineDriver(configWith(eyeOnly)).work(21);
    d.intent({ kind: 'reminder.skip', occurrenceId: d.live?.id ?? '' });
    expect(d.state.companion.stage).toBe('human');
  });

  it('stays Human through long sessions when breaks are taken', () => {
    const d = new EngineDriver(configWith(breaksOnly));
    for (let hour = 0; hour < 6; hour++) {
      d.work(61);
      const id = d.live?.id ?? '';
      d.intent({ kind: 'reminder.takeBreak', occurrenceId: id });
      d.away(6);
      d.signal();
      const breakId = d.state.breaks.phase === 'awaitingConfirm' ? d.state.breaks.id : '';
      d.intent({ kind: 'break.confirm', breakId, confirmed: true, atLeastFiveMinutes: false });
    }
    expect(d.state.companion.stage).toBe('human');
    expect(d.state.today.breaks).toBe(6);
  });

  it('a missed reminder counts once, not every minute it stays unanswered', () => {
    const d = new EngineDriver(configWith(breaksOnly)).work(61);
    d.work(15);
    expect(d.state.companion.count).toBe(1);
    d.work(30);
    expect(d.state.companion.count).toBe(1);
    expect(d.state.today.missed).toBe(1);
  });
});

describe('take a break flow (R5)', () => {
  function onBreak(): EngineDriver {
    const d = new EngineDriver(configWith(breaksOnly)).work(61);
    d.intent({ kind: 'reminder.skip', occurrenceId: d.live?.id ?? '' });
    d.work(61);
    d.intent({ kind: 'reminder.takeBreak', occurrenceId: d.live?.id ?? '' });
    return d;
  }

  it('credits no activity during the break and ignores signals in the grace period', () => {
    const d = onBreak();
    const before = d.state.session.activeMs;
    d.type(30);
    expect(d.state.breaks.phase).toBe('onBreak');
    expect(d.state.session.activeMs).toBe(before);
  });

  it('a confirmed Meaningful Break resets the stretch, resolves the reminder and shows Recovery with a cue', () => {
    const d = onBreak();
    d.away(7);
    d.signal();
    expect(d.state.breaks.phase).toBe('awaitingConfirm');
    const breakId = d.state.breaks.phase === 'awaitingConfirm' ? d.state.breaks.id : '';
    d.intent({ kind: 'break.confirm', breakId, confirmed: true, atLeastFiveMinutes: false });

    expect(d.state.session.stretchMs).toBe(0);
    expect(d.live).toBeNull();
    expect(displayedStage(d.state.companion)).toBe('recovery');
    expect(d.cues()).toContain('recovery');
    expect(d.state.today).toMatchObject({ breaks: 1, meaningfulBreaks: 1 });
  });

  it('declining credits nothing and keeps the reminder', () => {
    const d = onBreak();
    d.away(7);
    d.signal();
    const breakId = d.state.breaks.phase === 'awaitingConfirm' ? d.state.breaks.id : '';
    const stretch = d.state.session.stretchMs;
    d.intent({ kind: 'break.confirm', breakId, confirmed: false, atLeastFiveMinutes: false });
    expect(d.state.session.stretchMs).toBeGreaterThanOrEqual(stretch);
    expect(d.live).not.toBeNull();
    expect(d.state.today.breaks).toBe(0);
  });

  it('a 20-second Eye Rest never resets the unbroken stretch', () => {
    const d = new EngineDriver(configWith(eyeOnly)).work(21);
    const stretch = d.state.session.stretchMs;
    d.intent({ kind: 'reminder.takeBreak', occurrenceId: d.live?.id ?? '' });
    expect(nextDeadline(d.state, d.clock.now())).toBe(d.clock.now().mono + EYE_REST_MS);
    d.clock.advance(EYE_REST_MS);
    d.tick();
    expect(d.state.breaks.phase).toBe('none');
    expect(d.state.today.eyeRests).toBe(1);
    expect(d.state.session.stretchMs).toBe(stretch);
    expect(d.live).toBeNull();
  });
});

describe('welcome back and idle (R5.8, R3.9)', () => {
  it('asks after a 10-minute absence and credits a break only on yes', () => {
    const d = new EngineDriver().work(10);
    d.away(10);
    d.signal();
    const prompt = d.state.welcomeBack.prompt;
    expect(prompt).not.toBeNull();
    d.intent({ kind: 'welcomeBack.answer', promptId: prompt?.id ?? '', tookBreak: true });
    expect(d.state.today.meaningfulBreaks).toBe(1);
    expect(d.state.session.stretchMs).toBe(0);
  });

  it('idle alone never counts as a break', () => {
    const d = new EngineDriver().work(30);
    const stretch = d.state.session.stretchMs;
    d.away(30);
    d.signal();
    d.intent({ kind: 'welcomeBack.answer', promptId: d.state.welcomeBack.prompt?.id ?? '', tookBreak: false });
    expect(d.state.today.breaks).toBe(0);
    expect(d.state.session.stretchMs).toBe(stretch);
  });
});

describe('new Session after 6 hours (R4.7, D1)', () => {
  it('withdraws overdue reminders, clears the infection and keeps today\'s statistics', () => {
    const d = new EngineDriver(configWith(breaksOnly)).work(61);
    d.intent({ kind: 'reminder.skip', occurrenceId: d.live?.id ?? '' });
    d.work(61);
    expect(d.live).not.toBeNull();
    const activeToday = d.state.today.activeMs;

    d.clock.sleep(SESSION_RESET_GAP_MS);
    d.signal();

    expect(d.live).toBeNull();
    expect(d.state.companion).toMatchObject({ count: 0, stage: 'human' });
    expect(d.state.session).toMatchObject({ activeMs: 0, stretchMs: 0 });
    expect(d.state.today.activeMs).toBe(activeToday);
    expect(d.state.today.skipped).toBe(1);
    expect(d.state.today.sessions).toBe(2);
    expect(d.state.today.breaks).toBe(0);
    expect(d.state.welcomeBack.prompt).toBeNull();
  });
});

describe('pause (R14.8)', () => {
  it('stops estimation and reminders, then resumes cleanly', () => {
    const d = new EngineDriver(configWith(eyeOnly)).work(19.5);
    d.intent({ kind: 'pause.start', durationMs: HOUR_MS });
    d.work(30);
    expect(d.surfaced()).toStrictEqual([]);
    expect(d.state.session.activeMs).toBeLessThan(20 * MINUTE_MS);
    d.intent({ kind: 'pause.resume' });
    expect(d.state.pause).toBeNull();
    expect(d.state.welcomeBack.prompt).toBeNull();
    d.work(2);
    expect(d.surfaced()).toStrictEqual(['occ-1']);
  });

  it('a timed pause ends on its own', () => {
    const d = new EngineDriver().work(1);
    d.intent({ kind: 'pause.start', durationMs: 30 * MINUTE_MS });
    expect(nextDeadline(d.state, d.clock.now())).toBe(d.clock.now().mono + 30 * MINUTE_MS);
    d.away(31);
    expect(d.state.pause).toBeNull();
  });
});

describe('settings changes', () => {
  it('disabling a kind withdraws its reminder without counting a missed break (R2.9)', () => {
    const d = new EngineDriver(configWith(breaksOnly)).work(61);
    expect(d.live).not.toBeNull();
    d.config({ ...breaksOnly, 'reminders.movement.enabled': false, 'reminders.hydration.enabled': false });
    expect(d.live).toBeNull();
    expect(d.state.companion.count).toBe(0);
  });

  it('new thresholds apply immediately', () => {
    const d = new EngineDriver(configWith(breaksOnly)).work(61);
    d.intent({ kind: 'reminder.skip', occurrenceId: d.live?.id ?? '' });
    expect(d.state.companion.stage).toBe('tired');
    d.config({
      ...breaksOnly,
      'companion.tiredAfterMissedBreaks': 2,
      'companion.infectedAfterMissedBreaks': 3,
      'companion.zombieAfterMissedBreaks': 4,
    });
    expect(d.state.companion.stage).toBe('human');
  });
});

describe('daily aggregates', () => {
  it('start fresh on a new local day and never roll backwards', () => {
    let day = '2026-11-14';
    const d = new EngineDriver(configWith(), { localDay: () => day }).work(5);
    expect(d.state.today.activeMs).toBeGreaterThan(0);
    day = '2026-11-15';
    d.work(1);
    expect(d.state.today.day).toBe('2026-11-15');
    expect(d.state.today.activeMs).toBeLessThanOrEqual(MINUTE_MS);
    day = '2026-11-14';
    d.work(1);
    expect(d.state.today.day).toBe('2026-11-15');
  });
});
