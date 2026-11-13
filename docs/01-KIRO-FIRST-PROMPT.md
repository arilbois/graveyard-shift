# First prompt to Kiro IDE

Paste this into Kiro **Specs** to generate requirements, design, and tasks. Review each artifact before accepting implementation.

```text
Build Graveyard Shift, an original Kiro IDE extension for the Kiroween 2026 Costume Contest.
Tagline: Your code is alive. But are you?

Read all files in .kiro/steering/ and config/defaults.json before doing anything.
This is a privacy-first developer wellness companion, NOT a productivity timer.
Create a working VS Code-compatible extension for Kiro with a sidebar pixel-art companion, configurable eye/movement/hydration reminders, optional Human Check-in, local session activity estimates, snooze/skip/take break, and a companion state machine Human → Tired → Infected → Zombie → Recovery. A configurable five-hour warning opens a dismissible cinematic editor Webview called The Last Human (mode 'panel'). No camera, mic, remote tracking, code content collection, medical claims or unsupported global overlays.

Respect these exact baseline settings from config/defaults.json. Particularly, sounds=true and reducedMotion=true must both work together: default sound is user controllable with volume and must never be startling; reduced motion shows toned-down/static companion instead of full animation.

Architecture: TypeScript VS Code extension host, React + Vite local Webview UI, pure domain modules separated from IDE adapters, local storage only, typed message bridge, strict CSP, accessible keyboard controls. The core timer and state machine must be deterministic and testable by injecting a clock; never confuse idle with confirmed rest, and do not treat agent-generated edits as definite proof of user typing.

First generate rigorous EARS-style user stories and acceptance criteria. Then propose architecture/design and an ordered executable tasks.md for a vertical slice. Include negative cases: sleep/resume, restart, background/idle, settings changes, snooze, focus mode, user-confirmed recovery, reduced motion, cooldown, and demo simulation not used for real health stats.

Do not implement all tasks in one pass. Ask me to review requirements.md and design.md. After approval, implement only one task at a time, run checks, report any limitations, and never push or publish without my approval.
```

## After the spec is generated
1. Critically review EARS requirements for accuracy (especially activity ≠ health).
2. Review domain state and the host/webview security boundary in `design.md`.
3. Confirm tasks split into vertical milestones; don't accept an enormous one-shot task.
4. Implement task by task using the engineering agent. Take screenshots and test in actual Kiro IDE.
