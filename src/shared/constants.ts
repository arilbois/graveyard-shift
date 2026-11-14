/**
 * Internal timing and mechanics constants (design §13, marked † in requirements).
 * These are product mechanics, not medical thresholds. User-tunable values live in config.ts.
 * Tests import these names rather than repeating literals.
 */

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;

// Runtime and signals
export const TICK_MS = 15 * SECOND_MS;
export const COALESCE_MS = 1 * SECOND_MS;
/** Max disagreement between monotonic and wall elapsed time before an interval is a Gap (R4.2). */
export const CLOCK_TOLERANCE_MS = 60 * SECOND_MS;

// Delivery (R7)
/** A keyboard/mouse selection signal this recent means Active Editor Interaction; also the pause length. */
export const INTERACTION_WINDOW_MS = 10 * SECOND_MS;
export const MAX_DEFER_MS = 2 * MINUTE_MS;
/** Minimum Active Time between two surfacings, including The Last Human (R6.5). */
export const SPACING_MS = 5 * MINUTE_MS;
/** Kinds within this much Active Time of their interval join a due occurrence (R6.4). */
export const COMBINE_WINDOW_MS = 5 * MINUTE_MS;
/** Snoozes that re-surface an occurrence; the next snooze resolves it as missed (R8.3). */
export const MAX_SNOOZES = 2;
/** Active Time with no response after delivery before an occurrence is missed (R7.9). */
export const MISSED_AFTER_MS = 15 * MINUTE_MS;

// Breaks (R5)
export const EYE_REST_MS = 20 * SECOND_MS;
/** Signals this soon after a break starts do not end it (R5.5). */
export const BREAK_END_GRACE_MS = 60 * SECOND_MS;
export const MEANINGFUL_BREAK_MS = 5 * MINUTE_MS;
export const LONG_BREAK_MS = 15 * MINUTE_MS;
export const CONFIRM_TIMEOUT_MS = 10 * MINUTE_MS;
export const WELCOME_BACK_MIN_GAP_MS = 5 * MINUTE_MS;
export const WELCOME_BACK_RATE_MS = 30 * MINUTE_MS;

// Sessions (R4.7)
export const SESSION_RESET_GAP_MS = 6 * HOUR_MS;

// Companion (R10)
export const SHORT_BREAK_CREDIT = 1;
export const MEANINGFUL_BREAK_CREDIT = 2;
/** Missed Break Count is capped at the zombie threshold plus this (R10.3). */
export const COUNT_CAP_OFFSET = 2;
export const RECOVERY_DISPLAY_MS = 3 * MINUTE_MS;

// The Last Human (R11)
export const LH_REMIND_LATER_MS = 60 * MINUTE_MS;
export const LH_MAX_PER_STRETCH = 2;
export const LH_MAX_PER_SESSION = 2;

// Human Check-in (R9)
export const CHECKIN_MIN_SPACING_MS = 2 * HOUR_MS;

// Storage (R14.4, R18.3, R21)
export const HISTORY_DAYS = 30;
export const PERSIST_DEBOUNCE_MS = 30 * SECOND_MS;
export const HANDOFF_RECHECK_MS = 1 * SECOND_MS;
