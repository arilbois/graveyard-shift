import * as vscode from 'vscode';
import { SETTINGS_SECTION, validateConfig, type ConfigResult } from '../../shared/config';

/**
 * Reads `graveyardShift.*` user settings through the validator (design §6.4). All settings are
 * application-scoped, so VS Code ignores workspace values (R2.3). Problem warnings arrive in task 11.
 */
export function readSettings(): ConfigResult {
  const configuration = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  return validateConfig((key) => configuration.get<unknown>(key));
}

/** The sidebar mute toggle writes the user-level setting, so it persists and stays in sync (R12.6). */
export function setSoundEnabled(enabled: boolean): Thenable<void> {
  return vscode.workspace
    .getConfiguration(SETTINGS_SECTION)
    .update('experience.sounds', enabled, vscode.ConfigurationTarget.Global);
}

export function onSettingsChanged(listener: (result: ConfigResult) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(SETTINGS_SECTION)) listener(readSettings());
  });
}
