import { CLOCK_TOLERANCE_MS } from '../../shared/constants';
import { isConsistent, trustedWallGap, type Instant } from '../../shared/time';

/**
 * Active-time accounting (design §4.3, R3, R4).
 *
 * Active Time is an estimate of IDE interaction, credited only from the gap between two consecutive
 * Activity Signals in a focused window, and only when that gap is at most the idle threshold and the
 * monotonic and wall clocks agree. Credit is final when the next signal arrives, so the estimate may
 * lag by up to the idle threshold but never over-counts and never goes back.
 */

/** Content-free sources of Activity Signals. None of them means "typing". */
export type SignalSource = 'focus' | 'windowActive' | 'keyboardSelection' | 'mouseSelection' | 'webview';

export type AccountingEvent =
  | { readonly type: 'signal'; readonly source: SignalSource; readonly at: Instant }
  | { readonly type: 'focus'; readonly focused: boolean; readonly at: Instant }
  | { readonly type: 'windowActive'; readonly active: boolean; readonly at: Instant }
  | { readonly type: 'tick'; readonly at: Instant };

export interface AccountingState {
  readonly focused: boolean;
  readonly windowActive: boolean;
  /** Anchor of the current credit chain; null after focus loss, suspension or a restart. */
  readonly chain: Instant | null;
  /** Wall time of the last evidence of presence (signal or focus loss); persisted across restarts. */
  readonly lastSeenWall: number | null;
  /** Last keyboard- or mouse-driven selection signal, for Active Editor Interaction (R7.2). */
  readonly lastInteraction: Instant | null;
}

export interface AccountingContext {
  readonly idleMs: number;
  /** Paused or on a break: nothing is credited and the chain is dropped (R14.8, design §4.5). */
  readonly suspended: boolean;
}

/** A signal that ended a period without evidence of presence (idle, unfocused, asleep or restarted). */
export interface PresenceReturn {
  /** Wall-clock length of the absence, or null when the wall clock moved backwards. */
  readonly wallGapMs: number | null;
}

export interface AccountingResult {
  readonly state: AccountingState;
  readonly creditedMs: number;
  readonly returned: PresenceReturn | null;
}

export function initialAccounting(focused: boolean, windowActive: boolean): AccountingState {
  return { focused, windowActive, chain: null, lastSeenWall: null, lastInteraction: null };
}

/** After a restart the in-process chain is meaningless; only the wall time of the last presence survives. */
export function restoredAccounting(
  lastSeenWall: number | null,
  focused: boolean,
  windowActive: boolean,
): AccountingState {
  return { ...initialAccounting(focused, windowActive), lastSeenWall };
}

/**
 * Call when a suspension (pause or break) ends at `at`. The absence is already handled by the
 * break or pause flow, so presence restarts here and no welcome-back is reported for it.
 */
export function resumeAccounting(state: AccountingState, at: Instant): AccountingState {
  return { ...state, chain: null, lastSeenWall: at.wall };
}

const unchanged = (state: AccountingState): AccountingResult => ({ state, creditedMs: 0, returned: null });

function creditFor(chain: Instant | null, at: Instant, idleMs: number): number {
  if (chain === null || !isConsistent(chain, at, CLOCK_TOLERANCE_MS)) return 0;
  const gap = at.mono - chain.mono;
  return gap <= idleMs ? gap : 0;
}

function presenceReturn(state: AccountingState, at: Instant, idleMs: number): PresenceReturn | null {
  if (state.lastSeenWall === null) return null;
  const wallGapMs = trustedWallGap(state.lastSeenWall, at);
  if (wallGapMs === null) return { wallGapMs: null };
  // A return only matters when the absence was longer than the idle threshold.
  const continuing = state.chain !== null && creditFor(state.chain, at, idleMs) > 0;
  return continuing || wallGapMs <= idleMs ? null : { wallGapMs };
}

function applySignal(
  state: AccountingState,
  source: SignalSource,
  at: Instant,
  context: AccountingContext,
): AccountingResult {
  const creditedMs = creditFor(state.chain, at, context.idleMs);
  const returned = presenceReturn(state, at, context.idleMs);
  const interaction = source === 'keyboardSelection' || source === 'mouseSelection';
  return {
    state: {
      ...state,
      chain: at,
      lastSeenWall: at.wall,
      lastInteraction: interaction ? at : state.lastInteraction,
    },
    creditedMs,
    returned,
  };
}

export function reduceAccounting(
  state: AccountingState,
  event: AccountingEvent,
  context: AccountingContext,
): AccountingResult {
  if (context.suspended) {
    // Measure nothing while paused or on a break; drop the chain so suspended time is never credited.
    const base: AccountingState = { ...state, chain: null };
    switch (event.type) {
      case 'focus':
        return unchanged({ ...base, focused: event.focused });
      case 'windowActive':
        return unchanged({ ...base, windowActive: event.active });
      case 'signal':
      case 'tick':
        return unchanged(base);
    }
  }

  switch (event.type) {
    case 'signal':
      return state.focused ? applySignal(state, event.source, event.at, context) : unchanged(state);

    case 'tick':
      // While the IDE reports recent interaction in a focused window, each tick is a heartbeat (R3.6).
      return state.focused && state.windowActive
        ? applySignal(state, 'windowActive', event.at, context)
        : unchanged(state);

    case 'windowActive': {
      const next = { ...state, windowActive: event.active };
      return event.active && state.focused ? applySignal(next, 'windowActive', event.at, context) : unchanged(next);
    }

    case 'focus': {
      if (event.focused === state.focused) return unchanged(state);
      if (event.focused) {
        // Gaining focus is a signal that starts a new chain; the unfocused span is never credited.
        return applySignal({ ...state, focused: true, chain: null }, 'focus', event.at, context);
      }
      // Losing focus: credit up to this moment (R3.5), then stop until focus returns.
      const creditedMs = creditFor(state.chain, event.at, context.idleMs);
      return {
        state: { ...state, focused: false, chain: null, lastSeenWall: event.at.wall },
        creditedMs,
        returned: null,
      };
    }
  }
}
