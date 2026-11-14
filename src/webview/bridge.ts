import { useEffect, useState } from 'react';
import { parseHostMessage, type Cue, type WebviewSurface, type WebviewToHost } from '../shared/messages';
import type { CompanionViewModel } from '../shared/viewModel';

/**
 * Typed wrapper around the webview messaging API (design §7.2). Every incoming message is
 * validated with the shared protocol module; anything invalid is ignored.
 */

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export type Send = (message: WebviewToHost) => void;

export interface Bridge {
  readonly send: Send;
  /** Subscribes to validated host messages; returns an unsubscribe function. */
  listen(onSnapshot: (vm: CompanionViewModel) => void, onCue: (cue: Cue) => void): () => void;
}

export function createBridge(api: VsCodeApi, target: Window): Bridge {
  return {
    send: (message) => {
      api.postMessage(message);
    },
    listen(onSnapshot, onCue) {
      const handler = (event: MessageEvent<unknown>): void => {
        const message = parseHostMessage(event.data);
        if (message?.type === 'snapshot') onSnapshot(message.viewModel);
        else if (message?.type === 'cue') onCue(message.cue);
      };
      target.addEventListener('message', handler);
      return () => {
        target.removeEventListener('message', handler);
      };
    },
  };
}

export function connectVsCode(): Bridge {
  return createBridge(acquireVsCodeApi(), window);
}

/**
 * Holds the latest snapshot, announces readiness, and reports clicks and key presses in the view
 * as content-free interaction signals (R3.1).
 */
export function useBridge(bridge: Bridge, surface: WebviewSurface): CompanionViewModel | null {
  const [viewModel, setViewModel] = useState<CompanionViewModel | null>(null);

  useEffect(() => {
    const stop = bridge.listen(setViewModel, () => undefined);
    const interact = (): void => {
      bridge.send({ v: 1, type: 'ui/interaction' });
    };
    window.addEventListener('pointerdown', interact);
    window.addEventListener('keydown', interact);
    bridge.send({ v: 1, type: 'ready', surface });
    return () => {
      stop();
      window.removeEventListener('pointerdown', interact);
      window.removeEventListener('keydown', interact);
    };
  }, [bridge, surface]);

  return viewModel;
}
