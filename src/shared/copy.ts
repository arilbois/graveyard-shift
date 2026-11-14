import type { CompanionStage, ReminderKind } from './domain';

/**
 * Every user-facing string lives here so tone can be reviewed in one place (R19.5).
 * Rules (R19): plain English, at most two short sentences, no medical claims, no guilt or urgency,
 * never describe activity as typing or productivity, and praise breaks rather than hours.
 */

export function aboutDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return 'less than a minute';
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `about ${h} h` : `about ${h} h ${rest} min`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

interface StageCopy {
  readonly label: string;
  readonly line: string;
  readonly description: string;
}

const STAGES: Readonly<Record<CompanionStage, StageCopy>> = {
  human: {
    label: 'Feeling human',
    line: 'Still warm. The odd break keeps it that way.',
    description: 'Your companion, looking healthy and alert.',
  },
  tired: {
    label: 'Getting tired',
    line: 'Your companion is yawning. A short pause would help them.',
    description: 'Your companion, yawning with heavy eyelids.',
  },
  infected: {
    label: "Something's off",
    line: 'A little green around the edges. A few minutes away could turn this around.',
    description: 'Your companion, tinged green and slouching.',
  },
  zombie: {
    label: 'Fully undead',
    line: 'Your companion has gone full zombie. A break brings them back.',
    description: 'Your companion as a shambling zombie.',
  },
  recovery: {
    label: 'Coming back',
    line: "Colour's returning. Welcome back.",
    description: 'Your companion, colour returning to their face.',
  },
};

const REMINDER_PHRASE: Readonly<Record<ReminderKind, string>> = {
  eye: 'rest your eyes',
  movement: 'stretch your legs',
  hydration: 'grab some water',
};

function joinPhrases(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const COPY = {
  app: {
    name: 'Graveyard Shift',
  },

  stage: (stage: CompanionStage): StageCopy => STAGES[stage],

  reminder: {
    title(kinds: readonly ReminderKind[]): string {
      if (kinds.length > 1) return 'Time for a short break';
      if (kinds[0] === 'movement') return 'Time to move';
      if (kinds[0] === 'hydration') return 'Time for some water';
      return 'Time to rest your eyes';
    },
    body(kinds: readonly ReminderKind[]): string {
      if (kinds.length === 1 && kinds[0] === 'eye') return 'Look at something far away for about 20 seconds.';
      return `${capitalise(joinPhrases(kinds.map((kind) => REMINDER_PHRASE[kind])))}.`;
    },
    subtleHint: 'Shown quietly while you were busy in the editor.',
    actions: { takeBreak: 'Take a break', snooze: 'Snooze', skip: 'Skip' },
  },

  notice: {
    snoozed: (minutes: number): string => `Okay. I'll check back in about ${minutes} minutes.`,
    snoozedOut: (minutes: number): string => `Okay. Next check-in in about ${minutes} minutes.`,
    skipped: 'Okay, skipped for now.',
  },

  snoozed: (minutes: number): string => `Reminder snoozed. Back in ${aboutDuration(minutes)} of activity.`,

  eyeRest: {
    text: 'Look at something far away. The countdown ends on its own.',
    cancel: 'Cancel',
  },

  onBreak: {
    text: "Enjoy your break. Come back whenever you're ready.",
    back: "I'm back",
  },

  confirmBreak: {
    question: (minutes: number | null): string =>
      minutes === null
        ? 'Welcome back. Count that as a break?'
        : `You were away for ${aboutDuration(minutes)}. Count it as a break?`,
    yes: 'Yes, count it',
    no: 'No',
    atLeastFive: '5 minutes or more',
    lessThanFive: 'Less than 5 minutes',
  },

  welcomeBack: {
    question: (minutes: number): string => `Welcome back. Were you taking a break? (${aboutDuration(minutes)} away)`,
    yes: 'Yes',
    no: 'No',
  },

  paused: {
    untilRestart: 'Paused until Kiro restarts. Nothing is being estimated.',
    until: (minutes: number): string => `Paused for ${aboutDuration(minutes)} more. Nothing is being estimated.`,
    resume: 'Resume',
  },

  status: {
    active: 'Estimating IDE activity.',
    idle: 'Idle. Idle time is not counted as a break.',
    unfocused: 'Kiro is in the background.',
    onBreak: 'On a break.',
    eyeRest: 'Resting your eyes.',
    paused: 'Paused.',
  },

  stats: (breaksToday: number, minutesSinceBreak: number, activeMinutes: number): string =>
    [
      `${plural(breaksToday, 'break', 'breaks')} today`,
      `${aboutDuration(minutesSinceBreak)} since a break`,
      `${aboutDuration(activeMinutes)} of estimated IDE activity`,
    ].join(' · '),

  statusBar: {
    paused: '$(debug-pause) Paused',
    reminder: '$(bell-dot) Break reminder',
    normal: (label: string, since: string): string => `$(heart) ${label} · ${since} since break`,
    accessible: (label: string, minutes: number): string =>
      `${label}. ${capitalise(aboutDuration(minutes))} of estimated activity since a break.`,
  },

  pause: {
    placeholder: 'Pause Graveyard Shift for how long?',
    thirtyMinutes: '30 minutes',
    oneHour: '1 hour',
    untilRestart: 'Until Kiro restarts',
  },

  sidebar: {
    loading: 'Waking up your companion.',
    companionOff: 'The companion is hidden. Reminders still work.',
    takeBreak: 'Take a break',
    restEyes: 'Rest my eyes',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    soundLabel: 'Reminder sound',
    eyeRestLeft: (seconds: number): string => `${Math.max(0, Math.ceil(seconds))} seconds left.`,
    awayFor: (minutes: number): string => `Away for ${aboutDuration(minutes)}.`,
    reminderRegion: 'Break reminder',
    confirmRegion: 'Count this break',
    welcomeBackRegion: 'Welcome back',
    statsRegion: 'Today',
  },
} as const;
