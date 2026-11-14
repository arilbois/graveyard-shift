/**
 * User intents: the only things a Webview or a command can ask the core to do (R15.4).
 * Validators for the message bridge live in messages.ts (task 8).
 */
export type UserIntent =
  | { readonly kind: 'reminder.takeBreak'; readonly occurrenceId: string }
  | { readonly kind: 'reminder.snooze'; readonly occurrenceId: string }
  | { readonly kind: 'reminder.skip'; readonly occurrenceId: string }
  | { readonly kind: 'eyeRest.start' }
  | { readonly kind: 'eyeRest.cancel' }
  | { readonly kind: 'break.start' }
  | { readonly kind: 'break.end'; readonly breakId: string }
  | {
      readonly kind: 'break.confirm';
      readonly breakId: string;
      readonly confirmed: boolean;
      readonly atLeastFiveMinutes: boolean;
    }
  | { readonly kind: 'welcomeBack.answer'; readonly promptId: string; readonly tookBreak: boolean }
  /** `durationMs: null` pauses until the extension restarts. */
  | { readonly kind: 'pause.start'; readonly durationMs: number | null }
  | { readonly kind: 'pause.resume' };

export type UserIntentKind = UserIntent['kind'];
