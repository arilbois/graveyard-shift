import { validateConfig, type EffectiveConfig } from '../../src/shared/config';

/** Builds a validated config from relative setting keys, e.g. `{ 'reminders.eye.minutes': 30 }`. */
export function configWith(values: Record<string, unknown> = {}): EffectiveConfig {
  const result = validateConfig((key) => values[key]);
  if (result.problems.length > 0) throw new Error(`Invalid test config: ${JSON.stringify(result.problems)}`);
  return result.config;
}
