import { SESSION_RESET_GAP_MS } from '../../shared/constants';
import type { Instant } from '../../shared/time';
import type { BreakKind } from './breaks';

/**
 * Session totals and the new-Session rule (R4.7, design §4.4). A Gap of at least 6 hours starts a
 * new Session without recording a break; the engine also withdraws pending reminders and resets the
 * companion. Daily history is not touched here.
 */

export interface SessionTotals {
  readonly startedAtWall: number;
  /** Estimated IDE activity in this Session. */
  readonly activeMs: number;
  /** Active Time since the last Meaningful Break or the Session start (drives The Last Human). */
  readonly stretchMs: number;
  /** Active Time since the last Confirmed Break of any length (not Eye Rests), for the status bar (R1.6). */
  readonly sinceBreakMs: number;
}

export function newSession(at: Instant): SessionTotals {
  return { startedAtWall: at.wall, activeMs: 0, stretchMs: 0, sinceBreakMs: 0 };
}

/** True when an absence is long enough to start a new Session. Untrusted gaps never are. */
export function startsNewSession(wallGapMs: number | null): boolean {
  return wallGapMs !== null && wallGapMs >= SESSION_RESET_GAP_MS;
}

export function creditSession(session: SessionTotals, ms: number): SessionTotals {
  if (ms <= 0) return session;
  return {
    ...session,
    activeMs: session.activeMs + ms,
    stretchMs: session.stretchMs + ms,
    sinceBreakMs: session.sinceBreakMs + ms,
  };
}

/** Only a Meaningful or Long Break ends the Unbroken Stretch; Eye Rests and short breaks never do (R5.3, R5.7). */
export function applyBreakToSession(session: SessionTotals, kind: BreakKind): SessionTotals {
  switch (kind) {
    case 'eyeRest':
      return session;
    case 'short':
      return { ...session, sinceBreakMs: 0 };
    case 'meaningful':
    case 'long':
      return { ...session, stretchMs: 0, sinceBreakMs: 0 };
  }
}
