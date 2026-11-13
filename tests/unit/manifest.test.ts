import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMANDS, VIEW_CONTAINER_ID, VIEW_ID } from '../../src/extension/ids';

interface Manifest {
  main: string;
  engines: { vscode: string };
  activationEvents: string[];
  contributes: {
    viewsContainers: { activitybar: { id: string }[] };
    views: Record<string, { id: string; type: string }[]>;
    commands: { command: string }[];
  };
}

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as Manifest;

describe('package.json contributions', () => {
  it('declares the activity bar container and webview view used by the code', () => {
    expect(manifest.contributes.viewsContainers.activitybar.map((c) => c.id)).toContain(VIEW_CONTAINER_ID);
    expect(manifest.contributes.views[VIEW_CONTAINER_ID]).toContainEqual(
      expect.objectContaining({ id: VIEW_ID, type: 'webview' }),
    );
  });

  it('declares every registered command', () => {
    const declared = manifest.contributes.commands.map((c) => c.command);
    for (const command of Object.values(COMMANDS)) {
      expect(declared).toContain(command);
    }
  });

  it('activates after startup and targets the bundled entry point', () => {
    expect(manifest.activationEvents).toEqual(['onStartupFinished']);
    expect(manifest.main).toBe('./dist/extension.js');
    expect(manifest.engines.vscode).toBe('^1.90.0');
  });
});
