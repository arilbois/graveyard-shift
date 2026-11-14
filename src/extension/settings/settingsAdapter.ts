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

export function onSettingsChanged(listener: (result: ConfigResult) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(SETTINGS_SECTION)) listener(readSettings());
  });
}
