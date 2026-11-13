---
inclusion: always
---
# Architecture and file responsibilities

Suggested target folders (adjust only with documented reason):

- `src/extension/activate.ts`: activation, disposal and command registration only.
- `src/extension/activity/`: focus and editor event adapters; no UI code.
- `src/extension/session/`: monotonic sessions, breaks, idle logic, injected clock.
- `src/extension/reminders/`: reminder rules, queue, snooze, dedup, quiet mode.
- `src/extension/companion/`: deterministic zombie/recovery state machine.
- `src/extension/storage/`: versioned local persistence and migration.
- `src/extension/webviews/`: panel/view creation and typed message bridge.
- `src/shared/`: config schemas, messages and domain types.
- `src/webview/`: components, styles, assets, accessible interactions.
- `assets/sprites/`: original or appropriately licensed pixel-art.
- `tests/unit/`, `tests/property/`, `tests/integration/`.
- `.kiro/steering/`, `.kiro/agents/`, `.kiro/hooks/`, `.kiro/specs/`.

Rules: single responsibility per module; dependency direction UI → typed bridge → application → domain; avoid circular imports; separate pure policy code from VS Code API; don't duplicate business logic across host and webview. No single giant extension.ts or App.tsx. Clear filename and meaningful exported types. No speculative abstractions.
