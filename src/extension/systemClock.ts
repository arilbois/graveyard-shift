import { performance } from 'node:perf_hooks';
import type { Clock, Instant } from '../shared/time';

/** Real clock for the host: monotonic from `performance.now()`, wall from `Date.now()`. */
export const systemClock: Clock = {
  now(): Instant {
    return { mono: performance.now(), wall: Date.now() };
  },
};

/** Local calendar day, e.g. `2026-11-14`, for daily aggregates. */
export function localDay(wall: number): string {
  const date = new Date(wall);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
