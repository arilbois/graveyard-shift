import type { EffectiveConfig } from '../../shared/config';
import { MINUTE_MS, NOTICE_MS } from '../../shared/constants';
import type { ReminderKind } from '../../shared/domain';
import type { UserIntent } from '../../shared/intents';
import type { Instant } from '../../shared/time';
import {
  applyBreak,
  applyMissedBreak,
  applyThresholds,
  companionDeadline,
  INITIAL_COMPANION,
  tickCompanion,
  type CompanionState,
} from '../companion/stage';
import { decideDelivery, deliveryDeadline, type DeliveryContext } from '../reminders/delivery';
import {
  accumulate,
  applyConfig as applyReminderConfig,
  applyEyeRest,
  applyMeaningfulBreak,
  applyShortBreak,
  evaluate,
  INITIAL_REMINDERS,
  isBreakReminder,
  isMissedBreak,
  markDelivered,
  resetForNewSession,
  skip,
  snooze,
  takeBreakTarget,
  type ReminderState,
  type Resolution,
} from '../reminders/scheduler';
import {
  initialAccounting,
  reduceAccounting,
  resumeAccounting,
  type AccountingState,
  type SignalSource,
} from '../session/accounting';
import {
  breakDeadline,
  breakSignal,
  cancelEyeRest,
  confirmBreak,
  endBreak,
  isSuspending,
  NO_BREAK,
  startBreak,
  startEyeRest,
  tickBreaks,
  type BreakOutcome,
  type BreakRecord,
  type BreakState,
} from '../session/breaks';
import { addActive, countBreak, emptyDay, increment, rollDay, type DailySummary } from '../session/daily';
import {
  applyBreakToSession,
  creditSession,
  newSession,
  startsNewSession,
  type SessionTotals,
} from '../session/lifecycle';
import {
  answerWelcomeBack,
  NO_WELCOME_BACK,
  offerWelcomeBack,
  tickWelcomeBack,
  welcomeBackDeadline,
  withdrawWelcomeBack,
  type WelcomeBackState,
} from '../session/welcomeBack';

/**
 * The pure core (design §4.2). `step(state, event, env)` is deterministic: same state, event and
 * environment give the same result. Sub-reducers run in a fixed order: accounting, breaks,
 * reminders, companion, delivery. Only the delivery stage emits interruptive effects.
 */

export type CoreEvent =
  | { readonly type: 'tick'; readonly at: Instant }
  | { readonly type: 'signal'; readonly source: SignalSource; readonly at: Instant }
  | { readonly type: 'focus'; readonly focused: boolean; readonly at: Instant }
  | { readonly type: 'windowActive'; readonly active: boolean; readonly at: Instant }
  | { readonly type: 'config'; readonly config: EffectiveConfig; readonly at: Instant }
  | { readonly type: 'intent'; readonly intent: UserIntent; readonly at: Instant };

export interface OccurrenceView {
  readonly id: string;
  readonly kinds: readonly ReminderKind[];
}

export type Effect =
  | { readonly type: 'surfaceReminder'; readonly occurrence: OccurrenceView }
  | { readonly type: 'playCue'; readonly cue: 'reminder' | 'recovery' };

/** A short acknowledgement after a reminder action, shown in the sidebar for a minute (R8.2–R8.4). */
export type Notice = (
  | { readonly kind: 'snoozed'; readonly minutes: number }
  | { readonly kind: 'snoozedOut'; readonly minutes: number }
  | { readonly kind: 'skipped' }
) & { readonly untilMono: number };

export interface PauseState {
  /** Monotonic end of the pause, or null for "until restart". */
  readonly untilMono: number | null;
  readonly untilWall: number | null;
}

export interface CoreState {
  readonly config: EffectiveConfig;
  readonly accounting: AccountingState;
  readonly session: SessionTotals;
  readonly breaks: BreakState;
  readonly welcomeBack: WelcomeBackState;
  readonly reminders: ReminderState;
  readonly companion: CompanionState;
  readonly pause: PauseState | null;
  readonly today: DailySummary;
  readonly notice: Notice | null;
  /** True while a Demo Simulation holds real reminders (R16.3). */
  readonly demoHoldsReal: boolean;
  /** Counter for break and prompt ids. */
  readonly seq: number;
}

export interface CoreEnv {
  /** Local calendar day for a wall time, e.g. `2026-11-14`. Injected so the core has no timezone logic. */
  readonly localDay: (wall: number) => string;
}

export interface StepResult {
  readonly state: CoreState;
  readonly effects: readonly Effect[];
}

export interface InitialOptions {
  readonly focused: boolean;
  readonly windowActive: boolean;
}

export function initialState(config: EffectiveConfig, at: Instant, env: CoreEnv, options: InitialOptions): CoreState {
  return {
    config,
    accounting: initialAccounting(options.focused, options.windowActive),
    session: newSession(at),
    breaks: NO_BREAK,
    welcomeBack: NO_WELCOME_BACK,
    reminders: INITIAL_REMINDERS,
    companion: INITIAL_COMPANION,
    pause: null,
    today: emptyDay(env.localDay(at.wall)),
    notice: null,
    demoHoldsReal: false,
    seq: 0,
  };
}

/** Mutable working copy for one step; keeps the orchestration readable. Never escapes `step`. */
interface Draft {
  s: CoreState;
  effects: Effect[];
}

function nextId(d: Draft, prefix: string): string {
  const seq = d.s.seq + 1;
  d.s = { ...d.s, seq };
  return `${prefix}-${seq}`;
}

function applyResolutions(d: Draft, resolutions: readonly Resolution[]): void {
  for (const resolution of resolutions) {
    if (resolution.outcome === 'skipped') d.s = { ...d.s, today: increment(d.s.today, 'skipped') };
    if (resolution.outcome === 'missed') d.s = { ...d.s, today: increment(d.s.today, 'missed') };
    if (isMissedBreak(resolution)) {
      d.s = { ...d.s, companion: applyMissedBreak(d.s.companion, d.s.config.companion.thresholds) };
    }
  }
}

function recordBreak(d: Draft, record: BreakRecord, at: Instant): void {
  const { s } = d;
  const reminderResult =
    record.kind === 'eyeRest'
      ? applyEyeRest(s.reminders)
      : record.kind === 'short'
        ? applyShortBreak(s.reminders, record.occurrenceId)
        : applyMeaningfulBreak(s.reminders);
  const companion = applyBreak(s.companion, record.kind, s.config.companion.thresholds, at);
  d.s = {
    ...s,
    session: applyBreakToSession(s.session, record.kind),
    reminders: reminderResult.state,
    companion: companion.state,
    today: countBreak(s.today, record.kind),
    welcomeBack: record.kind === 'eyeRest' ? s.welcomeBack : withdrawWelcomeBack(s.welcomeBack),
  };
  applyResolutions(d, reminderResult.resolutions);
  if (companion.recoveryStarted && d.s.config.experience.sounds) d.effects.push({ type: 'playCue', cue: 'recovery' });
}

function applyBreakOutcome(d: Draft, outcome: BreakOutcome | null, at: Instant): void {
  if (outcome?.type === 'recorded') recordBreak(d, outcome.record, at);
}

/** Sets the break state; when a suspending phase ends, presence restarts at `at`. */
function setBreaks(d: Draft, breaks: BreakState, at: Instant): void {
  const wasSuspending = isSuspending(d.s.breaks);
  d.s = { ...d.s, breaks };
  if (wasSuspending && !isSuspending(breaks)) d.s = { ...d.s, accounting: resumeAccounting(d.s.accounting, at) };
}

function startNewSession(d: Draft, at: Instant): void {
  const reminders = resetForNewSession(d.s.reminders);
  d.s = {
    ...d.s,
    session: newSession(at),
    reminders: reminders.state,
    companion: INITIAL_COMPANION,
    breaks: NO_BREAK,
    welcomeBack: { ...NO_WELCOME_BACK, lastOfferedWall: d.s.welcomeBack.lastOfferedWall },
    notice: null,
    today: increment(d.s.today, 'sessions'),
  };
  // Withdrawn occurrences carry no outcome that counts (R4.7).
}

function handleConfig(d: Draft, config: EffectiveConfig): void {
  const reminders = applyReminderConfig(d.s.reminders, config);
  d.s = {
    ...d.s,
    config,
    reminders: reminders.state,
    companion: applyThresholds(d.s.companion, config.companion.thresholds),
  };
  applyResolutions(d, reminders.resolutions);
}

function runAccounting(d: Draft, event: CoreEvent): void {
  if (event.type === 'config' || event.type === 'intent') return;
  const suspended = d.s.pause !== null || isSuspending(d.s.breaks);
  const result = reduceAccounting(d.s.accounting, event, {
    idleMs: d.s.config.experience.idleMinutes * MINUTE_MS,
    suspended,
  });
  d.s = { ...d.s, accounting: result.state };

  if (result.returned !== null) {
    if (startsNewSession(result.returned.wallGapMs)) {
      startNewSession(d, event.at);
    } else if (d.s.breaks.phase === 'none') {
      const id = `wb-${d.s.seq + 1}`;
      const offered = offerWelcomeBack(d.s.welcomeBack, id, result.returned.wallGapMs, event.at);
      if (offered !== d.s.welcomeBack) d.s = { ...d.s, seq: d.s.seq + 1, welcomeBack: offered };
    }
  }

  if (result.creditedMs > 0) {
    d.s = {
      ...d.s,
      session: creditSession(d.s.session, result.creditedMs),
      reminders: accumulate(d.s.reminders, result.creditedMs, d.s.config),
      today: addActive(d.s.today, result.creditedMs),
    };
  }
}

function handleIntent(d: Draft, intent: UserIntent, at: Instant): void {
  const { s } = d;
  switch (intent.kind) {
    case 'reminder.takeBreak': {
      const target = takeBreakTarget(s.reminders, intent.occurrenceId);
      if (target === 'eyeRest') {
        setBreaks(d, startEyeRest(s.breaks, nextId(d, 'eye'), at, intent.occurrenceId).state, at);
      } else if (target === 'break') {
        setBreaks(d, startBreak(s.breaks, nextId(d, 'brk'), at, 'reminder', intent.occurrenceId).state, at);
        d.s = { ...d.s, welcomeBack: withdrawWelcomeBack(d.s.welcomeBack) };
      }
      return;
    }
    case 'reminder.snooze': {
      const live = s.reminders.live;
      if (live?.id !== intent.occurrenceId) return;
      const result = snooze(s.reminders, intent.occurrenceId, s.session.activeMs, s.config);
      const snoozedOut = result.resolutions.length > 0;
      d.s = {
        ...d.s,
        reminders: result.state,
        today: increment(d.s.today, 'snoozed'),
        notice: snoozedOut
          ? {
              kind: 'snoozedOut',
              minutes: Math.min(...live.kinds.map((k) => s.config.reminders[k].minutes)),
              untilMono: at.mono + NOTICE_MS,
            }
          : { kind: 'snoozed', minutes: s.config.reminders.snoozeMinutes, untilMono: at.mono + NOTICE_MS },
      };
      applyResolutions(d, result.resolutions);
      return;
    }
    case 'reminder.skip': {
      const result = skip(s.reminders, intent.occurrenceId);
      if (result.resolutions.length === 0) return;
      d.s = { ...d.s, reminders: result.state, notice: { kind: 'skipped', untilMono: at.mono + NOTICE_MS } };
      applyResolutions(d, result.resolutions);
      return;
    }
    case 'eyeRest.start': {
      const live = s.reminders.live;
      const occurrenceId = live?.kinds.includes('eye') === true ? live.id : null;
      setBreaks(d, startEyeRest(s.breaks, nextId(d, 'eye'), at, occurrenceId).state, at);
      return;
    }
    case 'eyeRest.cancel':
      setBreaks(d, cancelEyeRest(s.breaks).state, at);
      return;
    case 'break.start': {
      const live = s.reminders.live;
      const occurrenceId = live !== null && isBreakReminder(live) ? live.id : null;
      setBreaks(d, startBreak(s.breaks, nextId(d, 'brk'), at, 'command', occurrenceId).state, at);
      d.s = { ...d.s, welcomeBack: withdrawWelcomeBack(d.s.welcomeBack) };
      return;
    }
    case 'break.end':
      setBreaks(d, endBreak(s.breaks, intent.breakId, at).state, at);
      return;
    case 'break.confirm': {
      const result = confirmBreak(s.breaks, intent.breakId, intent.confirmed, intent.atLeastFiveMinutes);
      setBreaks(d, result.state, at);
      applyBreakOutcome(d, result.outcome, at);
      return;
    }
    case 'welcomeBack.answer': {
      const answer = answerWelcomeBack(s.welcomeBack, intent.promptId, intent.tookBreak);
      d.s = { ...d.s, welcomeBack: answer.state };
      if (answer.record !== null) recordBreak(d, answer.record, at);
      return;
    }
    case 'pause.start': {
      if (s.pause !== null) return;
      const until = intent.durationMs === null ? null : Math.max(0, intent.durationMs);
      d.s = {
        ...d.s,
        pause: { untilMono: until === null ? null : at.mono + until, untilWall: until === null ? null : at.wall + until },
      };
      return;
    }
    case 'pause.resume':
      endPause(d, at);
      return;
  }
}

function endPause(d: Draft, at: Instant): void {
  if (d.s.pause === null) return;
  d.s = { ...d.s, pause: null, accounting: resumeAccounting(d.s.accounting, at) };
}

function deliveryContext(s: CoreState, at: Instant): DeliveryContext {
  return {
    at,
    focused: s.accounting.focused,
    paused: s.pause !== null,
    breakActive: s.breaks.phase !== 'none',
    lastHumanOpen: false,
    demoHoldsReal: s.demoHoldsReal,
    focusMode: s.config.experience.focusMode,
    activeMs: s.session.activeMs,
    lastSurfacedActiveMs: s.reminders.lastSurfacedActiveMs,
    lastInteraction: s.accounting.lastInteraction,
  };
}

function runReminders(d: Draft, at: Instant): void {
  const evaluated = evaluate(d.s.reminders, { config: d.s.config, activeMs: d.s.session.activeMs, at });
  d.s = { ...d.s, reminders: evaluated.state };
  applyResolutions(d, evaluated.resolutions);

  const { live } = d.s.reminders;
  if (live === null) return;
  const decision = decideDelivery(live, deliveryContext(d.s, at));
  if (decision === 'wait') return;
  d.s = {
    ...d.s,
    reminders: markDelivered(d.s.reminders, decision === 'surface' ? 'surfaced' : 'subtle', d.s.session.activeMs),
    notice: null,
  };
  if (decision === 'surface') {
    d.s = { ...d.s, today: increment(d.s.today, 'remindersSurfaced') };
    d.effects.push({ type: 'surfaceReminder', occurrence: { id: live.id, kinds: live.kinds } });
    if (d.s.config.experience.sounds) d.effects.push({ type: 'playCue', cue: 'reminder' });
  }
}

export function step(state: CoreState, event: CoreEvent, env: CoreEnv): StepResult {
  const d: Draft = { s: state, effects: [] };
  const { at } = event;

  // A new local day starts fresh aggregates; a wall clock moving back never rolls the day backwards.
  const day = env.localDay(at.wall);
  if (day > d.s.today.day) d.s = { ...d.s, today: rollDay(d.s.today, day) };

  if (event.type === 'config') handleConfig(d, event.config);

  // A timed pause ends on its own (R14.8).
  const pauseEnd = d.s.pause?.untilMono ?? null;
  if (pauseEnd !== null && at.mono >= pauseEnd) endPause(d, at);

  // Time-driven break transitions, then a signal may end a break (R5.2, R5.5).
  const ticked = tickBreaks(d.s.breaks, at);
  setBreaks(d, ticked.state, at);
  applyBreakOutcome(d, ticked.outcome, at);
  if (event.type === 'signal' || (event.type === 'focus' && event.focused)) {
    setBreaks(d, breakSignal(d.s.breaks, at).state, at);
  }

  runAccounting(d, event);
  if (event.type === 'intent') handleIntent(d, event.intent, at);

  runReminders(d, at);

  d.s = {
    ...d.s,
    companion: tickCompanion(d.s.companion, at),
    welcomeBack: tickWelcomeBack(d.s.welcomeBack, at),
    notice: d.s.notice !== null && at.mono >= d.s.notice.untilMono ? null : d.s.notice,
  };
  return { state: d.s, effects: d.effects };
}

/** Earliest monotonic time at which the state could change without a new event (for the runtime timer). */
export function nextDeadline(state: CoreState, at: Instant): number | null {
  const candidates = [
    breakDeadline(state.breaks),
    welcomeBackDeadline(state.welcomeBack),
    companionDeadline(state.companion),
    state.notice?.untilMono ?? null,
    state.pause?.untilMono ?? null,
    deliveryDeadline(state.reminders.live, deliveryContext(state, at)),
  ].filter((value): value is number => value !== null);
  return candidates.length === 0 ? null : Math.min(...candidates);
}
