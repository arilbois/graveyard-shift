import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SETTING_SPECS, SETTINGS, validateConfig, type EffectiveConfig } from '../../src/shared/config';
import { LONG_SESSION_MODES } from '../../src/shared/domain';

/** Any JSON-ish value a user could put in settings.json, plus "unset". */
const rawValue = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.boolean(),
  fc.double(),
  fc.integer({ min: -1_000, max: 1_000 }),
  fc.string(),
  fc.constantFrom(...LONG_SESSION_MODES),
  fc.array(fc.integer(), { maxLength: 3 }),
  fc.dictionary(fc.string(), fc.integer(), { maxKeys: 2 }),
);

const rawSettings = fc.record(Object.fromEntries(SETTING_SPECS.map((spec) => [spec.key, rawValue])));

function inRange(value: number, spec: { minimum: number; maximum: number }): boolean {
  return Number.isInteger(value) && value >= spec.minimum && value <= spec.maximum;
}

function isValid(config: EffectiveConfig): boolean {
  const { reminders: r, companion: c, experience: e } = config;
  const S = SETTINGS;
  return (
    inRange(r.eye.minutes, S.eyeMinutes) &&
    inRange(r.movement.minutes, S.movementMinutes) &&
    inRange(r.hydration.minutes, S.hydrationMinutes) &&
    inRange(r.snoozeMinutes, S.snoozeMinutes) &&
    inRange(c.longSessionHours, S.longSessionHours) &&
    inRange(c.thresholds.tired, S.tiredAfterMissedBreaks) &&
    inRange(c.thresholds.infected, S.infectedAfterMissedBreaks) &&
    inRange(c.thresholds.zombie, S.zombieAfterMissedBreaks) &&
    c.thresholds.tired < c.thresholds.infected &&
    c.thresholds.infected < c.thresholds.zombie &&
    inRange(e.soundVolume, S.soundVolume) &&
    inRange(e.idleMinutes, S.idleMinutes) &&
    LONG_SESSION_MODES.includes(c.longSessionMode) &&
    [r.eye.enabled, r.movement.enabled, r.hydration.enabled, r.humanCheckIn, r.saveCheckInsLocally].every(
      (b) => typeof b === 'boolean',
    ) &&
    [c.enabled, e.sounds, e.reducedMotion, e.focusMode].every((b) => typeof b === 'boolean')
  );
}

/** Writes an EffectiveConfig back out as raw settings, keyed like the spec table. */
function toRaw(config: EffectiveConfig): Record<string, unknown> {
  const { reminders: r, companion: c, experience: e } = config;
  return {
    'reminders.eye.enabled': r.eye.enabled,
    'reminders.eye.minutes': r.eye.minutes,
    'reminders.movement.enabled': r.movement.enabled,
    'reminders.movement.minutes': r.movement.minutes,
    'reminders.hydration.enabled': r.hydration.enabled,
    'reminders.hydration.minutes': r.hydration.minutes,
    'reminders.humanCheckIn': r.humanCheckIn,
    'reminders.saveCheckInsLocally': r.saveCheckInsLocally,
    'reminders.snoozeMinutes': r.snoozeMinutes,
    'companion.enabled': c.enabled,
    'companion.longSessionMode': c.longSessionMode,
    'companion.longSessionHours': c.longSessionHours,
    'companion.tiredAfterMissedBreaks': c.thresholds.tired,
    'companion.infectedAfterMissedBreaks': c.thresholds.infected,
    'companion.zombieAfterMissedBreaks': c.thresholds.zombie,
    'experience.sounds': e.sounds,
    'experience.soundVolume': e.soundVolume,
    'experience.reducedMotion': e.reducedMotion,
    'experience.focusMode': e.focusMode,
    'experience.idleMinutes': e.idleMinutes,
  };
}

describe('validateConfig (property)', () => {
  it('always yields a valid configuration, whatever the user wrote', () => {
    fc.assert(
      fc.property(rawSettings, (raw) => {
        const { config } = validateConfig((key) => raw[key]);
        expect(isValid(config)).toBe(true);
      }),
    );
  });

  it('is idempotent: validating its own output changes nothing and reports nothing', () => {
    fc.assert(
      fc.property(rawSettings, (raw) => {
        const first = validateConfig((key) => raw[key]).config;
        const firstRaw = toRaw(first);
        const second = validateConfig((key) => firstRaw[key]);
        expect(second.problems).toHaveLength(0);
        expect(second.config).toStrictEqual(first);
      }),
    );
  });

  it('reports at most one problem per setting', () => {
    fc.assert(
      fc.property(rawSettings, (raw) => {
        const { problems } = validateConfig((key) => raw[key]);
        const settings = problems.map((p) => p.setting);
        expect(new Set(settings).size).toBe(settings.length);
      }),
    );
  });
});
