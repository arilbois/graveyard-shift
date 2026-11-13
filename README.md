# Graveyard Shift

*Your code is alive. But are you?*

Graveyard Shift is a privacy-first developer wellness companion for [Kiro](https://kiro.dev), built for Kiroween 2026. A pixel-art companion in the sidebar reflects whether you have been taking breaks, offers gentle eye, movement and hydration reminders, and, when you reach a long-session threshold you choose, shows **The Last Human**: a large, dismissible zombie reminder to step away.

> **Status: early development.** The current build installs a placeholder sidebar. Reminders, the companion and The Last Human are being built task by task; see `.kiro/specs/graveyard-shift/tasks.md`.

## What it is, and what it is not

- It encourages breaks. It is not a productivity tracker and never rewards coding longer.
- Activity figures are **estimates of IDE interaction** (keyboard- or mouse-driven cursor changes and window focus). They are not a measurement of typing, effort or health, and automated edits by agents or formatters are not counted.
- It is not a medical tool. Thresholds such as five hours are your own settings, not health guidance.

## Privacy

- Everything stays on your machine. No network requests, accounts, telemetry or analytics.
- No document contents, keystrokes, file names, paths, screenshots, camera or microphone.
- Only aggregate durations, reminder outcomes and breaks you confirm are stored, in local extension storage, and you can clear them at any time.

## Build from source

Requires Node.js 22 or newer.

```sh
npm ci
npm run verify    # typecheck, lint, unit/property/webview tests
npm run package   # builds graveyard-shift.vsix
kiro --install-extension graveyard-shift.vsix
```

## Licence

Source code: [MIT](LICENSE) © 2026 Syahril ([syahril.id](https://syahril.id)). Original artwork will be licensed under CC BY 4.0 and documented in `ASSETS.md`.
