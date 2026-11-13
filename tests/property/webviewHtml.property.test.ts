import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildWebviewHtml, escapeHtml } from '../../src/extension/webviews/html';

const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA';

describe('buildWebviewHtml (property)', () => {
  it('never lets interpolated values inject markup, whatever they contain', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (title, scriptUri, styleUri) => {
        const html = buildWebviewHtml({ cspSource: 'vscode-resource:', nonce: NONCE, scriptUri, styleUri, title });
        expect(html.match(/<script/g)).toHaveLength(1);
        expect(html.match(/<link/g)).toHaveLength(1);
        expect(html.match(/<title>/g)).toHaveLength(1);
        expect(html).toContain(`<title>${escapeHtml(title)}</title>`);
      }),
    );
  });

  it('escaped output never contains raw markup characters', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(escapeHtml(value)).not.toMatch(/[<>"']/);
      }),
    );
  });
});
