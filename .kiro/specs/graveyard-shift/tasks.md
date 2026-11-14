# Implementation Plan — Graveyard Shift

> Status: **APPROVED** · Spec decisions D1–D8 applied.
>
> Rules for every task:
> - Implement only that task, on its own branch, following `.kiro/steering/git-workflow.md`.
> - Run `npm run verify`.
> - Add a **Verification note** under the task: what ran, what passed, what failed, what is still manual.
> - Merge into `develop` (`--no-ff`) only when verified.
> - Never push, publish or touch `main` without approval.
> - **Stop at the review checkpoint after task 9.**

The first vertical slice is Milestones A–B (tasks 1–9). It delivers estimated IDE activity → eye/movement/hydration reminders → take a break / snooze / skip → companion reacts → confirmed recovery, visible in the Kiro sidebar. Later milestones add durability, the signature visuals (including The Last Human), and polish.

---

## Milestone 0 — Repository and spec baseline

- [x] 0. Initialise Git, record the spec, fix the verify hook
  - Initial commit of the starter kit on `main`; `develop` created from it.
  - Spec draft committed, then review decisions D1–D8 applied.
  - `.kiro/steering/git-workflow.md` added.
  - `.kiro/hooks/verify-after-task.json` trigger changed from `PostTaskExecution` to `PostTaskExec`; JSON validated.
  - _Requirements: 20.7_

## Milestone A — Skeleton that installs in Kiro

- [x] 1. Scaffold the extension, toolchain and verify script
  - `package.json`:
    - name `graveyard-shift`, `license: MIT`, `engines.vscode ^1.90.0`, `activationEvents: onStartupFinished`
    - Activity Bar container + `graveyardShift.companion` webview view, `graveyardShift.openCompanion` command
  - `.gitignore`, `.vscodeignore`, MIT `LICENSE`.
  - TypeScript configs per area (`src/extension`, `src/webview`, `tests`, root tooling) sharing a strict base.
    - Host bundled by esbuild (Node, CJS).
    - Webview bundled by Vite + React with fixed output names in `dist/webview/`.
  - ESLint flat config with `typescript-eslint` (type-checked), `react-hooks`, and boundaries:
    - domain folders cannot import `vscode`, Node built-ins or `src/webview/**`
    - webview cannot import `src/extension/**`
    - no module may import `http`, `https`, `net`, `tls`, `dgram` or `undici`
    - `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` are banned globals (R14.1)
  - Vitest with `unit`, `property` and `webview` projects. Smoke tests:
    - CSP builder, nonce and manifest ids (unit)
    - HTML escaping for arbitrary strings (property)
    - placeholder exposes an accessible heading and landmark (webview)
  - Scripts: `build`, `build:host`, `build:webview`, `typecheck`, `lint`, `test`, `verify` (= typecheck && lint && test), `package` (vsce, no dependencies since everything is bundled).
  - `src/extension/activate.ts` registers the view provider with a static, CSP-compliant React placeholder, using the nonce and `asWebviewUri` pattern from design §7.1. All disposables go to `context.subscriptions`.
  - Confirm the verify hook: run `npm run verify --if-present` directly. Hook firing on task completion is checked in the Kiro UI (manual).
  - **Verify:**
    - `npm run verify` passes.
    - `npm run package` makes a VSIX, and its file list contains only runtime files.
    - Manual: install it in Kiro, open the sidebar, reload the window, and check the extension host log for errors.
  - _Requirements: 1.1, 1.2, 14.1, 15.1, 15.2, 18.1, 20.1, 20.2, 20.4, 20.5_
  - **Verification note (2026-11-14, macOS arm64, Node 24.21, Kiro 1.4.154 / Code OSS 1.131.0):**
    - Ran `npm run verify --if-present` (the hook's exact command). Passed: typecheck of 5 projects, ESLint with 0 warnings, and Vitest (4 files, 15 tests across unit, property and webview).
    - `npm run verify` exits 1 when a test fails (checked with a temporary failing test, since removed).
    - Lint boundaries were probed with temporary files, all 6 violations rejected:
      - a domain file importing `vscode`, `node:fs` or an adapter
      - a webview file importing host code or using `fetch`
      - host code importing `node:https`
    - `npm run build` passed: host bundle 4.7 KB, webview 214 KB JS + 0.7 KB CSS. The webview bundle has no `eval`/`new Function`, and neither bundle has network APIs.
    - `npm run package` passed: `graveyard-shift.vsix` with 8 entries (package.json, LICENSE, icon, 3 dist files, 2 VSIX metadata files); no sources, tests or source maps.
    - `engines.vscode ^1.90.0` set from Kiro's `product.json` (`vsCodeVersion` 1.131.0).
    - Toolchain: TypeScript 6.0.3, because typescript-eslint 8.72 supports TS < 6.1 (TS 7 is out but not yet supported).
    - **Kiro install, passed (agent, 2026-11-14 02:49):**
      - `kiro --install-extension ./graveyard-shift.vsix` installed `graveyard-shift.graveyard-shift@0.1.0`.
      - Both open Kiro windows logged `ExtensionService#_doActivateExtension graveyard-shift.graveyard-shift, activationEvent: 'onStartupFinished'` in `exthost.log`, with no reload.
      - No `[error]` or `[warning]` lines followed activation in either log.
    - **Manual, pending (user):** open the Graveyard Shift sidebar and confirm the placeholder text renders. Webviews resolve only when the view is opened in the UI, so the agent cannot check this.
    - **Manual, pending (user):** confirm in the Kiro UI that the `PostTaskExec` hook runs when a spec task is marked complete.
    - `npm audit`: 11 moderate advisories, all from one dev-only finding (minimatch), with no runtime exposure. See `docs/security/dependency-audit.md`. `npm run audit:prod` reports 0.

- [x] 2. Shared config, constants and settings contribution
  - `src/shared/config.ts`:
    - `EffectiveConfig`, `BASELINE_DEFAULTS` (equal to `config/defaults.json`), `DEFAULTS` (baseline plus R2.2)
    - `validateConfig(raw) → { config, problems }` with type fallback, range clamping and the threshold-ordering rule
  - `src/shared/constants.ts`: every † constant from design §13.
  - `package.json` `contributes.configuration` for R2.1–R2.2: all `scope: application`, min/max, the enum `panel | sidebar | off`, descriptions that say activity is an estimate.
  - Tests:
    - baseline equals `defaults.json`
    - contributions equal `DEFAULTS` and are all application-scoped
    - clamping, type fallback, threshold ordering
    - fast-check property: validated output is always in range and ordered
  - **Verify:** `npm run verify`. Manual: open Settings in Kiro, search "Graveyard Shift", and confirm the settings appear under User only.
  - _Requirements: 2.1–2.4, 2.7, 2.8, 20.3_
  - **Verification note (2026-11-14):**
    - Ran `npm run verify`. Passed: typecheck, lint with 0 warnings, Vitest (7 files, 58 tests).
    - New tests:
      - `config.test.ts`: baseline deep-equals `config/defaults.json`; every package.json setting matches the spec table (type, default, min/max, enum, `application` scope, description); no typing or productivity wording; clamping, rounding, wrong-type fallback, threshold ordering.
      - `config.property.test.ts`: any raw input gives a valid config; idempotent; at most one problem per setting.
      - `constants.test.ts`: all constants positive, and the ordering relationships the design relies on.
    - Mutation check: changing the eye default from 20 to 25 failed 3 tests, including the `defaults.json` comparison. The file was restored.
    - `npm run package` succeeded with the new configuration contribution.
    - Design note: one `SETTINGS` spec table drives validation, `DEFAULTS` and the manifest test, so defaults live in one place. `BASELINE_DEFAULTS` is a projection of `DEFAULTS` in the `defaults.json` shape.
    - **Manual, pending (user):** in Kiro Settings, search "Graveyard Shift" and confirm the settings appear under the User tab and not under Workspace. This needs the rebuilt VSIX installed (the agent reinstalls it during task 7 wiring).

## Milestone B — Vertical slice: reminders end to end (in memory)

- [x] 3. Time model and activity accounting (pure)
  - `src/shared/time.ts` (`Instant`, `Clock`). `tests/support/fakeClock.ts` advances `mono` and `wall` independently.
  - `src/extension/session/accounting.ts` implementing design §4.3: signal crediting, idle boundary, focus loss, heartbeat while focused and active, clock-consistency check, pause, `lastInteraction`.
  - Unit tests for each R3 and R4 case in design §12. Property tests for invariants 1 and 2.
  - _Requirements: 3.3–3.6, 3.9, 4.1–4.4, 4.8, 14.8, 21.1_
  - **Verification note (2026-11-14):**
    - Ran `npm run verify`. Passed: typecheck, lint with 0 warnings (domain boundary applies to `session/`), Vitest (9 files, 92 tests).
    - `accounting.test.ts` covers:
      - idle boundary: exact threshold credited, threshold + 1 ms not
      - focus loss credits up to blur, unfocused spans never credited, duplicate focus events
      - heartbeat only while focused and `WindowState.active`; no `windowActive` events at all
      - sleep (mono +1 min, wall +2 h), wall backwards, drift within and just over the 60 s tolerance
      - suspension (pause or break) and `resumeAccounting`
      - presence returns after idle, sleep, unfocused time and restart, including the untrusted-gap case
    - `accounting.property.test.ts` checks, over random event streams with sleep, drift and backwards jumps:
      - credits are never negative, never above the idle threshold, and 0 when unfocused or suspended
      - credited intervals never overlap, so nothing is counted twice; the total never exceeds monotonic time
      - credit is deterministic
    - Design decisions:
      - Accounting returns per-event `creditedMs` and an optional `returned` (wall gap). The engine applies credits to session, reminder and daily totals.
      - The welcome-back and new-Session decisions belong to tasks 4 and 6, which keeps this module single-purpose.

- [x] 4. Breaks, welcome-back prompts and session lifecycle (pure)
  - `src/extension/session/breaks.ts` implementing design §4.5:
    - eye rest and on-break with the 60 s grace
    - awaiting confirmation with timeout
    - welcome-back with rate limit and untrusted-gap handling
    - short vs Meaningful vs Long break effects
  - `src/extension/session/lifecycle.ts`: an in-process 6 h gap starts a new Session per design §4.4 (withdraw pending items, reset count and long-session state, keep history). Restart handling waits for task 10.
  - Unit tests for each transition and boundary. Property test for invariant 4.
  - _Requirements: 4.7, 5.1–5.9_
  - **Verification note (2026-11-14):**
    - Ran `npm run verify`. Passed: typecheck, lint with 0 warnings, Vitest (11 files, 130 tests).
    - Unit tests cover:
      - break classification at 4:59.999 / 5:00 / 14:59.999 / 15:00
      - eye rest completes at exactly 20 s, cancel credits nothing, signals don't interrupt it
      - the 60 s grace; "I'm back" inside the grace; stale ids ignored
      - sleep during a break measured by wall time; unknown duration when the wall clock went back, resolved by the user's "5 minutes or more" answer
      - confirm yes/no and the 10-minute lapse
      - welcome-back: 5-minute minimum, untrusted gaps, ≥ 6 h excluded (new Session instead), 30-minute rate limit including a backwards clock, lapse and withdraw
      - session crediting, and which break kinds reset the stretch
    - Property tests:
      - a break is recorded only from a completed eye rest or an explicit yes; signals never record one (R5.1)
      - only Meaningful and Long Breaks reset the stretch (invariant 4)
    - Design change, recorded in design.md §4.5: break duration uses wall time even across sleep (laptops sleep during breaks). It is untrusted only if the wall clock went backwards.
    - The engine (task 6) wires the new-Session reset: withdraw occurrences, reset count and long-session state, keep history.

- [x] 5. Reminder scheduler and delivery policy (pure)
  - `src/extension/reminders/scheduler.ts`:
    - accumulators, occurrence creation and combining
    - snooze using `snoozeMinutes`, with the 3rd snooze → missed
    - 15-minute missed, recorded exactly once
    - skip; withdraw on disable
    - interval-change handling; deterministic ids
    - one `missedBreak` signal per Break Reminder outcome
  - `src/extension/reminders/delivery.ts`: `decide()` from design §4.6. Covers focus, pause, break, spacing, deferral, pause → surface, and 2 min → subtle, never upgraded.
  - Unit tests for each R6, R7 and R8 rule. Property tests for invariants 3, 7 and 8.
  - _Requirements: 2.6, 2.9, 6.1–6.7, 7.2–7.4, 7.6, 7.8, 7.9, 8.2–8.5_
  - **Verification note (2026-11-14):**
    - Ran `npm run verify`. Passed: typecheck, lint with 0 warnings, Vitest (14 files, 177 tests).
    - `scheduler.test.ts` covers:
      - due at the interval; combining inside and just outside the 5-minute window; joining while pending; an on-screen card never changes, and waiting kinds follow after it resolves
      - skip; snooze with default and custom length; 3rd snooze → missed
      - missed exactly once after 15 active minutes, starting only after delivery
      - stale ids ignored; take-a-break target
      - Missed Break counting (Break Reminders only, once each; eye-only, taken and withdrawn don't count)
      - effects of eye rest, short break and Meaningful Break
      - a shorter interval produces one occurrence, not one per past interval; disabling withdraws without counting
      - new-Session reset
    - `delivery.test.ts` covers:
      - the interaction window boundary; every `canInterrupt` blocker; 5-minute spacing
      - focus mode off; waits during interaction and surfaces at a 10 s pause; subtle at exactly 2 min
      - no re-delivery; deferral deadlines
    - `reminders.property.test.ts` checks, over random activity, intents (including stale ids) and settings changes:
      - surfacings are ≥ 5 active min apart and each occurrence surfaces ≤ 3 times (invariant 3)
      - each occurrence gets exactly one outcome
      - determinism (invariant 7)
      - duplicate intents change nothing (invariant 8)
      - at most one live occurrence, with no duplicate kinds
    - Design decision: at most one live occurrence. Kinds due while it is pending or snoozed join it. Kinds due while it is on screen wait, so the reminder card never changes under the user's pointer.
    - Clarified R7.9 (requirements.md): the 15-minute missed window restarts at each delivery, and snoozed time does not count.

- [ ] 6. Companion state machine and root engine (pure)
  - `src/extension/companion/stage.ts`: count-based derivation with ⚙ thresholds, cap, credits, one-step escalation, Recovery with deadline (design §4.7).
  - `src/extension/application/engine.ts`: `CoreState`, `CoreEvent`, `Effect`, and `step()` composing tasks 3–5 with this task in the fixed order; `nextDeadline(state)`.
  - `src/extension/application/selectors.ts`: `selectViewModel()`.
  - `src/shared/copy.ts`: first-draft strings that frame stats around breaks, avoid typing or productivity wording, and contain no guilt language.
  - Unit tests for R10. Property tests for invariants 5 and 7 over the whole engine. A copy test checks that no string contains banned terms (a reviewable list).
  - _Requirements: 8.6, 10.1–10.10, 19.1–19.5_

- [ ] 7. Runtime and IDE activity adapter
  - `src/extension/application/runtime.ts`: tick + one-shot deadline timer, `EffectSink` interface, view-model change detection, error isolation.
  - `src/extension/activity/signals.ts`: subscriptions from design §6.2 only, 1 s coalescer, runtime check for `WindowState.active`. Unit test that emitted events carry no content fields.
  - Wire into `activate.ts` with in-memory state only (no persistence yet).
  - **Manual (record in note):**
    - measure when `WindowState.active` turns false in Kiro
    - let a Kiro agent edit and open files while hands-off, and confirm no selection signals are produced (temporary debug counter in the output channel, removed before commit)
  - _Requirements: 1.3, 3.1, 3.2, 3.7, 3.8, 14.2, 14.7, 18.2, 18.4_

- [ ] 8. Typed bridge and sidebar UI v1
  - `src/shared/messages.ts` validators, with tests for extra keys, bad literals, long ids and wrong version.
  - `src/extension/webviews/sidebarProvider.ts` + `html.ts`: snapshot on `ready` and on change.
  - `src/webview/bridge.ts` and `src/webview/sidebar/*`:
    - scene with a **static placeholder sprite per stage**, stage label and line
    - reminder card (including the subtle variant), eye-rest countdown, break panel, confirm-break, welcome-back
    - stats line, sound toggle (writes the setting), live region
    - no animation yet; `.motion-reduced` class plumbing in place
  - Webview tests: accessible names, keyboard activation, live-region text, correct intent ids.
  - **Manual:** sidebar at 240, 320 and 400 px; keyboard-only pass.
  - _Requirements: 1.1, 1.4, 1.5, 3.10, 5.2, 5.4, 5.5, 5.8, 7.1, 12.6, 13.1–13.3, 13.5, 13.9, 15.1–15.6_

- [ ] 9. Notifications, status bar and core commands
  - `src/extension/notifications/toasts.ts`: information severity only, stale-id safe, closed = no response.
  - `statusBar.ts` with the attention state.
  - Commands: Open Companion, Take a Break, Start Eye Rest, Pause (quick pick), Resume.
  - **Manual end-to-end in Kiro** (lower intervals in user settings, e.g. eye = 5 min):
    - a reminder appears in the sidebar and as a toast
    - it is deferred while interacting, and goes subtle after 2 min of continuous interaction
    - with Do Not Disturb on, toasts are suppressed
    - snooze, skip and take a break each behave as specified
    - the companion reaches Tired after one skipped Break Reminder and shows Recovery after a confirmed break
  - _Requirements: 1.6, 7.4, 7.5, 7.7, 8.1, 14.8, 17.1, 17.2_

> **⏸ Review checkpoint — vertical slice.** Work up to here may be committed and merged into `develop`. Do not start task 10 until the user has reviewed the slice in Kiro.

## Milestone C — Durability, privacy controls and multiple windows

- [ ] 10. Versioned storage, restart handling, history and window handoff
  - `src/extension/storage/schema.ts` (v1 with `revision` and `history`), `migrate.ts`, `stateStore.ts` (globalState + `MemoryStore`), debounced and immediate writes, 30-day pruning.
  - `restored` handling per design §4.4. Owner-window write, adopt and recheck per §8.3.
  - Tests:
    - migration fixtures, corrupt data, restart gap boundaries
    - a new Session keeps history
    - schema snapshot shows no forbidden fields
    - property invariant 10 (two simulated windows)
  - **Manual:**
    - reload the window mid-session; quit and reopen Kiro; sleep and wake the machine
    - two windows: switch focus and confirm no double counting and no duplicate toast
    - if the handoff is unreliable, apply the documented fallback (R21.5)
  - _Requirements: 4.5–4.7, 14.3, 14.4, 18.3, 21.1–21.5_

- [ ] 11. Settings live-reload, reset settings, clear data
  - Settings adapter with one warning per invalid setting per Session. `config` events are applied without resets.
  - Commands Reset Settings to Defaults and Clear Local Data, both with modal confirmations. Clear removes history too.
  - Tests for interval-change behaviour and disable-withdraws.
  - _Requirements: 2.5–2.11, 14.5, 17.3_

- [ ] 12. Human Check-in
  - Check-in prompt rules in the engine, memory-only answers, opt-in local saving, Check In command.
  - Tests: spacing; `humanCheckIn=false`; no change to count or timing; saved only when opted in; cleared by Clear Local Data.
  - _Requirements: 9.1–9.6_

## Milestone D — Signature experience

- [ ] 13. Sprite atlas pipeline and original companion set
  - `scripts/build-sprites.mjs` (grid text → transparent RGBA PNG atlas + JSON, Node `zlib` only). Sources in `assets/sprites/src/*.grid.txt`.
  - `CompanionSprite` with integer scaling and anchor alignment. CSSOM frame stepper only in full motion; static frame under reduced motion; pause when hidden.
  - Atlas contract test (design §7.5).
  - Five coherent stages with idle/breath/eye frames. `ASSETS.md` with the CC BY 4.0 statement, a per-asset table, and an empty third-party table.
  - Webview tests: reduced-motion class from the setting and from the OS media query.
  - **Manual:** screenshots of every stage at 240 and 400 px in dark, light and HC themes; experience-reviewer agent review (read-only).
  - _Requirements: 12.1–12.3, 13.6, 13.7, 18.5, 20.5_

- [ ] 14. Gentle sound cue
  - `src/webview/sound/cue.ts` (Web Audio, envelope from design §7.6), `cue` message, volume setting, resume on first interaction, silent fallback.
  - Tests with a mocked `AudioContext`: gain never exceeds `volume × 0.5`; no cue for check-ins, prompts or Subtle Delivery; none when disabled.
  - **Manual:** cue level at 30 % with normal OS volume; behaviour with the OS muted; autoplay behaviour in Kiro recorded.
  - _Requirements: 12.4, 12.5, 12.7, 12.8_

- [ ] 15. The Last Human
  - Long-session policy in the engine (design §4.8): per-stretch and per-session caps, remind-later, dismiss, not-again, subtle wait during interaction, quiet sidebar note.
  - `lastHumanPanel.ts`: Beside, `preserveFocus`, single instance, dispose = dismiss.
  - Panel UI: large zombie scene with a text alternative, copy, four actions, Escape, initial focus, static under reduced motion.
  - Fallbacks for `sidebar`, `off` and companion disabled. Preview command.
  - Tests for every R11 rule; property invariant 6.
  - **Manual:**
    - the panel never steals typing focus
    - editing, saving and closing all keep working with it open
    - no editor is closed or moved
    - VoiceOver reads the scene and actions
  - _Requirements: 2.10, 11.1–11.16, 13.8_

- [ ] 16. Demo simulation
  - `src/extension/demo/`: `SimulatedClock`, script, `DemoEffectSink`, `MemoryStore`. Start and Stop commands. DEMO badge in both webviews. Real reminders held during the demo.
  - Tests: property invariant 9 (real store untouched); the demo reaches The Last Human within 120 s of real time; a restart never resumes a demo.
  - **Manual:** full run-through timed with a stopwatch.
  - _Requirements: 16.1–16.6_

## Milestone E — Quality and submission readiness

- [ ] 17. Integration and lifecycle tests
  - Add `@vscode/test-cli` and `@vscode/test-electron`. Tests for activation, views, commands, configuration defaults, and disposal (no live timers or subscriptions after deactivate).
  - _Requirements: 18.1, 18.2_

- [ ] 18. Accessibility, theme and copy audit
  - Run the experience-reviewer agent (read-only) over code and screenshots, and fix findings rated medium or higher.
  - VoiceOver pass, contrast checks for any new colours, copy review against R19.
  - _Requirements: 13.1–13.10, 19.1–19.4_

- [ ] 19. Packaging and documentation
  - README covering:
    - what it is and is not; privacy statement; the activity-estimate disclaimer
    - install from VSIX; build and test steps
    - known limitations from design §14, including DND and multi-window
  - Finalise `ASSETS.md`. Fill in `docs/manual-checks.md` from real runs.
  - Clean-install test of the VSIX in Kiro.
  - Propose (do not perform) the `develop` → `main` release merge for user approval.
  - _Requirements: 14.1, 14.6, 20.4–20.6_
