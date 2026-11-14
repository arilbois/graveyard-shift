import type { JSX } from 'react';

/** One polite live region per view; new content is announced without moving focus (R13.3). */
export function LiveRegion({ message }: { readonly message: string }): JSX.Element {
  return (
    <div className="gs-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
