import { LONG_SESSION_MODES, type LongSessionMode } from './domain';

/**
 * User settings: one spec table drives validation, defaults and the package.json contribution
 * check (R2, design §6.4). All settings are application-scoped (user-level only, R2.3).
 */

export const SETTINGS_SECTION = 'graveyardShift';

interface BooleanSpec {
  readonly kind: 'boolean';
  readonly key: string;
  readonly default: boolean;
}
interface IntegerSpec {
  readonly kind: 'integer';
  readonly key: string;
  readonly default: number;
  readonly minimum: number;
  readonly maximum: number;
}
interface EnumSpec<T extends string> {
  readonly kind: 'enum';
  readonly key: string;
  readonly default: T;
  readonly values: readonly T[];
}
export type SettingSpec = BooleanSpec | IntegerSpec | EnumSpec<string>;

const bool = (key: string, defaultValue: boolean): BooleanSpec => ({ kind: 'boolean', key, default: defaultValue });
const int = (key: string, defaultValue: number, minimum: number, maximum: number): IntegerSpec => ({
  kind: 'integer',
  key,
  default: defaultValue,
  minimum,
  maximum,
});
const oneOf = <T extends string>(key: string, defaultValue: T, values: readonly T[]): EnumSpec<T> => ({
  kind: 'enum',
  key,
  default: defaultValue,
  values,
});

/** Keys are relative to `graveyardShift.`. Baseline values mirror config/defaults.json. */
export const SETTINGS = {
  eyeEnabled: bool('reminders.eye.enabled', true),
  eyeMinutes: int('reminders.eye.minutes', 20, 5, 120),
  movementEnabled: bool('reminders.movement.enabled', true),
  movementMinutes: int('reminders.movement.minutes', 60, 15, 240),
  hydrationEnabled: bool('reminders.hydration.enabled', true),
  hydrationMinutes: int('reminders.hydration.minutes', 60, 15, 240),
  humanCheckIn: bool('reminders.humanCheckIn', true),
  saveCheckInsLocally: bool('reminders.saveCheckInsLocally', false),
  snoozeMinutes: int('reminders.snoozeMinutes', 10, 5, 60),
  companionEnabled: bool('companion.enabled', true),
  longSessionMode: oneOf<LongSessionMode>('companion.longSessionMode', 'panel', LONG_SESSION_MODES),
  longSessionHours: int('companion.longSessionHours', 5, 1, 12),
  tiredAfterMissedBreaks: int('companion.tiredAfterMissedBreaks', 1, 1, 20),
  infectedAfterMissedBreaks: int('companion.infectedAfterMissedBreaks', 3, 2, 30),
  zombieAfterMissedBreaks: int('companion.zombieAfterMissedBreaks', 5, 3, 40),
  sounds: bool('experience.sounds', true),
  soundVolume: int('experience.soundVolume', 30, 0, 100),
  reducedMotion: bool('experience.reducedMotion', true),
  focusMode: bool('experience.focusMode', true),
  idleMinutes: int('experience.idleMinutes', 5, 1, 30),
} as const satisfies Record<string, SettingSpec>;

export const SETTING_SPECS: readonly SettingSpec[] = Object.values(SETTINGS);

export interface ReminderKindConfig {
  readonly enabled: boolean;
  readonly minutes: number;
}

export interface StageThresholds {
  readonly tired: number;
  readonly infected: number;
  readonly zombie: number;
}

export interface EffectiveConfig {
  readonly reminders: {
    readonly eye: ReminderKindConfig;
    readonly movement: ReminderKindConfig;
    readonly hydration: ReminderKindConfig;
    readonly humanCheckIn: boolean;
    readonly saveCheckInsLocally: boolean;
    readonly snoozeMinutes: number;
  };
  readonly companion: {
    readonly enabled: boolean;
    readonly longSessionMode: LongSessionMode;
    readonly longSessionHours: number;
    readonly thresholds: StageThresholds;
  };
  readonly experience: {
    readonly sounds: boolean;
    /** Percent, 0–100. */
    readonly soundVolume: number;
    readonly reducedMotion: boolean;
    readonly focusMode: boolean;
    readonly idleMinutes: number;
  };
}

export type ConfigProblemReason = 'wrongType' | 'outOfRange' | 'notInteger' | 'thresholdOrder';

export interface ConfigProblem {
  /** Fully qualified setting id, e.g. `graveyardShift.reminders.eye.minutes`. */
  readonly setting: string;
  readonly reason: ConfigProblemReason;
  /** The value the extension uses instead. */
  readonly valueUsed: boolean | number | string;
}

export interface ConfigResult {
  readonly config: EffectiveConfig;
  readonly problems: readonly ConfigProblem[];
}

/** Reads a raw setting by its relative key. `undefined` means "not set". */
export type SettingReader = (key: string) => unknown;

const qualified = (key: string): string => `${SETTINGS_SECTION}.${key}`;

function createReader(read: SettingReader, problems: ConfigProblem[]) {
  const report = (spec: SettingSpec, reason: ConfigProblemReason, valueUsed: boolean | number | string): void => {
    problems.push({ setting: qualified(spec.key), reason, valueUsed });
  };

  return {
    boolean(spec: BooleanSpec): boolean {
      const raw = read(spec.key);
      if (raw === undefined) return spec.default;
      if (typeof raw === 'boolean') return raw;
      report(spec, 'wrongType', spec.default);
      return spec.default;
    },
    integer(spec: IntegerSpec): number {
      const raw = read(spec.key);
      if (raw === undefined) return spec.default;
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        report(spec, 'wrongType', spec.default);
        return spec.default;
      }
      const rounded = Math.round(raw);
      const clamped = Math.min(spec.maximum, Math.max(spec.minimum, rounded));
      if (clamped !== rounded) report(spec, 'outOfRange', clamped);
      else if (rounded !== raw) report(spec, 'notInteger', clamped);
      return clamped;
    },
    enumeration<T extends string>(spec: EnumSpec<T>): T {
      const raw = read(spec.key);
      if (raw === undefined) return spec.default;
      const match = spec.values.find((value) => value === raw);
      if (match !== undefined) return match;
      report(spec, 'wrongType', spec.default);
      return spec.default;
    },
  };
}

function orderedThresholds(candidate: StageThresholds, problems: ConfigProblem[]): StageThresholds {
  if (candidate.tired < candidate.infected && candidate.infected < candidate.zombie) return candidate;
  const fallback: StageThresholds = {
    tired: SETTINGS.tiredAfterMissedBreaks.default,
    infected: SETTINGS.infectedAfterMissedBreaks.default,
    zombie: SETTINGS.zombieAfterMissedBreaks.default,
  };
  problems.push({
    setting: qualified('companion.*AfterMissedBreaks'),
    reason: 'thresholdOrder',
    valueUsed: `${fallback.tired} / ${fallback.infected} / ${fallback.zombie}`,
  });
  return fallback;
}

/**
 * Turns raw user settings into a valid configuration. Never throws: wrong types fall back to the
 * default, numbers are rounded and clamped, and stage thresholds must be strictly increasing (R2.7, R2.8).
 */
export function validateConfig(read: SettingReader): ConfigResult {
  const problems: ConfigProblem[] = [];
  const r = createReader(read, problems);
  const S = SETTINGS;

  const thresholds = orderedThresholds(
    {
      tired: r.integer(S.tiredAfterMissedBreaks),
      infected: r.integer(S.infectedAfterMissedBreaks),
      zombie: r.integer(S.zombieAfterMissedBreaks),
    },
    problems,
  );

  const config: EffectiveConfig = {
    reminders: {
      eye: { enabled: r.boolean(S.eyeEnabled), minutes: r.integer(S.eyeMinutes) },
      movement: { enabled: r.boolean(S.movementEnabled), minutes: r.integer(S.movementMinutes) },
      hydration: { enabled: r.boolean(S.hydrationEnabled), minutes: r.integer(S.hydrationMinutes) },
      humanCheckIn: r.boolean(S.humanCheckIn),
      saveCheckInsLocally: r.boolean(S.saveCheckInsLocally),
      snoozeMinutes: r.integer(S.snoozeMinutes),
    },
    companion: {
      enabled: r.boolean(S.companionEnabled),
      longSessionMode: r.enumeration(S.longSessionMode),
      longSessionHours: r.integer(S.longSessionHours),
      thresholds,
    },
    experience: {
      sounds: r.boolean(S.sounds),
      soundVolume: r.integer(S.soundVolume),
      reducedMotion: r.boolean(S.reducedMotion),
      focusMode: r.boolean(S.focusMode),
      idleMinutes: r.integer(S.idleMinutes),
    },
  };
  return { config, problems };
}

export const DEFAULTS: EffectiveConfig = validateConfig(() => undefined).config;

/** The subset of settings defined by config/defaults.json, in that file's shape. */
export interface BaselineDefaults {
  readonly reminders: {
    readonly eye: ReminderKindConfig;
    readonly movement: ReminderKindConfig;
    readonly hydration: ReminderKindConfig;
    readonly humanCheckIn: boolean;
  };
  readonly companion: {
    readonly enabled: boolean;
    readonly longSessionMode: LongSessionMode;
    readonly longSessionHours: number;
  };
  readonly experience: {
    readonly sounds: boolean;
    readonly reducedMotion: boolean;
    readonly focusMode: boolean;
    readonly idleMinutes: number;
  };
}

export function toBaseline(config: EffectiveConfig): BaselineDefaults {
  const { reminders, companion, experience } = config;
  return {
    reminders: {
      eye: { ...reminders.eye },
      movement: { ...reminders.movement },
      hydration: { ...reminders.hydration },
      humanCheckIn: reminders.humanCheckIn,
    },
    companion: {
      enabled: companion.enabled,
      longSessionMode: companion.longSessionMode,
      longSessionHours: companion.longSessionHours,
    },
    experience: {
      sounds: experience.sounds,
      reducedMotion: experience.reducedMotion,
      focusMode: experience.focusMode,
      idleMinutes: experience.idleMinutes,
    },
  };
}

/** Must deep-equal config/defaults.json (R2.1, R20.3). */
export const BASELINE_DEFAULTS: BaselineDefaults = toBaseline(DEFAULTS);
