import { beforeEach, describe, expect, it } from 'vitest';
import {
  watchActivity,
  type ActivityApi,
  type ActivityInput,
  type SelectionKindOnly,
  type WindowStateLike,
} from '../../src/extension/activity/signals';
import { COALESCE_MS } from '../../src/shared/constants';

const KINDS = { keyboard: 1, mouse: 2 };
const COMMAND = 3;

class FakeApi implements ActivityApi {
  windowListeners: ((s: WindowStateLike) => void)[] = [];
  selectionListeners: ((e: SelectionKindOnly) => void)[] = [];
  disposed = 0;

  constructor(readonly initialState: WindowStateLike = { focused: true, active: true }) {}

  onDidChangeWindowState(listener: (s: WindowStateLike) => void) {
    this.windowListeners.push(listener);
    return { dispose: () => this.disposed++ };
  }
  onDidChangeTextEditorSelection(listener: (e: SelectionKindOnly) => void) {
    this.selectionListeners.push(listener);
    return { dispose: () => this.disposed++ };
  }
  window(state: WindowStateLike): void {
    this.windowListeners.forEach((l) => {
      l(state);
    });
  }
  /** A realistic event object: lots of fields the adapter must never read. */
  select(kind: number | undefined): void {
    const event = {
      kind,
      textEditor: { document: { uri: 'file:///secret/path.ts', getText: () => 'secret code' } },
      selections: [{ start: 1, end: 2 }],
    };
    this.selectionListeners.forEach((l) => {
      l(event);
    });
  }
}

let api: FakeApi;
let emitted: ActivityInput[];
let mono: number;

beforeEach(() => {
  api = new FakeApi();
  emitted = [];
  mono = 0;
  watchActivity(api, KINDS, (input) => emitted.push(input), () => mono);
});

describe('watchActivity', () => {
  it('turns keyboard and mouse selection changes into signals', () => {
    api.select(KINDS.keyboard);
    mono += COALESCE_MS;
    api.select(KINDS.mouse);
    expect(emitted).toStrictEqual([
      { type: 'signal', source: 'keyboardSelection' },
      { type: 'signal', source: 'mouseSelection' },
    ]);
  });

  it('ignores Command and undefined selection kinds, which agents and formatters produce (R3.2)', () => {
    api.select(COMMAND);
    api.select(undefined);
    expect(emitted).toStrictEqual([]);
  });

  it('coalesces to at most one signal per second (R3.8)', () => {
    api.select(KINDS.keyboard);
    mono += COALESCE_MS - 1;
    api.select(KINDS.keyboard);
    mono += 1;
    api.select(KINDS.keyboard);
    expect(emitted).toHaveLength(2);
  });

  it('reports focus and WindowState.active changes, without duplicates', () => {
    api.window({ focused: true, active: true });
    api.window({ focused: false, active: true });
    api.window({ focused: false, active: false });
    api.window({ focused: true, active: false });
    expect(emitted).toStrictEqual([
      { type: 'focus', focused: false },
      { type: 'windowActive', active: false },
      { type: 'focus', focused: true },
    ]);
  });

  it('works on hosts without WindowState.active (R3.7)', () => {
    const legacy = new FakeApi({ focused: true });
    const out: ActivityInput[] = [];
    watchActivity(legacy, KINDS, (input) => out.push(input), () => 0);
    legacy.window({ focused: false });
    expect(out).toStrictEqual([{ type: 'focus', focused: false }]);
  });

  it('emits only content-free fields, never paths or text (R14.2)', () => {
    api.select(KINDS.keyboard);
    api.window({ focused: false, active: false });
    const allowed = new Set(['type', 'source', 'focused', 'active']);
    for (const input of emitted) {
      for (const key of Object.keys(input)) expect(allowed.has(key)).toBe(true);
      expect(JSON.stringify(input)).not.toMatch(/secret|file:/);
    }
  });

  it('disposes both subscriptions', () => {
    const fresh = new FakeApi();
    watchActivity(fresh, KINDS, () => undefined, () => 0).dispose();
    expect(fresh.disposed).toBe(2);
  });

  it('counts what it emitted by source, for diagnostics', () => {
    const fresh = new FakeApi();
    const watcher = watchActivity(fresh, KINDS, () => undefined, () => 0);
    fresh.select(KINDS.keyboard);
    fresh.window({ focused: false, active: true });
    expect(watcher.emitted).toStrictEqual({ keyboardSelection: 1, focus: 1 });
  });
});
