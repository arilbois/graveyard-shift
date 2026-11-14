import { INTERACTION_WINDOW_MS, MAX_DEFER_MS, SPACING_MS } from '../../shared/constants';
import type { Instant } from '../../shared/time';
import type { Occurrence } from './scheduler';

/**
 * Delivery policy (R7, design §4.6). Decides how a pending occurrence reaches the user. The sidebar
 * always shows pending occurrences regardless of this decision, so nothing is ever silently lost.
 */

export type DeliveryDecision = 'surface' | 'subtle' | 'wait';

export interface DeliveryContext {
  readonly at: Instant;
  /** Only the focused (Owner) window delivers (R7.6, R21.3). */
  readonly focused: boolean;
  readonly paused: boolean;
  /** Eye rest, on break, or awaiting break confirmation. */
  readonly breakActive: boolean;
  readonly lastHumanOpen: boolean;
  readonly demoHoldsReal: boolean;
  readonly focusMode: boolean;
  readonly activeMs: number;
  readonly lastSurfacedActiveMs: number | null;
  readonly lastInteraction: Instant | null;
}

/** Active Editor Interaction: a keyboard or mouse selection signal within the last 10 seconds. */
export function isInteracting(lastInteraction: Instant | null, at: Instant): boolean {
  if (lastInteraction === null) return false;
  const since = at.mono - lastInteraction.mono;
  return since >= 0 && since < INTERACTION_WINDOW_MS;
}

export function canInterrupt(ctx: DeliveryContext): boolean {
  const spaced = ctx.lastSurfacedActiveMs === null || ctx.activeMs - ctx.lastSurfacedActiveMs >= SPACING_MS;
  return ctx.focused && !ctx.paused && !ctx.breakActive && !ctx.lastHumanOpen && !ctx.demoHoldsReal && spaced;
}

export function decideDelivery(occurrence: Occurrence, ctx: DeliveryContext): DeliveryDecision {
  if (occurrence.status !== 'pending' || !canInterrupt(ctx)) return 'wait';
  if (!ctx.focusMode || !isInteracting(ctx.lastInteraction, ctx.at)) return 'surface';
  // Still interacting: hold for up to 2 minutes, then deliver quietly and never upgrade (R7.3).
  return ctx.at.mono - occurrence.pendingSince.mono >= MAX_DEFER_MS ? 'subtle' : 'wait';
}

/**
 * When a deferred occurrence could next change decision without any new event: the end of the
 * current interaction window or the 2-minute cap. Spacing is in Active Time and is handled by ticks.
 */
export function deliveryDeadline(occurrence: Occurrence | null, ctx: DeliveryContext): number | null {
  if (occurrence?.status !== 'pending' || !ctx.focusMode || !canInterrupt(ctx)) return null;
  if (!isInteracting(ctx.lastInteraction, ctx.at) || ctx.lastInteraction === null) return null;
  return Math.min(ctx.lastInteraction.mono + INTERACTION_WINDOW_MS, occurrence.pendingSince.mono + MAX_DEFER_MS);
}
