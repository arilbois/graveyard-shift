/**
 * Every user-facing string lives here so tone can be reviewed in one place (R19.5).
 * Rules: plain English, at most two short sentences, no medical claims, no guilt,
 * never describe activity as typing or productivity.
 */
export const COPY = {
  app: {
    name: 'Graveyard Shift',
  },
  placeholder: {
    awake: 'Graveyard Shift is awake.',
    note: 'Your companion is still being drawn. Break reminders arrive in a later update.',
  },
} as const;
