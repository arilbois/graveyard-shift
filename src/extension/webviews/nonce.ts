import { randomBytes } from 'node:crypto';

/** 16 random bytes as base64url (22 characters), created per webview HTML load. */
export function createNonce(): string {
  return randomBytes(16).toString('base64url');
}
