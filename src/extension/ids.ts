/** Contribution ids. Must match package.json (checked by tests/unit/manifest.test.ts). */
export const VIEW_CONTAINER_ID = 'graveyardShift';
export const VIEW_ID = 'graveyardShift.companion';

export const COMMANDS = {
  openCompanion: 'graveyardShift.openCompanion',
  takeBreak: 'graveyardShift.takeBreak',
  startEyeRest: 'graveyardShift.startEyeRest',
  pause: 'graveyardShift.pause',
  resume: 'graveyardShift.resume',
} as const;
