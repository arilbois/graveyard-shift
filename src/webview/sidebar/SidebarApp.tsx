import type { JSX } from 'react';
import { COPY } from '../../shared/copy';

/** Task 1 placeholder. Replaced by the snapshot-driven sidebar in task 8. */
export function SidebarApp(): JSX.Element {
  return (
    <main className="gs-sidebar" aria-labelledby="gs-title">
      <h1 id="gs-title" className="gs-title">
        {COPY.app.name}
      </h1>
      <p className="gs-status">{COPY.placeholder.awake}</p>
      <p className="gs-note">{COPY.placeholder.note}</p>
    </main>
  );
}
