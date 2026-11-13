# Implementation Plan — Graveyard Shift

> Status: **DRAFT — do not start until requirements.md and design.md are approved.**
> Rules for every task: implement only that task; run `npm run verify` (after task 1 creates it); add a **Verification note** (what ran, passed, failed, still manual) under the task; stop for review. Never push, publish or change the licence without approval.

The first vertical slice is Milestones A–B (tasks 1–9). It delivers real activity → eye/movement/hydration reminders → take a break / snooze / skip → companion reacts → confirmed recovery, visible in the Kiro sidebar. Later milestones add durability, the signature visuals, and polish.

---

## Milestone A — Skeleton that installs in Kiro

- [ ] 1. Scaffold the extension, toolchain and verify script
  - Create `package.json` (name `graveyard-shift`, `activationEvents: onStartupFinished`, Activity Bar container + `graveyardShift.companion` webview view, `graveyardShift.openCompanion` command), `.gitignore` (`node_modules`, `dist`, `*.vsix`, `.DS_Store`, `.vscode-test`), `.vscodeignore`.
  - TypeScript configs for host (Node, CJS bundle via esbuild) and webview (DOM, Vite + React, fixed output names in `dist/webview/`).
  - ESLint flat config with `typescript-eslint`, `react-hooks`, and `no-restricted-imports` boundaries: domain folders cannot import `vscode` or `src/webview/**`; webview cannot import `src/extension/**`; no module may import `http`, `https`, `net`, `tls` or `undici`, and `fetch`/`XMLHttpRequest`/`WebSocket` are banned globals (R14.1).
  - Vitest config with `unit`, `property` and `webview` projects; one smoke test.
  - Scripts: `build`, `build:host`, `build:webview`, `typecheck`, `lint`, `test`, `verify` (= typecheck && lint && test), `package` (vsce).
  - `src/extension/activate.ts` registers the view provider with a static, CSP-compliant placeholder ("Graveyard Shift is awake"), using the nonce and `asWebviewUri` pattern from design §7.1, plus a disposal registry.
  - Read Kiro's Help → About for the Code OSS version and set `engines.vscode` accordingly. Record it in the verification note.
  - Confirm the `.kiro/hooks/verify-after-task.json` hook runs after a task. If Kiro does not recognise `PostTaskExecution`, propose the fix and ask before editing.
  - **Verify:** `npm run verify` passes; `npm run package` makes a VSIX; manually install it in Kiro, open the sidebar, reload the window, and check for no errors in the extension host log.
  - _Requirements: 1.1, 1.2, 14.1, 15.1, 15.2, 18.1, 20.1, 20.2, 20.4_

- [ ] 2. Shared config, constants and settings contribution
  - `src/shared/config.ts`: `EffectiveConfig`, `DEFAULTS`, `validateConfig(raw) → { config, problems }` with type fallback and range clamping.
  - `src/shared/constants.ts`: every constant from design §13.
  - `package.json` `contributes.configuration` for R2.1–R2.2 (`scope: application`, min/max, enum, descriptions).
  - Tests: `DEFAULTS` deep-equals `config/defaults.json`; package.json contributed defaults equal `DEFAULTS`; clamping and type fallback; fast-check property that validated output is always in range.
  - **Verify:** `npm run verify`; manually open Settings in Kiro and search "Graveyard Shift".
  - _Requirements: 2.1, 2.2, 2.3, 2.6, 20.3_

## Milestone B — Vertical slice: reminders end to end (in memory)

- [ ] 3. Time model and activity accounting (pure)
  - `src/shared/time.ts` (`Instant`, `Clock`), `tests/support/fakeClock.ts` with independent `mono` and `wall` advance.
  - `src/extension/session/accounting.ts` implementing design §4.3: signal crediting, idle boundary, focus loss, heartbeat while focused and active, clock-consistency check, pause.
  - Unit tests for each R3 and R4 case listed in design §12. Property tests for invariants 1 and 2.
  - _Requirements: 3.3–3.6, 3.9, 4.1–4.4, 4.8, 14.8_

- [ ] 4. Breaks and welcome-back prompts (pure)
  - `src/extension/session/breaks.ts` implementing design §4.5: eye rest, on-break, awaiting confirmation (with timeout), welcome-back with rate limit, untrusted-gap handling, Meaningful vs short break effects.
  - `src/extension/session/lifecycle.ts`: in-process 6 h gap → new Session (restart handling waits for task 10).
  - Unit tests for each transition and boundary (4:59 vs 5:00 break; welcome-back at 30 min rate). Property test for invariant 4.
  - _Requirements: 4.7, 5.1–5.9_

- [ ] 5. Reminder scheduler and delivery policy (pure)
  - `src/extension/reminders/scheduler.ts`: accumulators, occurrence creation, combining, snooze ×3 → missed, 15-minute missed, skip, withdraw on disable, interval-change handling, deterministic ids.
  - `src/extension/reminders/delivery.ts`: `canSurface` from design §4.6 (focus, pause, break, spacing, focus-mode deferral with 2-minute cap).
  - Unit tests for each R6, R7 and R8 rule. Property tests for invariants 3, 7 and 8.
  - _Requirements: 2.5, 2.7, 6.1–6.7, 7.2, 7.3, 7.5, 7.7, 7.8, 8.2–8.5_

- [ ] 6. Companion state machine and root engine (pure)
  - `src/extension/companion/stage.ts`: score table, one-step escalation, Recovery with deadline, settle rules.
  - `src/extension/application/engine.ts`: `CoreState`, `CoreEvent`, `Effect`, `step()` composing tasks 3–5 and this task in the fixed order; `nextDeadline(state)`.
  - `src/extension/application/selectors.ts`: `selectViewModel()`; `src/shared/copy.ts` with first-draft strings (R19).
  - Unit tests for R10. Property tests for invariants 5 and 7 over the whole engine.
  - _Requirements: 8.6, 10.1–10.9, 19.1–19.4_

- [ ] 7. Runtime and IDE activity adapter
  - `src/extension/application/runtime.ts`: tick + one-shot deadline timer, `EffectSink` interface, view-model change detection, error isolation.
  - `src/extension/activity/signals.ts`: mapping table from design §6.2, 1 s coalescer, `WindowState.active` feature detection; unit test that emitted events carry no content fields.
  - Wire into `activate.ts` with in-memory state only (no persistence yet).
  - **Manual (record in note):** measure when `WindowState.active` turns false in Kiro; let a Kiro agent edit a file while hands-off and confirm no `keyboard`/`mouse` signals are produced (temporary debug counter in the output channel, removed before commit).
  - _Requirements: 1.3, 3.1, 3.2, 3.7, 3.8, 14.2, 14.7, 18.2, 18.4_

- [ ] 8. Typed bridge and sidebar UI v1
  - `src/shared/messages.ts` validators + tests (extra keys, bad literals, long ids, wrong version).
  - `src/extension/webviews/sidebarProvider.ts` + `html.ts` (CSP from design §7.1); snapshot on `ready` and on change.
  - `src/webview/bridge.ts`, `src/webview/sidebar/*`: scene with a **static placeholder sprite per stage**, stage label + line, reminder card, eye-rest countdown, break panel, confirm-break, welcome-back, stats line, sound toggle (writes setting), live region. No animation yet; `.motion-reduced` class plumbing in place.
  - Webview tests: accessible names, keyboard activation, live-region text, correct intent ids.
  - **Manual:** sidebar at 240/320/400 px, keyboard-only pass.
  - _Requirements: 1.1, 1.4, 1.5, 3.10, 5.2, 5.4, 5.5, 5.8, 7.1, 12.6, 13.1–13.3, 13.5, 13.9, 15.1–15.6_

- [ ] 9. Notifications, status bar and core commands
  - `src/extension/notifications/toasts.ts` (non-modal, stale-id safe, closed = no response) and `statusBar.ts`.
  - Commands: Open Companion, Take a Break, Start Eye Rest, Pause (quick pick), Resume.
  - **Manual end-to-end in Kiro (lower intervals in user settings, e.g. eye = 5 min):** a reminder appears in the sidebar and as a toast, deferred while typing; snooze, skip and take a break each behave as specified; companion reaches Tired after skips and shows Recovery after a confirmed break.
  - _Requirements: 1.6, 7.4, 7.6, 8.1, 14.8, 17.1, 17.2_

> **⏸ Review checkpoint — vertical slice.** Demo the slice in Kiro and review the copy and the constants (D4) before continuing.

## Milestone C — Durability and privacy controls

- [ ] 10. Versioned storage, restart handling and multi-window ownership
  - `src/extension/storage/schema.ts` (v1), `migrate.ts`, `stateStore.ts` (globalState + `MemoryStore`), debounced and immediate writes.
  - `restored` event handling per design §4.4; focused-window ownership per §8 (D8).
  - Tests: migration fixtures, corrupt data, restart gap boundaries, no persistence of forbidden fields (schema snapshot).
  - **Manual:** reload window mid-session; quit and reopen Kiro; sleep/wake the machine; two windows open.
  - _Requirements: 4.5–4.7, 14.3, 14.4, 18.3_

- [ ] 11. Settings live-reload, reset settings, clear data
  - Settings adapter with one warning per invalid setting per Session; `config` events applied without resets.
  - Commands Reset Settings to Defaults and Clear Local Data (modal confirmations).
  - Tests for interval change behaviour and disable-withdraws; integration test that commands are registered.
  - _Requirements: 2.4–2.9, 14.5, 17.3_

- [ ] 12. Human Check-in
  - Check-in prompt rules in the engine, memory-only answers, opt-in local saving, Check In command.
  - Tests: spacing, `humanCheckIn=false`, no score or timing change, saved only when opted in, cleared by Clear Local Data.
  - _Requirements: 9.1–9.6_

## Milestone D — Signature experience

- [ ] 13. Pixel-art sprite pipeline and original companion set
  - `scripts/build-sprites.mjs` (grid text → PNG, Node `zlib` only), `assets/sprites/src/*.grid.txt`, `manifest.json`, `CompanionSprite` component with integer scaling, CSS `steps()` animation, static frames under reduced motion, pause when hidden.
  - Five coherent stages with idle/breath/eye frames; `ASSETS.md` entries.
  - Webview tests for reduced-motion class from setting and from the OS media query.
  - **Manual:** screenshots of every stage at 240 and 400 px, dark/light/HC; experience-reviewer agent review (read-only).
  - _Requirements: 12.1–12.3, 13.6, 13.7, 18.5, 20.5_

- [ ] 14. Gentle sound cue
  - `src/webview/sound/cue.ts` (Web Audio, envelope from design §7.6), `cue` message, volume setting, resume-on-first-interaction, silent fallback.
  - Tests with a mocked `AudioContext`: gain never exceeds `volume × 0.5`, no cue for check-ins or prompts, none when disabled.
  - **Manual:** cue level at 30 % with OS volume normal; behaviour with OS muted; autoplay behaviour in Kiro recorded.
  - _Requirements: 12.4, 12.5, 12.7, 12.8_

- [ ] 15. The Last Human panel
  - Long-session policy in the engine (design §4.8); `lastHumanPanel.ts` (Beside, `preserveFocus`, single instance, dispose = dismiss); panel UI with scene, copy, four actions, Escape, initial focus; sidebar and notification fallbacks for `sidebar`, `off` and companion disabled; Preview command.
  - Tests: threshold, cooldowns, not-again, eye rest does not reset, preview has no effect; property invariant 6.
  - **Manual:** panel never steals typing focus; editing and saving keep working with it open.
  - _Requirements: 2.8, 11.1–11.11, 13.8_

- [ ] 16. Demo simulation
  - `src/extension/demo/`: `SimulatedClock`, script, `DemoEffectSink`, `MemoryStore`; Start/Stop commands; DEMO badge in both webviews; real reminders held during the demo.
  - Tests: property invariant 9 (real store untouched); demo reaches The Last Human within 120 simulated-real seconds; restart never resumes a demo.
  - **Manual:** full run-through timed with a stopwatch.
  - _Requirements: 16.1–16.6_

## Milestone E — Quality and submission readiness

- [ ] 17. Integration and lifecycle tests
  - `@vscode/test-cli` setup; tests for activation, views, commands, configuration defaults, and disposal (no live timers or subscriptions after deactivate).
  - _Requirements: 18.1, 18.2_

- [ ] 18. Accessibility, theme and copy audit
  - Run the experience-reviewer agent (read-only) over code and screenshots; fix findings rated medium or higher; VoiceOver pass; contrast checks for any new colours; copy review against R19.
  - _Requirements: 13.1–13.10, 19.1–19.3_

- [ ] 19. Packaging, docs and licence
  - README (what it is and is not, privacy statement, install from VSIX, build and test steps, known limitations from design §14), LICENSE (per D6, with your approval), `ASSETS.md`, `docs/manual-checks.md` filled in from real runs.
  - Clean-install test of the VSIX in Kiro.
  - _Requirements: 14.1, 14.6, 20.4–20.6_
