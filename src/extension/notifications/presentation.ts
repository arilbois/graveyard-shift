import { COPY } from '../../shared/copy';
import { HOUR_MS, MINUTE_MS } from '../../shared/constants';
import type { ReminderKind } from '../../shared/domain';
import type { UserIntent } from '../../shared/intents';
import type { CompanionViewModel } from '../../shared/viewModel';

/**
 * Pure presentation for the non-webview surfaces: toast text and actions, the status bar item and
 * the pause choices (R1.6, R7.4, R17). Kept free of the vscode API so it can be unit-tested.
 */

export interface ToastContent {
  readonly message: string;
  readonly actions: readonly string[];
}

const ACTIONS = COPY.reminder.actions;

export function toastContent(kinds: readonly ReminderKind[]): ToastContent {
  return {
    message: `${COPY.reminder.title(kinds)}. ${COPY.reminder.body(kinds)}`,
    actions: [ACTIONS.takeBreak, ACTIONS.snooze, ACTIONS.skip],
  };
}

/** Maps the chosen toast action to an intent. Closing the toast (undefined) is no response (R7.7). */
export function toastIntent(occurrenceId: string, choice: string | undefined): UserIntent | null {
  switch (choice) {
    case ACTIONS.takeBreak:
      return { kind: 'reminder.takeBreak', occurrenceId };
    case ACTIONS.snooze:
      return { kind: 'reminder.snooze', occurrenceId };
    case ACTIONS.skip:
      return { kind: 'reminder.skip', occurrenceId };
    default:
      return null;
  }
}

export interface StatusBarContent {
  readonly visible: boolean;
  readonly text: string;
  readonly tooltip: string;
  readonly accessibilityLabel: string;
  readonly attention: boolean;
}

function shortMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function statusBarContent(vm: CompanionViewModel): StatusBarContent {
  const tooltip = `${vm.companion.label}. ${vm.stats.text}`;
  if (vm.paused) {
    return { visible: true, text: COPY.statusBar.paused, tooltip: vm.paused.text, accessibilityLabel: vm.paused.text, attention: false };
  }
  if (vm.reminder) {
    return {
      visible: true,
      text: COPY.statusBar.reminder,
      tooltip: `${vm.reminder.title}. ${vm.reminder.body}`,
      accessibilityLabel: `${vm.reminder.title}. ${vm.reminder.body}`,
      attention: true,
    };
  }
  if (!vm.companion.enabled) return { visible: false, text: '', tooltip, accessibilityLabel: tooltip, attention: false };
  const since = shortMinutes(vm.stats.minutesSinceBreak);
  return {
    visible: true,
    text: COPY.statusBar.normal(vm.companion.label, since),
    tooltip,
    accessibilityLabel: COPY.statusBar.accessible(vm.companion.label, vm.stats.minutesSinceBreak),
    attention: false,
  };
}

export interface PauseChoice {
  readonly label: string;
  readonly durationMs: number | null;
}

export const PAUSE_CHOICES: readonly PauseChoice[] = [
  { label: COPY.pause.thirtyMinutes, durationMs: 30 * MINUTE_MS },
  { label: COPY.pause.oneHour, durationMs: HOUR_MS },
  { label: COPY.pause.untilRestart, durationMs: null },
];
