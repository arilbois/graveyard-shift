/**
 * Pure HTML and Content-Security-Policy builder for every Graveyard Shift webview (R15.1, design §7.1).
 * Kept free of the vscode API so the policy can be unit-tested.
 */

export interface WebviewHtmlParts {
  /** `webview.cspSource` for the webview being rendered. */
  readonly cspSource: string;
  /** Per-load nonce from `createNonce()`. */
  readonly nonce: string;
  /** `asWebviewUri` of the entry script. */
  readonly scriptUri: string;
  /** `asWebviewUri` of the entry stylesheet. */
  readonly styleUri: string;
  readonly title: string;
}

/** Characters allowed in a CSP nonce (base64 / base64url, no padding needed). */
const NONCE_PATTERN = /^[A-Za-z0-9+/_-]{16,}={0,2}$/;

export function isValidNonce(nonce: string): boolean {
  return NONCE_PATTERN.test(nonce);
}

export function buildContentSecurityPolicy(cspSource: string, nonce: string): string {
  if (!isValidNonce(nonce)) {
    throw new Error('Invalid CSP nonce.');
  }
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `style-src ${cspSource}`,
    `img-src ${cspSource}`,
    `font-src ${cspSource}`,
  ].join('; ');
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function buildWebviewHtml(parts: WebviewHtmlParts): string {
  const csp = escapeHtml(buildContentSecurityPolicy(parts.cspSource, parts.nonce));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${escapeHtml(parts.styleUri)}">
<title>${escapeHtml(parts.title)}</title>
</head>
<body>
<div id="root"></div>
<script type="module" nonce="${escapeHtml(parts.nonce)}" src="${escapeHtml(parts.scriptUri)}"></script>
</body>
</html>
`;
}
