/** Core domain vocabulary shared by host and webview. */

export const REMINDER_KINDS = ['eye', 'movement', 'hydration'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const COMPANION_STAGES = ['human', 'tired', 'infected', 'zombie', 'recovery'] as const;
export type CompanionStage = (typeof COMPANION_STAGES)[number];

export const LONG_SESSION_MODES = ['panel', 'sidebar', 'off'] as const;
export type LongSessionMode = (typeof LONG_SESSION_MODES)[number];
