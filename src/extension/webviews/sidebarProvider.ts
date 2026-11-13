import * as vscode from 'vscode';
import { COPY } from '../../shared/copy';
import { buildWebviewHtml } from './html';
import { createNonce } from './nonce';

/** Sidebar companion view. Task 1: static placeholder; the typed bridge arrives in task 8. */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private readonly webviewRoot: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  }

  resolveWebviewView(view: vscode.WebviewView): void {
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
  }
}
