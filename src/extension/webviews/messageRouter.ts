import { COALESCE_MS } from '../../shared/constants';
import type { WebviewToHost } from '../../shared/messages';
import type { RuntimeInput } from '../application/runtime';

/**
 * Routes validated webview messages to the runtime (R15.4). Clicks and key presses inside a
 * Graveyard Shift webview count as Activity Signals (R3.1), coalesced to one per second.
 */
export interface RouterDeps {
  dispatch(input: RuntimeInput): void;
  setSoundEnabled(enabled: boolean): void;
  monoNow(): number;
}

export function createMessageRouter(deps: RouterDeps): (message: Exclude<WebviewToHost, { type: 'ready' }>) => void {
  let lastInteraction = Number.NEGATIVE_INFINITY;
  return (message) => {
    switch (message.type) {
      case 'intent':
        deps.dispatch({ type: 'intent', intent: message.intent });
        return;
      case 'ui/interaction': {
        const now = deps.monoNow();
        if (now - lastInteraction < COALESCE_MS) return;
        lastInteraction = now;
        deps.dispatch({ type: 'signal', source: 'webview' });
        return;
      }
      case 'sound/setEnabled':
        deps.setSoundEnabled(message.enabled);
        return;
    }
  };
}
