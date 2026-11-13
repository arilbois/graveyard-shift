# Implementation roadmap — build the experience, not a generic timer

## P0 — project skeleton and verified launch
- Scaffold VS Code/Kiro extension (manifest, activation, Activity Bar Webview View); separate extension host and React Webview bundles.
- Show a static original companion placeholder with working commands/settings and validate install via VSIX in Kiro.
- Ensure `.kiro/` committed, LICENSE and README prepared, no hidden cloud dependency.
- Acceptance: extension installs, activates, opens sidebar and survives reload without runtime errors.

## P1 — tracking and wellness core
- Instrument focus/edit/selection signals conservatively; calculate estimated active sessions with injected clock.
- Implement idle=5m, session persistence, restart/sleep/focus behavior.
- Implement reminder scheduler (eye 20, movement 60, water 60); snooze/dismiss/take a break, no spam.
- Acceptance: tests use a simulated clock and prove appropriate reminders while minimizing interruption.

## P2 — signature experience
- Typed states Human / Tired / Infected / Zombie / Recovery; escalation based on ignored break opportunities, NOT mere hours.
- User-confirmed restorative breaks cause recovery; 20-second eye rest does not reset 5h long-session warning.
- Pixel-art sprite set with consistent proportions and distinctive idle/recovery animation.
- The Last Human opens a cinematic Webview Panel at configured 5h of estimated work without meaningful break. Panel is dismissible, with cooldown; no global fullscreen injection.
- Acceptance: full demo can be shown via labeled simulation in under two minutes without waiting hours.

## P3 — polish, quality and demo
- Settings panel supports current defaults; changes live and persist; reset defaults, pause extension and clear local data.
- Test reduced motion, keyboard, screen readers, narrow sidebar, high DPI, sound control, dark/light contexts, DND/focus mode.
- Run unit, property and integration tests, smoke test Kiro on supported OS, package VSIX and test clean install.
- 5–10 developer usability sessions if time permits, with consent, documenting observations rather than inventing health outcomes.
- Make public GitHub repo with LICENSE, root `.kiro/`, README, screenshots and reproducible build/install steps; submit 2:30–2:50 YouTube demo.

## Non-goals
- Medical diagnosis, body/camera tracking, remote telemetry, cross-editor platform claims without testing, startup monetization, OS-wide fullscreen overlay, AI mental-health analysis, heavy backend.

## Suggested commands once scripts exist
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run verify` (typecheck + lint + unit/property tests)
- `npm run package` to create `.vsix` via `@vscode/vsce` after configured

Note: hook uses `npm run verify --if-present` and does nothing until that script is defined. Ask Kiro to implement the script in the scaffold milestone; never treat the hook alone as evidence of passing checks.
