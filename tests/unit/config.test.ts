import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_DEFAULTS,
  DEFAULTS,
  SETTINGS,
  SETTING_SPECS,
  SETTINGS_SECTION,
  validateConfig,
  type SettingReader,
} from '../../src/shared/config';

const baselineJson: unknown = JSON.parse(readFileSync(new URL('../../config/defaults.json', import.meta.url), 'utf8'));

interface ContributedProperty {
  type: string;
  default: unknown;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  scope?: string;
  markdownDescription?: string;
}
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  contributes: { configuration: { properties: Record<string, ContributedProperty> } };
};
const contributed = manifest.contributes.configuration.properties;

const readerFrom =
  (values: Record<string, unknown>): SettingReader =>
  (key) =>
    values[key];

describe('baseline defaults', () => {
  it('equal config/defaults.json exactly (R2.1, R20.3)', () => {
    expect(BASELINE_DEFAULTS).toStrictEqual(baselineJson);
  });

  it('keep the baseline experience: sounds on, reduced motion on, focus mode on, 5-minute idle', () => {
    expect(DEFAULTS.experience).toMatchObject({ sounds: true, reducedMotion: true, focusMode: true, idleMinutes: 5 });
  });

  it('add the approved extensions with their approved defaults (R2.2)', () => {
    expect(DEFAULTS.experience.soundVolume).toBe(30);
    expect(DEFAULTS.reminders.saveCheckInsLocally).toBe(false);
    expect(DEFAULTS.reminders.snoozeMinutes).toBe(10);
    expect(DEFAULTS.companion.thresholds).toStrictEqual({ tired: 1, infected: 3, zombie: 5 });
  });
});

describe('package.json configuration contribution', () => {
  it('declares exactly the settings in the spec table', () => {
    const expected = SETTING_SPECS.map((spec) => `${SETTINGS_SECTION}.${spec.key}`).sort();
    expect(Object.keys(contributed).sort()).toStrictEqual(expected);
  });

  it.each(SETTING_SPECS.map((spec) => [spec.key, spec] as const))('%s matches its spec', (key, spec) => {
    const property = contributed[`${SETTINGS_SECTION}.${key}`];
    expect(property).toBeDefined();
    if (!property) return;
    expect(property.default).toStrictEqual(spec.default);
    expect(property.scope).toBe('application');
    expect(property.markdownDescription?.length ?? 0).toBeGreaterThan(0);
    switch (spec.kind) {
      case 'boolean':
        expect(property.type).toBe('boolean');
        break;
      case 'integer':
        expect(property.type).toBe('integer');
        expect(property.minimum).toBe(spec.minimum);
        expect(property.maximum).toBe(spec.maximum);
        break;
      case 'enum':
        expect(property.type).toBe('string');
        expect(property.enum).toStrictEqual(spec.values);
        break;
    }
  });

  it('never describes activity as typing, productivity or health measurement', () => {
    const text = Object.values(contributed)
      .map((p) => p.markdownDescription ?? '')
      .join(' ')
      .toLowerCase();
    expect(text).not.toMatch(/\btyping\b|productiv|keystroke|diagnos|unhealthy/);
  });
});

describe('validateConfig', () => {
  it('returns the defaults without problems when nothing is set', () => {
    const result = validateConfig(() => undefined);
    expect(result.config).toStrictEqual(DEFAULTS);
    expect(result.problems).toHaveLength(0);
  });

  it('accepts valid user values unchanged', () => {
    const result = validateConfig(
      readerFrom({
        'reminders.eye.minutes': 30,
        'experience.reducedMotion': false,
        'companion.longSessionMode': 'sidebar',
        'experience.soundVolume': 0,
      }),
    );
    expect(result.problems).toHaveLength(0);
    expect(result.config.reminders.eye.minutes).toBe(30);
    expect(result.config.experience.reducedMotion).toBe(false);
    expect(result.config.companion.longSessionMode).toBe('sidebar');
    expect(result.config.experience.soundVolume).toBe(0);
  });

  it('clamps out-of-range numbers to the nearest bound and reports the value used', () => {
    const result = validateConfig(readerFrom({ 'reminders.eye.minutes': 1, 'experience.idleMinutes': 999 }));
    expect(result.config.reminders.eye.minutes).toBe(SETTINGS.eyeMinutes.minimum);
    expect(result.config.experience.idleMinutes).toBe(SETTINGS.idleMinutes.maximum);
    expect(result.problems).toStrictEqual([
      { setting: 'graveyardShift.reminders.eye.minutes', reason: 'outOfRange', valueUsed: 5 },
      { setting: 'graveyardShift.experience.idleMinutes', reason: 'outOfRange', valueUsed: 30 },
    ]);
  });

  it('rounds fractional values and reports them', () => {
    const result = validateConfig(readerFrom({ 'companion.longSessionHours': 4.6 }));
    expect(result.config.companion.longSessionHours).toBe(5);
    expect(result.problems).toStrictEqual([
      { setting: 'graveyardShift.companion.longSessionHours', reason: 'notInteger', valueUsed: 5 },
    ]);
  });

  it.each([
    ['reminders.eye.enabled', 'yes', 'graveyardShift.reminders.eye.enabled', true],
    ['reminders.eye.minutes', '20', 'graveyardShift.reminders.eye.minutes', 20],
    ['experience.soundVolume', Number.NaN, 'graveyardShift.experience.soundVolume', 30],
    ['experience.sounds', null, 'graveyardShift.experience.sounds', true],
    ['companion.longSessionMode', 'fullscreen', 'graveyardShift.companion.longSessionMode', 'panel'],
  ])('falls back to the default for a wrong type: %s = %o', (key, raw, setting, valueUsed) => {
    const result = validateConfig(readerFrom({ [key]: raw }));
    expect(result.problems).toStrictEqual([{ setting, reason: 'wrongType', valueUsed }]);
  });

  it('accepts custom thresholds that are strictly increasing', () => {
    const result = validateConfig(
      readerFrom({
        'companion.tiredAfterMissedBreaks': 2,
        'companion.infectedAfterMissedBreaks': 4,
        'companion.zombieAfterMissedBreaks': 8,
      }),
    );
    expect(result.problems).toHaveLength(0);
    expect(result.config.companion.thresholds).toStrictEqual({ tired: 2, infected: 4, zombie: 8 });
  });

  it.each([
    [3, 3, 5],
    [4, 3, 5],
    [1, 6, 5],
  ])('uses all three default thresholds with one warning when not increasing (%i, %i, %i)', (t, i, z) => {
    const result = validateConfig(
      readerFrom({
        'companion.tiredAfterMissedBreaks': t,
        'companion.infectedAfterMissedBreaks': i,
        'companion.zombieAfterMissedBreaks': z,
      }),
    );
    expect(result.config.companion.thresholds).toStrictEqual({ tired: 1, infected: 3, zombie: 5 });
    expect(result.problems).toStrictEqual([
      { setting: 'graveyardShift.companion.*AfterMissedBreaks', reason: 'thresholdOrder', valueUsed: '1 / 3 / 5' },
    ]);
  });
});
