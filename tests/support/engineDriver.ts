import {
  initialState,
  step,
  type CoreEnv,
  type CoreEvent,
  type CoreState,
  type Effect,
} from '../../src/extension/application/engine';
import type { Occurrence } from '../../src/extension/reminders/scheduler';
import type { SignalSource } from '../../src/extension/session/accounting';
import type { EffectiveConfig } from '../../src/shared/config';
import { MINUTE_MS, SECOND_MS } from '../../src/shared/constants';
import type { UserIntent } from '../../src/shared/intents';
import { configWith } from './config';
import { FakeClock } from './fakeClock';

export const TEST_ENV: CoreEnv = { localDay: () => '2026-11-14' };

/** Drives the pure engine with a fake clock and records every effect. */
export class EngineDriver {
  readonly clock: FakeClock;
  state: CoreState;
  effects: Effect[] = [];

  constructor(
    config: EffectiveConfig = configWith(),
    readonly env: CoreEnv = TEST_ENV,
  ) {
    this.clock = new FakeClock();
    this.state = initialState(config, this.clock.now(), env, { focused: true, windowActive: false });
  }

  send(event: CoreEvent): Effect[] {
    const result = step(this.state, event, this.env);
    this.state = result.state;
    this.effects.push(...result.effects);
    return [...result.effects];
  }

  signal(source: SignalSource = 'keyboardSelection'): Effect[] {
    return this.send({ type: 'signal', source, at: this.clock.now() });
  }
  tick(): Effect[] {
    return this.send({ type: 'tick', at: this.clock.now() });
  }
  focus(focused: boolean): Effect[] {
    return this.send({ type: 'focus', focused, at: this.clock.now() });
  }
  intent(intent: UserIntent): Effect[] {
    return this.send({ type: 'intent', intent, at: this.clock.now() });
  }
  config(values: Record<string, unknown>): Effect[] {
    return this.send({ type: 'config', config: configWith(values), at: this.clock.now() });
  }

  /**
   * Steady editor use with natural pauses: a keyboard signal every 30 s with a tick 15 s after it,
   * so there is a 10-second interaction pause between signals.
   */
  work(minutes: number): this {
    const steps = Math.round((minutes * MINUTE_MS) / (30 * SECOND_MS));
    for (let i = 0; i < steps; i++) {
      this.clock.advance(15 * SECOND_MS);
      this.tick();
      this.clock.advance(15 * SECOND_MS);
      this.signal();
    }
    return this;
  }

  /** Continuous interaction: a keyboard signal every 5 s, never pausing for 10 s. */
  type(seconds: number): this {
    for (let elapsed = 0; elapsed < seconds; elapsed += 5) {
      this.clock.advance(5 * SECOND_MS);
      this.signal();
    }
    return this;
  }

  /** Away from the keyboard with Kiro focused: only ticks, no signals. */
  away(minutes: number): this {
    const steps = Math.round((minutes * MINUTE_MS) / (15 * SECOND_MS));
    for (let i = 0; i < steps; i++) {
      this.clock.advance(15 * SECOND_MS);
      this.tick();
    }
    return this;
  }

  get live(): Occurrence | null {
    return this.state.reminders.live;
  }

  surfaced(): string[] {
    return this.effects.flatMap((e) => (e.type === 'surfaceReminder' ? [e.occurrence.id] : []));
  }

  cues(): string[] {
    return this.effects.flatMap((e) => (e.type === 'playCue' ? [e.cue] : []));
  }
}
