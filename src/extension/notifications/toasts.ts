import * as vscode from 'vscode';
import type { UserIntent } from '../../shared/intents';
import type { OccurrenceView } from '../application/engine';
import { toastContent, toastIntent } from './presentation';

/**
 * Reminder toasts (R7.4, R7.5). Information severity only and never modal, so the IDE's
 * Do Not Disturb mode applies and keyboard focus is not moved. A click on an old toast carries the
 * occurrence id; the core ignores it if that occurrence already has an outcome (R7.8).
 */
export function showReminderToast(occurrence: OccurrenceView, dispatch: (intent: UserIntent) => void): void {
  const { message, actions } = toastContent(occurrence.kinds);
  void vscode.window.showInformationMessage(message, { modal: false }, ...actions).then((choice) => {
    const intent = toastIntent(occurrence.id, choice);
    if (intent !== null) dispatch(intent);
  });
}
