import type { EffectiveConfig } from '../../shared/config';
import { TICK_MS } from '../../shared/constants';
import type { Clock, Instant } from '../../shared/time';
import type { CompanionViewModel } from '../../shared/viewModel';
import {
  initialState,
  nextDeadline,
  step,
  type CoreEnv,
  type CoreEvent,
  type CoreState,
  type Effect,
} from './engine';
import { selectViewModel } from './selectors';

/**
 * The imperative shell around the pure core (design §6.1). It stamps events with the clock, runs
 * `step`, hands effects to a sink, publishes the view model when it changes, and keeps exactly one
 * periodic tick plus at most one one-shot timer for the nearest deadline (R18.2).
 */

type WithoutAt<T> = T extends { readonly at: unknown } ? Omit<T, 'at'> : never;
/** A core event before the runtime stamps it with the current time. */
export type RuntimeInput = WithoutAt<CoreEvent>;

export type Cancel = () => void;

export interface Timers {
  setInterval(callback: () => void, ms: number): Cancel;
  setTimeout(callback: () => void, ms: number): Cancel;
}

export interface EffectSink {
  apply(effect: Effect, state: CoreState): void;
}

export interface RuntimeLog {
  error(message: string): void;
}

export interface RuntimeDeps {
  readonly clock: Clock;
  readonly env: CoreEnv;
  readonly config: EffectiveConfig;
  readonly focused: boolean;
  readonly windowActive: boolean;
  readonly timers: Timers;
  readonly effects: EffectSink;
  readonly log: RuntimeLog;
  readonly onViewModel: (viewModel: CompanionViewModel) => void;
}

export const systemTimers: Timers = {
  setInterval(callback, ms) {
    const handle = setInterval(callback, ms);
    return () => {
      clearInterval(handle);
    };
  },
  setTimeout(callback, ms) {
    const handle = setTimeout(callback, ms);
    return () => {
      clearTimeout(handle);
    };
  },
};

export class Runtime {
  private state: CoreState;
  private lastPublished = '';
  private viewModelValue: CompanionViewModel;
  private cancelTick: Cancel | null = null;
  private cancelDeadline: Cancel | null = null;
  private disposed = false;

  constructor(private readonly deps: RuntimeDeps) {
    const at = deps.clock.now();
    this.state = initialState(deps.config, at, deps.env, { focused: deps.focused, windowActive: deps.windowActive });
    this.viewModelValue = selectViewModel(this.state, at);
  }

  start(): void {
    if (this.disposed || this.cancelTick !== null) return;
    this.cancelTick = this.deps.timers.setInterval(() => {
      this.dispatch({ type: 'tick' });
    }, TICK_MS);
    this.publish(true);
  }

  get viewModel(): CompanionViewModel {
    return this.viewModelValue;
  }

  /** Read-only view of the core state, for adapters such as the status bar. */
  get snapshot(): CoreState {
    return this.state;
  }

  dispatch(input: RuntimeInput): void {
    if (this.disposed) return;
    const event = stamp(input, this.deps.clock.now());
    let effects: readonly Effect[];
    try {
      const result = step(this.state, event, this.deps.env);
      this.state = result.state;
      effects = result.effects;
    } catch (error: unknown) {
      this.deps.log.error(`Core step failed for event "${event.type}": ${describe(error)}`);
      return;
    }

    for (const effect of effects) {
      try {
        this.deps.effects.apply(effect, this.state);
      } catch (error: unknown) {
        this.deps.log.error(`Effect "${effect.type}" failed: ${describe(error)}`);
      }
    }
    this.publish(false);
    this.scheduleDeadline();
  }

  /** Re-sends the current view model, e.g. when a webview becomes visible (R1.4). */
  republish(): void {
    this.publish(true);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTick?.();
    this.cancelDeadline?.();
    this.cancelTick = null;
    this.cancelDeadline = null;
  }

  private publish(force: boolean): void {
    const viewModel = selectViewModel(this.state, this.deps.clock.now());
    const serialized = JSON.stringify(viewModel);
    this.viewModelValue = viewModel;
    if (!force && serialized === this.lastPublished) return;
    this.lastPublished = serialized;
    try {
      this.deps.onViewModel(viewModel);
    } catch (error: unknown) {
      this.deps.log.error(`View model listener failed: ${describe(error)}`);
    }
  }

  private scheduleDeadline(): void {
    this.cancelDeadline?.();
    this.cancelDeadline = null;
    const now = this.deps.clock.now();
    const deadline = nextDeadline(this.state, now);
    if (deadline === null) return;
    this.cancelDeadline = this.deps.timers.setTimeout(
      () => {
        this.cancelDeadline = null;
        this.dispatch({ type: 'tick' });
      },
      Math.max(0, deadline - now.mono),
    );
  }
}

function stamp(input: RuntimeInput, at: Instant): CoreEvent {
  switch (input.type) {
    case 'tick':
      return { type: 'tick', at };
    case 'signal':
      return { type: 'signal', source: input.source, at };
    case 'focus':
      return { type: 'focus', focused: input.focused, at };
    case 'windowActive':
      return { type: 'windowActive', active: input.active, at };
    case 'config':
      return { type: 'config', config: input.config, at };
    case 'intent':
      return { type: 'intent', intent: input.intent, at };
  }
}

/** Error messages only; never payloads or content (R14.7). */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
