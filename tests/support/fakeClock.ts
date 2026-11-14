import type { Clock, Instant } from '../../src/shared/time';

/** Deterministic clock whose monotonic and wall readings can be moved independently. */
export class FakeClock implements Clock {
  private mono: number;
  private wall: number;

  constructor(start: Partial<Instant> = {}) {
    this.mono = start.mono ?? 1_000_000;
    this.wall = start.wall ?? Date.UTC(2026, 10, 14, 9, 0, 0);
  }

  now(): Instant {
    return { mono: this.mono, wall: this.wall };
  }

  /** Normal passage of time: both clocks advance together. */
  advance(ms: number): Instant {
    this.mono += ms;
    this.wall += ms;
    return this.now();
  }

  /** System sleep: wall time passes, the monotonic clock does not. */
  sleep(ms: number): Instant {
    this.wall += ms;
    return this.now();
  }

  /** Manual or NTP wall-clock change; may be negative. */
  shiftWall(ms: number): Instant {
    this.wall += ms;
    return this.now();
  }
}
