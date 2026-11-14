import * as vscode from 'vscode';
import { COPY } from '../../shared/copy';
import {
  messageTypeForLog,
  parseWebviewMessage,
  type Cue,
  type HostToWebview,
  type WebviewToHost,
} from '../../shared/messages';
import type { CompanionViewModel } from '../../shared/viewModel';
import { buildWebviewHtml } from './html';
import { createNonce } from './nonce';

/**
 * Sidebar companion view and the host side of the typed bridge (design §7, R15). Every incoming
 * message is validated; invalid ones are dropped and logged by type only. The view renders host
 * snapshots and never owns timing (R15.4).
 */

export interface SidebarHost {
  /** Latest view model; sent whenever the webview (re)loads or becomes visible (R1.4). */
  viewModel(): CompanionViewModel;
  onMessage(message: Exclude<WebviewToHost, { type: 'ready' }>): void;
  logDropped(type: string): void;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly webviewRoot: vscode.Uri;
  private view: vscode.WebviewView | null = null;
  private ready = false;
  private viewDisposables: vscode.Disposable[] = [];

  constructor(
    extensionUri: vscode.Uri,
    private readonly host: SidebarHost,
  ) {
    this.webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.disposeView();
    this.view = view;
    this.ready = false;
    const { webview } = view;
    webview.options = {
      enableScripts: true,
      enableCommandUris: false,
      localResourceRoots: [this.webviewRoot],
    };
    webview.html = buildWebviewHtml({
      cspSource: webview.cspSource,
      nonce: createNonce(),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(this.webviewRoot, 'sidebar.js')).toString(),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(this.webviewRoot, 'sidebar.css')).toString(),
      title: COPY.app.name,
    });

    this.viewDisposables.push(
      webview.onDidReceiveMessage((raw: unknown) => {
        this.receive(raw);
      }),
      view.onDidChangeVisibility(() => {
        if (view.visible) this.postSnapshot(this.host.viewModel());
      }),
      view.onDidDispose(() => {
        this.disposeView();
      }),
    );
  }

  /** Pushes a snapshot if the view is loaded and visible; hidden views catch up when shown. */
  postSnapshot(viewModel: CompanionViewModel): void {
    this.post({ v: 1, type: 'snapshot', viewModel });
  }

  postCue(cue: Cue): void {
    this.post({ v: 1, type: 'cue', cue });
  }

  get isVisible(): boolean {
    return this.view?.visible === true && this.ready;
  }

  dispose(): void {
    this.disposeView();
  }

  private receive(raw: unknown): void {
    const message = parseWebviewMessage(raw);
    if (message === null) {
      this.host.logDropped(messageTypeForLog(raw));
      return;
    }
    if (message.type === 'ready') {
      this.ready = true;
      this.postSnapshot(this.host.viewModel());
      return;
    }
    this.host.onMessage(message);
  }

  private post(message: HostToWebview): void {
    const { view } = this;
    if (view === null || !view.visible || !this.ready) return;
    void view.webview.postMessage(message);
  }

  private disposeView(): void {
    for (const disposable of this.viewDisposables) disposable.dispose();
    this.viewDisposables = [];
    this.view = null;
    this.ready = false;
  }
}
