import * as vscode from 'vscode';
import { COMMANDS, VIEW_ID } from './ids';
import { SidebarViewProvider } from './webviews/sidebarProvider';

/**
 * Activation, command registration and disposal only (structure.md).
 * Every disposable is owned by `context.subscriptions`, so VS Code disposes it on deactivate (R18.1).
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, new SidebarViewProvider(context.extensionUri), {
      webviewOptions: { retainContextWhenHidden: false },
    }),
    vscode.commands.registerCommand(COMMANDS.openCompanion, () =>
      vscode.commands.executeCommand(`${VIEW_ID}.focus`),
    ),
  );
}
