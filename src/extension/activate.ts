import { performance } from 'node:perf_hooks';
import * as vscode from 'vscode';
import { watchActivity } from './activity/signals';
import { Runtime, systemTimers, type EffectSink } from './application/runtime';
import { COMMANDS, VIEW_ID } from './ids';
import { onSettingsChanged, readSettings, setSoundEnabled } from './settings/settingsAdapter';
import { localDay, systemClock } from './systemClock';
import { createMessageRouter } from './webviews/messageRouter';
import { SidebarViewProvider } from './webviews/sidebarProvider';

/**
 * Activation, wiring and command registration only (structure.md). Every disposable is owned by
 * `context.subscriptions`, so VS Code disposes it on deactivate (R18.1).
 */
export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Graveyard Shift', { log: true });
  context.subscriptions.push(log);

  // Late-bound: the runtime needs the sink and the sink needs the provider.
  let sidebar: SidebarViewProvider | null = null;

  // Toasts arrive in task 9; cues are forwarded to the sidebar, which stays silent until task 14.
  const effects: EffectSink = {
    apply: (effect) => {
      if (effect.type === 'playCue') sidebar?.postCue(effect.cue);
    },
  };

  const runtime = new Runtime({
    clock: systemClock,
    env: { localDay },
    config: readSettings().config,
    focused: vscode.window.state.focused,
    // `active` exists from VS Code 1.89; older hosts report undefined at runtime (R3.7).
    windowActive: (vscode.window.state as { readonly active?: boolean }).active === true,
    timers: systemTimers,
    effects,
    log: {
      error: (message) => {
        log.error(message);
      },
    },
    onViewModel: (viewModel) => {
      sidebar?.postSnapshot(viewModel);
    },
  });

  const route = createMessageRouter({
    dispatch: (input) => {
      runtime.dispatch(input);
    },
    setSoundEnabled: (enabled) => {
      setSoundEnabled(enabled).then(undefined, () => {
        log.error('Could not update the sound setting.');
      });
    },
    monoNow: () => performance.now(),
  });

  sidebar = new SidebarViewProvider(context.extensionUri, {
    viewModel: () => runtime.viewModel,
    onMessage: route,
    logDropped: (type) => {
      log.warn(`Dropped invalid webview message (type: ${type}).`);
    },
  });

  const activity = watchActivity(
    {
      initialState: vscode.window.state,
      onDidChangeWindowState: vscode.window.onDidChangeWindowState,
      onDidChangeTextEditorSelection: vscode.window.onDidChangeTextEditorSelection,
    },
    { keyboard: vscode.TextEditorSelectionChangeKind.Keyboard, mouse: vscode.TextEditorSelectionChangeKind.Mouse },
    (input) => {
      runtime.dispatch(input);
    },
    () => performance.now(),
  );

  context.subscriptions.push(
    {
      dispose: () => {
        runtime.dispose();
      },
    },
    activity,
    sidebar,
    onSettingsChanged(({ config }) => {
      runtime.dispatch({ type: 'config', config });
    }),
    vscode.window.registerWebviewViewProvider(VIEW_ID, sidebar, {
      webviewOptions: { retainContextWhenHidden: false },
    }),
    vscode.commands.registerCommand(COMMANDS.openCompanion, () =>
      vscode.commands.executeCommand(`${VIEW_ID}.focus`),
    ),
  );

  runtime.start();
  log.info('Graveyard Shift activated. Activity is estimated locally from content-free IDE signals.');
}
