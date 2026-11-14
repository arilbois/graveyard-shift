/**
 * Time as seen by the pure core (design §4.1). The core never reads a clock: every event carries an
 * Instant, so tests can drive five hours in milliseconds and simulate sleep or clock changes.
 */
export interface Instant {
  /** Milliseconds on a monotonic clock. Only meaningful within one host process. */
  readonly mono: number;
  /** Milliseconds since the Unix epoch (wall clock). Can jump, including backwards. */
  readonly wall: number;
}

export interface Clock {
  now(): Instant;
}

export interface Elapsed {
  readonly mono: number;
  readonly wall: number;
}

export function elapsed(from: Instant, to: Instant): Elapsed {
  return { mono: to.mono - from.mono, wall: to.wall - from.wall };
}

/**
 * True when both clocks moved forward and agree within `toleranceMs`. A disagreement means the
 * machine slept (monotonic paused while wall advanced) or the wall clock was changed (R4.1, R4.2).
 */
export function isConsistent(from: Instant, to: Instant, toleranceMs: number): boolean {
  const { mono, wall } = elapsed(from, to);
  return mono >= 0 && wall >= 0 && Math.abs(wall - mono) <= toleranceMs;
}

/** Wall-clock gap, or null when the wall clock moved backwards and the gap cannot be trusted (R5.9). */
export function trustedWallGap(fromWall: number, to: Instant): number | null {
  const gap = to.wall - fromWall;
  return gap >= 0 ? gap : null;
}
