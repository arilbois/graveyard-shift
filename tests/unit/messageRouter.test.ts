import { describe, expect, it } from 'vitest';
import type { RuntimeInput } from '../../src/extension/application/runtime';
import { createMessageRouter } from '../../src/extension/webviews/messageRouter';
import { COALESCE_MS } from '../../src/shared/constants';

function setup() {
  const dispatched: RuntimeInput[] = [];
  const sound: boolean[] = [];
  let mono = 0;
  const route = createMessageRouter({
    dispatch: (input) => dispatched.push(input),
    setSoundEnabled: (enabled) => sound.push(enabled),
    monoNow: () => mono,
  });
  return { route, dispatched, sound, advance: (ms: number) => (mono += ms) };
}

describe('createMessageRouter', () => {
  it('forwards intents to the runtime unchanged', () => {
    const { route, dispatched } = setup();
    route({ v: 1, type: 'intent', intent: { kind: 'reminder.snooze', occurrenceId: 'occ-1' } });
    expect(dispatched).toStrictEqual([{ type: 'intent', intent: { kind: 'reminder.snooze', occurrenceId: 'occ-1' } }]);
  });

  it('turns webview interaction into a coalesced activity signal', () => {
    const { route, dispatched, advance } = setup();
    route({ v: 1, type: 'ui/interaction' });
    advance(COALESCE_MS - 1);
    route({ v: 1, type: 'ui/interaction' });
    advance(1);
    route({ v: 1, type: 'ui/interaction' });
    expect(dispatched).toStrictEqual([
      { type: 'signal', source: 'webview' },
      { type: 'signal', source: 'webview' },
    ]);
  });

  it('writes the sound setting instead of touching core state', () => {
    const { route, dispatched, sound } = setup();
    route({ v: 1, type: 'sound/setEnabled', enabled: false });
    expect(sound).toStrictEqual([false]);
    expect(dispatched).toStrictEqual([]);
  });
});
