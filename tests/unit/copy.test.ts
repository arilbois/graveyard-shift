import { describe, expect, it } from 'vitest';
import { COPY, aboutDuration } from '../../src/shared/copy';
import { COMPANION_STAGES, type ReminderKind } from '../../src/shared/domain';

/**
 * Reviewable list of wording the product must not use (R19). Activity is never "typing" or
 * "productivity"; there are no diagnoses, no guilt, no urgency and no achievements for long sessions.
 */
const BANNED = [
  /\btyping\b/i,
  /\bkeystroke/i,
  /productiv/i,
  /\bdiagnos/i,
  /\bunhealthy\b/i,
  /\bburn ?out\b/i,
  /\bdehydrat/i,
  /\bfatigue\b/i,
  /\blazy\b/i,
  /\bshould have\b/i,
  /\byou failed\b/i,
  /\bshame/i,
  /\bguilt/i,
  /\burgent/i,
  /\bimmediately\b/i,
  /\bstreak\b/i,
  /\brecord\b/i,
  /\bachievement/i,
  /!/,
];

const KINDS: ReminderKind[][] = [['eye'], ['movement'], ['hydration'], ['movement', 'hydration'], ['eye', 'movement', 'hydration']];

function allStrings(): string[] {
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') strings.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(COPY);
  for (const stage of COMPANION_STAGES) walk(COPY.stage(stage));
  for (const kinds of KINDS) strings.push(COPY.reminder.title(kinds), COPY.reminder.body(kinds));
  strings.push(
    COPY.notice.snoozed(10),
    COPY.notice.snoozedOut(20),
    COPY.snoozed(7),
    COPY.confirmBreak.question(12),
    COPY.confirmBreak.question(null),
    COPY.welcomeBack.question(9),
    COPY.paused.until(42),
    COPY.stats(2, 38, 100),
    COPY.sidebar.eyeRestLeft(12),
    COPY.statusBar.normal('Feeling human', '42m'),
    COPY.statusBar.accessible('Feeling human', 42),
    COPY.sidebar.awayFor(7),
  );
  return strings;
}

describe('user-facing copy (R19)', () => {
  it.each(allStrings().map((s) => [s]))('"%s" avoids banned wording', (text) => {
    for (const pattern of BANNED) expect(text).not.toMatch(pattern);
  });

  it('keeps messages to at most two sentences', () => {
    for (const text of allStrings()) {
      const sentences = text.split(/[.?]\s+(?=[A-Z])/).length;
      expect(sentences, text).toBeLessThanOrEqual(2);
    }
  });

  it('describes activity as an estimate in the stats line (R3.10)', () => {
    expect(COPY.stats(0, 0, 90)).toContain('estimated IDE activity');
  });

  it('builds natural reminder text for combined kinds', () => {
    expect(COPY.reminder.title(['movement', 'hydration'])).toBe('Time for a short break');
    expect(COPY.reminder.body(['eye', 'movement', 'hydration'])).toBe(
      'Rest your eyes, stretch your legs and grab some water.',
    );
    expect(COPY.reminder.body(['eye'])).toBe('Look at something far away for about 20 seconds.');
  });
});

describe('aboutDuration', () => {
  it.each([
    [0, 'less than a minute'],
    [0.4, 'less than a minute'],
    [1, 'about 1 min'],
    [59, 'about 59 min'],
    [60, 'about 1 h'],
    [100, 'about 1 h 40 min'],
    [-5, 'less than a minute'],
  ])('%d minutes → %s', (minutes, text) => {
    expect(aboutDuration(minutes)).toBe(text);
  });
});
