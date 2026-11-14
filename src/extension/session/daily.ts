import type { BreakKind } from './breaks';

/**
 * Today's aggregates (R14.3). Counts and durations only, framed around breaks. Daily history
 * persistence and the 30-day retention arrive with storage (task 10).
 */
export interface DailySummary {
  readonly day: string;
  readonly activeMs: number;
  readonly sessions: number;
  readonly breaks: number;
  readonly meaningfulBreaks: number;
  readonly eyeRests: number;
  readonly remindersSurfaced: number;
  readonly snoozed: number;
  readonly skipped: number;
  readonly missed: number;
}

export function emptyDay(day: string): DailySummary {
  return {
    day,
    activeMs: 0,
    sessions: 1,
    breaks: 0,
    meaningfulBreaks: 0,
    eyeRests: 0,
    remindersSurfaced: 0,
    snoozed: 0,
    skipped: 0,
    missed: 0,
  };
}

/** Starts a new day when the local date changes. A new day continues the current Session. */
export function rollDay(today: DailySummary, day: string): DailySummary {
  return today.day === day ? today : emptyDay(day);
}

export function countBreak(today: DailySummary, kind: BreakKind): DailySummary {
  switch (kind) {
    case 'eyeRest':
      return { ...today, eyeRests: today.eyeRests + 1 };
    case 'short':
      return { ...today, breaks: today.breaks + 1 };
    case 'meaningful':
    case 'long':
      return { ...today, breaks: today.breaks + 1, meaningfulBreaks: today.meaningfulBreaks + 1 };
  }
}

export type DailyCounter = 'remindersSurfaced' | 'snoozed' | 'skipped' | 'missed' | 'sessions';

export function increment(today: DailySummary, counter: DailyCounter): DailySummary {
  return { ...today, [counter]: today[counter] + 1 };
}

export function addActive(today: DailySummary, ms: number): DailySummary {
  return ms > 0 ? { ...today, activeMs: today.activeMs + ms } : today;
}
