import type { CompanionStage, ReminderKind } from './domain';

/**
 * The snapshot the Host sends to Webviews (design §5). Webviews render it and send intents back;
 * they never compute timing or wording (R15.4, R19.5). Strings are final user-facing copy.
 */

export type ActivityStatus = 'active' | 'idle' | 'unfocused' | 'onBreak' | 'eyeRest' | 'paused';

export interface ReminderView {
  readonly id: string;
  readonly kinds: readonly ReminderKind[];
  readonly title: string;
  readonly body: string;
  /** Delivered quietly because the user was busy in the editor (R7.3). */
  readonly subtle: boolean;
}

export interface CompanionViewModel {
  readonly protocol: 1;
  readonly demo: null | { readonly label: string };
  readonly companion: {
    readonly enabled: boolean;
    readonly stage: CompanionStage;
    readonly label: string;
    readonly line: string;
    /** Text alternative for the sprite (R13.2). */
    readonly description: string;
  };
  readonly motion: 'full' | 'reduced';
  readonly sound: { readonly enabled: boolean; readonly volume: number };
  readonly status: ActivityStatus;
  readonly statusText: string;
  readonly reminder: ReminderView | null;
  readonly snoozed: null | { readonly text: string };
  readonly notice: string | null;
  readonly eyeRest: null | { readonly endsAtWall: number; readonly text: string };
  readonly onBreak: null | { readonly id: string; readonly startedAtWall: number; readonly text: string };
  readonly confirmBreak: null | {
    readonly id: string;
    readonly question: string;
    /** True when the duration is unknown and the user picks "5 minutes or more" or "less" (R5.9). */
    readonly askDuration: boolean;
  };
  readonly welcomeBack: null | { readonly id: string; readonly question: string };
  readonly paused: null | { readonly text: string };
  readonly stats: {
    readonly text: string;
    readonly breaksToday: number;
    readonly eyeRestsToday: number;
    readonly minutesSinceBreak: number;
    readonly activeMinutesEstimate: number;
  };
}
