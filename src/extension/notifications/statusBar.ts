import * as vscode from 'vscode';
import type { CompanionViewModel } from '../../shared/viewModel';
import { COMMANDS } from '../ids';
import { statusBarContent } from './presentation';

/** Status bar item: companion stage and time since a break, or a quiet attention state (R1.6). */
export class StatusBarItem implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem('graveyardShift.status', vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'Graveyard Shift';
    this.item.command = COMMANDS.openCompanion;
  }

  update(vm: CompanionViewModel): void {
    const content = statusBarContent(vm);
    if (!content.visible) {
      this.item.hide();
      return;
    }
    this.item.text = content.text;
    this.item.tooltip = content.tooltip;
    this.item.accessibilityInformation = { label: content.accessibilityLabel, role: 'button' };
    // A theme colour, not a flashing or warning state: attention stays calm.
    this.item.backgroundColor = content.attention
      ? new vscode.ThemeColor('statusBarItem.prominentBackground')
      : undefined;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
