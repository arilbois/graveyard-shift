import { COALESCE_MS } from '../../shared/constants';
import type { RuntimeInput } from '../application/runtime';

/**
 * IDE events → content-free Activity Signals (design §6.2, R3.1, R3.2, R14.2).
 *
 * Only window focus, `WindowState.active`, and keyboard- or mouse-driven selection changes are
 * observed. Document changes, saves, file events, active-editor and visible-range changes are never
 * subscribed to, and selection changes of kind Command or undefined are dropped, because agents,
 * formatters and other extensions produce them. Listeners read only the fields typed below; the
 * editor, document and selection contents are never touched.
 *
 * Written against a minimal structural API so it can be tested without VS Code.
 */

export interface DisposableLike {
  dispose(): unknown;
}

export interface WindowStateLike {
  readonly focused: boolean;
  /** Added in VS Code 1.89; checked at runtime (R3.7). */
  readonly active?: boolean;
}

/** The only selection-event field this module reads. */
export interface SelectionKindOnly {
  readonly kind?: number | undefined;
}

export interface ActivityApi {
  readonly initialState: WindowStateLike;
  onDidChangeWindowState(listener: (state: WindowStateLike) => void): DisposableLike;
  onDidChangeTextEditorSelection(listener: (event: SelectionKindOnly) => void): DisposableLike;
}

/** Numeric values of `vscode.TextEditorSelectionChangeKind`, injected by the caller. */
export interface SelectionKinds {
  readonly keyboard: number;
  readonly mouse: number;
}

export type ActivityInput = Extract<RuntimeInput, { type: 'signal' | 'focus' | 'windowActive' }>;

export interface ActivityWatcher extends DisposableLike {
  /** Counts of what was emitted, for diagnostics. Sources only, never content. */
  readonly emitted: Readonly<Record<string, number>>;
}

export function watchActivity(
  api: ActivityApi,
  kinds: SelectionKinds,
  emit: (input: ActivityInput) => void,
  monoNow: () => number,
): ActivityWatcher {
  let focused = api.initialState.focused;
  let active = typeof api.initialState.active === 'boolean' ? api.initialState.active : null;
  let lastSignalMono = Number.NEGATIVE_INFINITY;
  const emitted: Record<string, number> = {};

  const send = (input: ActivityInput): void => {
    const key = input.type === 'signal' ? input.source : input.type;
    emitted[key] = (emitted[key] ?? 0) + 1;
    emit(input);
  };

  const windowSub = api.onDidChangeWindowState((state) => {
    if (state.focused !== focused) {
      focused = state.focused;
      send({ type: 'focus', focused });
    }
    if (typeof state.active === 'boolean' && state.active !== active) {
      active = state.active;
      send({ type: 'windowActive', active });
    }
  });

  const selectionSub = api.onDidChangeTextEditorSelection((event) => {
    const source =
      event.kind === kinds.keyboard ? 'keyboardSelection' : event.kind === kinds.mouse ? 'mouseSelection' : null;
    if (source === null) return;
    const now = monoNow();
    if (now - lastSignalMono < COALESCE_MS) return;
    lastSignalMono = now;
    send({ type: 'signal', source });
  });

  return {
    emitted,
    dispose(): void {
      windowSub.dispose();
      selectionSub.dispose();
    },
  };
}
