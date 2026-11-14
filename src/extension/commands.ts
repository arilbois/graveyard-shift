import * as vscode from 'vscode';
import { COPY } from '../shared/copy';
import type { UserIntent } from '../shared/intents';
import { COMMANDS, VIEW_ID } from './ids';
import { PAUSE_CHOICES } from './notifications/presentation';

/** Command palette entries (R17). None of these is modal; destructive commands arrive in task 11. */
export function registerCommands(dispatch: (intent: UserIntent) => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.openCompanion, () => vscode.commands.executeCommand(`${VIEW_ID}.focus`)),
    vscode.commands.registerCommand(COMMANDS.takeBreak, () => {
      dispatch({ kind: 'break.start' });
    }),
    vscode.commands.registerCommand(COMMANDS.startEyeRest, () => {
      dispatch({ kind: 'eyeRest.start' });
    }),
    vscode.commands.registerCommand(COMMANDS.pause, async () => {
      const choice = await vscode.window.showQuickPick(
        PAUSE_CHOICES.map((c) => ({ label: c.label, durationMs: c.durationMs })),
        { placeHolder: COPY.pause.placeholder },
      );
      if (choice) dispatch({ kind: 'pause.start', durationMs: choice.durationMs });
    }),
    vscode.commands.registerCommand(COMMANDS.resume, () => {
      dispatch({ kind: 'pause.resume' });
    }),
  ];
}
