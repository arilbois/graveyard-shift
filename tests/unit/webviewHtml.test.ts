import { describe, expect, it } from 'vitest';
import {
  buildContentSecurityPolicy,
  buildWebviewHtml,
  escapeHtml,
  isValidNonce,
} from '../../src/extension/webviews/html';
import { createNonce } from '../../src/extension/webviews/nonce';

const CSP_SOURCE = 'https://file+.vscode-resource.vscode-cdn.net';
const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA';

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split(';').map((part) => {
      const [name = '', ...values] = part.trim().split(/\s+/);
      return [name, values.join(' ')];
    }),
  );
}

describe('buildContentSecurityPolicy', () => {
  it('denies everything by default and allows only nonce scripts and own-origin resources', () => {
    const policy = directives(buildContentSecurityPolicy(CSP_SOURCE, NONCE));
    expect(policy.get('default-src')).toBe("'none'");
    expect(policy.get('script-src')).toBe(`'nonce-${NONCE}' ${CSP_SOURCE}`);
    expect(policy.get('style-src')).toBe(CSP_SOURCE);
    expect(policy.get('img-src')).toBe(CSP_SOURCE);
    expect(policy.get('font-src')).toBe(CSP_SOURCE);
  });

  it('never allows network connections, inline code or eval', () => {
    const policy = buildContentSecurityPolicy(CSP_SOURCE, NONCE);
    expect(policy).not.toContain('connect-src');
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  });

  it('rejects nonces that could break out of the directive', () => {
    expect(() => buildContentSecurityPolicy(CSP_SOURCE, "abc' 'unsafe-inline")).toThrow();
    expect(() => buildContentSecurityPolicy(CSP_SOURCE, 'short')).toThrow();
  });
});

describe('buildWebviewHtml', () => {
  const html = buildWebviewHtml({
    cspSource: CSP_SOURCE,
    nonce: NONCE,
    scriptUri: `${CSP_SOURCE}/dist/webview/sidebar.js`,
    styleUri: `${CSP_SOURCE}/dist/webview/sidebar.css`,
    title: 'Graveyard Shift',
  });

  it('loads exactly one script, as a module carrying the nonce', () => {
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain(`<script type="module" nonce="${NONCE}" src="${CSP_SOURCE}/dist/webview/sidebar.js">`);
  });

  it('puts the policy in a meta tag before any resource is loaded', () => {
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<link'));
  });

  it('has no inline styles or event handlers', () => {
    expect(html).not.toMatch(/<style|style=|\son[a-z]+=/i);
  });
});

describe('escapeHtml', () => {
  it('escapes markup and quote characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('createNonce', () => {
  it('produces a 22-character base64url nonce that the CSP builder accepts', () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(isValidNonce(nonce)).toBe(true);
  });

  it('differs between loads', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
