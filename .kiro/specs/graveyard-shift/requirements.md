# Requirements Document — Graveyard Shift

> Tagline: *Your code is alive. But are you?*
> Kiroween 2026 · Costume Contest · Status: **DRAFT for review**

## Introduction

Graveyard Shift is a privacy-first developer wellness companion for Kiro IDE, built on the VS Code Extension API. A pixel-art companion in the sidebar reflects whether the user has been taking breaks. Its stages are Human, Tired, Infected, Zombie and Recovery. The extension offers gentle, configurable eye, movement and hydration reminders. When a user-chosen long-session threshold is reached, it opens a dismissible editor-area panel called **The Last Human**.

The product raises awareness of self-care while coding. It does not measure health, diagnose anything, reward long sessions, or collect code content. Activity figures are estimates derived from IDE signals.

### In scope (MVP)
Sidebar companion, status bar item, three reminder kinds, snooze / skip / take a break, user-confirmed breaks, optional Human Check-in, local activity estimates, companion state machine, The Last Human panel, gentle sound, reduced motion, local persistence, demo simulation, VSIX packaging.

### Out of scope (MVP)
Camera, microphone, accounts, cloud backend, telemetry, analytics SDKs, AI inference, medical or mental-health claims, OS-wide overlays or fullscreen, DOM injection into Kiro's UI, multi-day history charts, cross-editor compatibility claims beyond what is tested.

### Requirement conventions
Criteria use EARS patterns: ubiquitous (`THE … SHALL`), event (`WHEN …`), state (`WHILE …`), unwanted behaviour (`IF … THEN …`) and optional feature (`WHERE …`). Proposed numeric constants (marked †) are defined in design.md §13 and are open for review; they are internal constants unless stated as settings.

## Glossary

| Term | Meaning |
|---|---|
| **Host** | The extension host process running the TypeScript extension. |
| **Webview** | The sidebar Webview View or The Last Human Webview Panel, rendered with React. |
| **Activity Signal** | A content-free event that suggests a human is interacting with Kiro (listed in R3.1). It carries only a source type and a timestamp. |
| **Active Time** | Estimated time of IDE activity, built from gaps between Activity Signals that are no longer than `idleMinutes`. It is an estimate, not a measurement of effort or health. |
| **Idle** | No Activity Signal for longer than `idleMinutes`, or the window is unfocused. Idle is never a break. |
| **Gap** | An interval for which no Active Time is credited: idle periods, unfocused periods, system sleep, clock jumps and restarts. |
| **Unbroken Stretch** | Active Time accumulated since the last Confirmed Meaningful Break. It drives The Last Human. |
| **Confirmed Break** | A break the user explicitly confirmed through a UI action. |
| **Eye Rest** | A confirmed 20-second† pause to look away from the screen. |
| **Meaningful Break** | A Confirmed Break lasting at least 5 minutes†. |
| **Long Break** | A Confirmed Break lasting at least 15 minutes†. |
| **Reminder Occurrence** | One instance of a due reminder, possibly covering several reminder kinds at once. It has a stable id and exactly one final outcome: *taken*, *skipped* or *missed*. |
| **Missed Break Opportunity** | A Reminder Occurrence or long-session warning that ended without a break (skipped, missed, or snoozed out). |
| **Missed Break Score** | An internal integer computed from Missed Break Opportunities and Confirmed Breaks. It determines the companion stage. It is never shown to the user as a number. |
| **Typing Burst** | A keyboard-originated Activity Signal within the last 10 seconds†. |
| **Session** | The period from activation (or from the end of a gap of at least 6 hours†) until the next such gap. |
| **Demo Simulation** | An isolated, clearly labelled, accelerated run of the domain engine that never affects real data. |
| **Surface** | To show a reminder through an interruptive channel (notification toast, sound, or The Last Human panel). Displaying it passively in the sidebar is not surfacing. |

---

## Requirements

### Requirement 1 — Sidebar companion and activation

**User story:** As a developer using Kiro, I want a companion in the sidebar, so that I can see my break status at a glance without leaving the editor.

1. THE Extension SHALL contribute an Activity Bar view container named "Graveyard Shift" containing a Webview View that shows the companion, a text label for its current stage, and one primary self-care action.
2. THE Extension SHALL activate on `onStartupFinished` and SHALL NOT perform blocking file or network I/O during activation.
3. WHEN the Extension activates, THE Extension SHALL start activity estimation whether or not the sidebar is visible.
4. WHEN the sidebar is hidden and shown again, THE sidebar SHALL render the current state from the Host within 1 second and SHALL NOT reset any counter.
5. IF a Webview fails to load or throws, THEN THE Extension SHALL continue estimation and SHALL deliver reminders through notifications.
6. WHERE `companion.enabled` is true, THE Extension SHALL show a status bar item with the companion stage and the estimated time since the last Confirmed Break; WHEN the user activates it, THE Extension SHALL reveal the sidebar.

### Requirement 2 — Configuration and baseline defaults

**User story:** As a user, I want sensible defaults that I can change at any time, so that reminders fit how I work.

1. THE Extension SHALL contribute these settings with these exact defaults, matching `config/defaults.json`:

   | Setting | Default |
   |---|---|
   | `graveyardShift.reminders.eye.enabled` | `true` |
   | `graveyardShift.reminders.eye.minutes` | `20` |
   | `graveyardShift.reminders.movement.enabled` | `true` |
   | `graveyardShift.reminders.movement.minutes` | `60` |
   | `graveyardShift.reminders.hydration.enabled` | `true` |
   | `graveyardShift.reminders.hydration.minutes` | `60` |
   | `graveyardShift.reminders.humanCheckIn` | `true` |
   | `graveyardShift.companion.enabled` | `true` |
   | `graveyardShift.companion.longSessionMode` | `"panel"` |
   | `graveyardShift.companion.longSessionHours` | `5` |
   | `graveyardShift.experience.sounds` | `true` |
   | `graveyardShift.experience.reducedMotion` | `true` |
   | `graveyardShift.experience.focusMode` | `true` |
   | `graveyardShift.experience.idleMinutes` | `5` |

2. THE Extension SHALL contribute these additional settings, which are not in `defaults.json` *(pending decision D3)*: `graveyardShift.experience.soundVolume` (integer percent, default `30`, range 0–100) and `graveyardShift.reminders.saveCheckInsLocally` (default `false`).
3. THE Extension SHALL declare its settings with `application` scope so that a workspace's `.vscode/settings.json` cannot change a person's wellness preferences *(pending decision D7)*.
4. WHEN a setting changes, THE Extension SHALL apply the new value within 2 seconds without a window reload and without resetting counters unrelated to that setting.
5. WHEN a reminder interval changes, THE Extension SHALL keep that kind's accumulated Active Time; IF the accumulated time already meets the new interval, THEN THE Extension SHALL create at most one Reminder Occurrence and SHALL NOT create occurrences for "missed" past intervals.
6. IF a setting has a wrong type, THEN THE Extension SHALL use its default; IF a numeric setting is out of range, THEN THE Extension SHALL use the nearest valid value. In both cases THE Extension SHALL show at most one non-modal warning per setting per Session that names the setting and the value in use.
7. WHEN a reminder kind is disabled, THE Extension SHALL withdraw that kind's pending occurrence without recording an outcome and SHALL NOT schedule new occurrences of it.
8. WHERE `companion.enabled` is false, THE sidebar SHALL show reminders and break controls without the character, and long-session warnings SHALL use a standard notification instead of The Last Human panel.
9. WHEN the user runs "Graveyard Shift: Reset Settings to Defaults" and confirms, THE Extension SHALL remove its user-level setting overrides so that defaults apply.

### Requirement 3 — Activity estimation

**User story:** As a user, I want the extension to estimate my IDE activity conservatively, so that reminders are timed sensibly without monitoring what I do.

1. THE Activity Estimator SHALL treat only these as Activity Signals: the window gaining focus; `WindowState.active` becoming true (where the API exists); a text editor selection change whose kind is `Keyboard` or `Mouse`; the active text editor changing while the window is focused; and the user interacting with a Graveyard Shift Webview.
2. THE Activity Estimator SHALL NOT treat text document changes, saves, file system events, or selection changes of kind `Command` or `undefined` as Activity Signals, because agents, formatters and other extensions produce them.
3. WHEN an Activity Signal arrives while the window is focused and the gap since the previous Activity Signal is at most `idleMinutes`, THE Activity Estimator SHALL add that gap to Active Time.
4. IF the gap since the previous Activity Signal exceeds `idleMinutes`, THEN THE Activity Estimator SHALL credit none of that gap.
5. WHEN the window loses focus, THE Activity Estimator SHALL credit time up to the moment focus was lost (subject to criteria 3–4) and SHALL credit nothing until focus returns.
6. WHILE the window is focused and `WindowState.active` is true, THE Activity Estimator SHALL treat each Host tick as an Activity Signal.
7. IF `WindowState.active` is unavailable in the running IDE, THEN THE Activity Estimator SHALL work with the remaining signals without error.
8. THE Activity Estimator SHALL process at most one Activity Signal per second, coalescing the rest.
9. WHILE Idle, THE Extension SHALL NOT treat the idle time as a break and SHALL NOT reduce the Unbroken Stretch or the Missed Break Score.
10. THE Extension SHALL describe every activity duration shown to the user as an estimate.

### Requirement 4 — Time integrity: sleep, clock changes and restarts

**User story:** As a user, I want correct behaviour when my machine sleeps, the clock changes, or Kiro restarts, so that I never get bogus reminders or inflated numbers.

1. THE Activity Estimator SHALL measure elapsed time with a monotonic clock and SHALL cross-check each interval against wall-clock time.
2. IF the monotonic and wall-clock durations of an interval differ by more than 60 seconds†, THEN THE Activity Estimator SHALL treat the interval as a Gap, crediting neither Active Time nor a break.
3. IF the wall clock moves backwards, THEN THE Activity Estimator SHALL credit nothing for that interval and SHALL NOT decrease any stored duration.
4. THE Extension SHALL never decrease Active Time, the Unbroken Stretch or a reminder accumulator except through the resets defined in R5, R6.6, criterion 7 below, and R14.5.
5. WHEN the Extension restarts (window reload, workspace change or IDE restart) and less than 6 hours† of wall-clock time has passed since the last persisted Activity Signal, THE Extension SHALL resume the persisted counters and SHALL credit no Active Time for the restart gap.
6. WHEN the Extension resumes after a restart gap of at least 5 minutes†, THE Extension SHALL handle that gap like an idle return (R5.8).
7. WHEN a Gap of at least 6 hours† ends, THE Extension SHALL start a new Session: the Unbroken Stretch, reminder accumulators and Missed Break Score reset to zero, and the previous Session is recorded as ended while away. THE Extension SHALL NOT record that gap as a Confirmed Break *(pending decision D1)*.
8. THE Extension SHALL NOT create Reminder Occurrences for time spent asleep, unfocused or Idle.

### Requirement 5 — Breaks and recovery credit

**User story:** As a user, I want breaks to count only when I say I took them, so that the companion reflects real rest rather than guesses.

1. THE Extension SHALL credit a break only after an explicit user action: completing an Eye Rest, confirming a break started with "Take a break", or answering yes to a welcome-back prompt.
2. WHEN the user starts an Eye Rest, THE sidebar SHALL show a 20-second† countdown with a Cancel action; WHEN the countdown completes, THE Extension SHALL record a confirmed Eye Rest; IF the user cancels, THEN THE Extension SHALL credit nothing and keep the eye occurrence pending.
3. WHEN an Eye Rest is confirmed, THE Extension SHALL reset only the eye reminder accumulator and SHALL NOT change the Unbroken Stretch.
4. WHEN the user chooses "Take a break" for a movement, hydration or combined reminder, or from the command palette, THE Extension SHALL enter an On Break state that shows the elapsed break time and an "I'm back" action.
5. WHILE On Break, WHEN the user selects "I'm back" or the first Activity Signal arrives more than 60 seconds† after the break began, THE Extension SHALL end the break at that moment and ask the user to confirm it ("You were away for about N minutes. Count it as a break?"). THE Extension SHALL credit the break only if the user confirms.
6. WHEN a Confirmed Break of at least 5 minutes† is recorded, THE Extension SHALL reset the Unbroken Stretch and all reminder accumulators and SHALL resolve pending occurrences as *taken*.
7. WHEN a Confirmed Break shorter than 5 minutes† is recorded, THE Extension SHALL resolve only the occurrence it was started from as *taken* and SHALL NOT change the Unbroken Stretch.
8. WHEN an Activity Signal ends an Idle period (including sleep or restart) of at least 5 minutes† and no break was in progress, THE sidebar SHALL show a non-modal prompt "Welcome back. Were you taking a break?" with Yes and No. Yes SHALL record a Confirmed Break with the measured wall-clock gap; No or no answer SHALL credit nothing. This prompt SHALL appear at most once per 30 minutes† and SHALL NOT use a notification toast or sound.
9. IF the measured gap for a welcome-back prompt cannot be trusted (wall clock moved backwards), THEN THE Extension SHALL NOT show the prompt.

### Requirement 6 — Reminder scheduling

**User story:** As a user, I want eye, movement and hydration reminders based on my estimated activity, so that they arrive when I have actually been working for a while.

1. WHERE a reminder kind is enabled, THE Reminder Scheduler SHALL create a Reminder Occurrence when that kind's accumulated Active Time reaches its configured interval.
2. THE Reminder Scheduler SHALL accumulate only Active Time, never Idle, unfocused, sleep, paused or Demo Simulation time.
3. THE Reminder Scheduler SHALL hold at most one pending occurrence per reminder kind.
4. WHEN an occurrence is created, THE Reminder Scheduler SHALL include every other enabled kind whose accumulator is within 5 minutes† of its interval, producing one combined occurrence.
5. THE Reminder Scheduler SHALL leave at least 5 minutes† of Active Time between any two surfacings, including The Last Human.
6. WHEN an occurrence reaches a final outcome, THE Reminder Scheduler SHALL reset the accumulators of the kinds it covered.
7. GIVEN the same configuration and the same sequence of events, THE Reminder Scheduler SHALL produce the same occurrences, ids and outcomes.

### Requirement 7 — Reminder delivery and interruption

**User story:** As a user, I want reminders that do not break my concentration mid-sentence but also never get silently lost.

1. WHEN an occurrence is created, THE sidebar SHALL show it at once without taking focus, and the status bar item SHALL indicate it.
2. WHERE `focusMode` is enabled, WHILE a Typing Burst is in progress, THE Extension SHALL defer surfacing until 10 seconds† pass without keyboard signals or 2 minutes† pass since the occurrence was created, whichever comes first *(pending decision D2)*.
3. WHERE `focusMode` is disabled, THE Extension SHALL surface an occurrence as soon as it is created, subject to criteria 5 and R6.5.
4. THE Extension SHALL surface reminders as non-modal information notifications with the actions "Take a break", "Snooze" and "Skip", and SHALL NOT move keyboard focus.
5. WHILE the window is unfocused, Paused, On Break, in an Eye Rest, showing The Last Human, or running a Demo Simulation (for real occurrences), THE Extension SHALL NOT surface reminders; occurrences stay pending in the sidebar.
6. IF a notification is closed without choosing an action, THEN THE Extension SHALL treat it as no response and keep the occurrence pending.
7. IF the user acts on a notification or sidebar card for an occurrence that already has an outcome, THEN THE Extension SHALL ignore the action.
8. IF an occurrence receives no response for 15 minutes† of Active Time after it was first surfaced, THEN THE Extension SHALL resolve it as *missed*, remove it from the sidebar quietly, and SHALL NOT surface it again.

### Requirement 8 — Responding to reminders

**User story:** As a user, I want to take a break, snooze or skip freely, so that I stay in control without being made to feel guilty.

1. WHEN the user chooses "Take a break" on an eye-only occurrence, THE Extension SHALL start an Eye Rest; for any occurrence that includes movement or hydration, THE Extension SHALL start the break flow (R5.4).
2. WHEN the user chooses "Snooze", THE Extension SHALL surface the same occurrence again after 10 minutes† of Active Time and SHALL confirm with a neutral message.
3. WHEN the user snoozes the same occurrence a third time, THE Extension SHALL resolve it as *missed* instead of scheduling another surfacing, confirm with a neutral message ("Okay. Next check-in in about N minutes."), and start the next interval.
4. WHEN the user chooses "Skip", THE Extension SHALL resolve the occurrence as *skipped* with no follow-up message beyond a brief neutral acknowledgement.
5. THE Extension SHALL count each *skipped* or *missed* outcome as one Missed Break Opportunity; snoozes that do not end the occurrence SHALL NOT count.
6. THE Extension SHALL NOT use guilt, shame, urgency, countdown pressure or streak language in any response to snooze, skip or dismiss.

### Requirement 9 — Human Check-in (optional)

**User story:** As a user, I want an optional, private way to say how I am doing, so that the companion can respond kindly without inferring anything about me.

1. WHERE `reminders.humanCheckIn` is true, WHEN a Meaningful Break is confirmed and no check-in was offered in the last 2 hours† of Active Time, THE sidebar SHALL offer "How are you doing?" with the answers "Doing okay", "A bit worn out", "I need a longer break" and "Not now".
2. THE Extension SHALL keep check-in answers in memory only, unless `reminders.saveCheckInsLocally` is true, in which case it SHALL store them only in local extension storage.
3. WHEN the user answers "I need a longer break", THE sidebar SHALL offer to start the break flow; other answers SHALL produce a short supportive message and nothing else.
4. THE Extension SHALL NOT change the Missed Break Score, reminder timing or companion stage based on check-in answers, and SHALL NOT infer any health condition from them.
5. THE Extension SHALL NOT show check-ins as notifications and SHALL NOT play sound for them.
6. WHERE `reminders.humanCheckIn` is false, THE Extension SHALL show no check-in prompts.

### Requirement 10 — Companion state machine

**User story:** As a user, I want the companion to reflect my recent break pattern in a playful way, so that I notice when I have been skipping breaks.

1. THE Companion SHALL always be in exactly one stage: Human, Tired, Infected, Zombie or Recovery.
2. THE Companion SHALL derive its resting stage from the Missed Break Score only, never from Active Time alone. Proposed† weights: eye opportunity 1; movement, hydration or combined opportunity 2; long-session warning dismissed or snoozed 3; score capped at 12. Proposed† thresholds: Human 0–2, Tired 3–5, Infected 6–9, Zombie 10–12.
3. WHEN the score rises, THE Companion SHALL move up at most one stage per event.
4. WHEN a break is confirmed, THE Extension SHALL reduce the score: Eye Rest by 1, Meaningful Break by 4, Long Break to 0, never below 0.
5. WHEN a break is confirmed while the stage is Tired, Infected or Zombie, THE Companion SHALL enter Recovery for 3 minutes† and then settle on the stage for the current score.
6. A single Meaningful Break SHALL NOT return the Companion from Zombie to Human.
7. WHEN a new Session starts, THE Companion SHALL reset to Human with a score of 0.
8. THE sidebar SHALL present each stage with a text label and accessible description that describe the companion, not a diagnosis of the user.
9. GIVEN the same events, THE Companion SHALL produce the same stages (deterministic, clock injected).

### Requirement 11 — The Last Human long-session panel

**User story:** As a user who loses track of time, I want a memorable but harmless moment when I reach my chosen long-session threshold, so that I take a real break.

1. WHERE `longSessionMode` is `panel` and the companion is enabled, WHEN the Unbroken Stretch reaches `longSessionHours`, THE Extension SHALL open a Webview Panel titled "The Last Human" beside the active editor without taking keyboard focus, subject to R7.2 and R7.5.
2. THE panel SHALL show a pixel-art scene, a plain statement of the estimated active time since the last longer break, and the actions "Take a break" (primary), "Remind me in 30 minutes", "Dismiss" and "Not again this session".
3. THE panel SHALL state that the threshold is the user's own setting and SHALL NOT claim a health risk tied to any number of hours.
4. WHEN the user closes the panel tab or chooses Dismiss, THE Extension SHALL NOT reopen it until the Unbroken Stretch grows by another 60 minutes†; WHEN the user chooses "Remind me in 30 minutes", THE Extension SHALL wait 30 minutes† of Active Time.
5. WHEN the user chooses "Not again this session", THE Extension SHALL not open the panel again until a new Session or a Meaningful Break.
6. THE Extension SHALL count each showing that ends without a break as one Missed Break Opportunity, at most once per showing.
7. WHEN the user chooses "Take a break" in the panel, THE Extension SHALL start the break flow and close the panel.
8. THE Extension SHALL NOT make the panel modal, block editing, saving, tasks or closing, use fullscreen, or overlay Kiro's UI.
9. THE Extension SHALL keep at most one Last Human panel open.
10. WHERE `longSessionMode` is `sidebar`, THE Extension SHALL show the long-session message in the sidebar plus one notification; WHERE it is `off`, THE Extension SHALL show nothing for this threshold *(enum values pending decision D3)*.
11. WHEN the user runs "Graveyard Shift: Preview The Last Human", THE Extension SHALL open the panel labelled "Preview" without changing any state.

### Requirement 12 — Motion and sound

**User story:** As a user, I want animation and sound that are pleasant and fully under my control.

1. THE Webview SHALL use reduced motion WHERE `experience.reducedMotion` is true OR the OS reports `prefers-reduced-motion: reduce`.
2. WHILE reduced motion is in effect, THE Webviews SHALL show a static frame per stage, change stages with an instant cut or an opacity fade of at most 200 ms, and SHALL NOT use shake, parallax, looping animation or flicker.
3. THE Webviews SHALL NOT flash more than 3 times in any one-second period in any mode.
4. WHERE `experience.sounds` is true, THE Webview SHALL play a short, soft cue (at most 1.5 s, fade-in at least 100 ms) when a reminder is surfaced or Recovery begins, at `soundVolume`.
5. THE Extension SHALL NOT play sound for check-ins, welcome-back prompts, idle transitions or errors.
6. THE sidebar SHALL offer a mute toggle that updates `experience.sounds` immediately.
7. Reduced motion and sound SHALL operate independently; with the defaults (`sounds=true`, `reducedMotion=true`) the user gets static visuals and gentle cues.
8. IF no Graveyard Shift Webview is visible, or the audio context cannot start, THEN THE Extension SHALL stay silent without showing an error.

### Requirement 13 — Accessibility and layout

**User story:** As a user who relies on a keyboard, screen reader, high contrast or a narrow sidebar, I want every feature to work for me.

1. THE Webviews SHALL make every control operable by keyboard with a visible focus indicator and a logical tab order.
2. THE Webviews SHALL give every control an accessible name, and SHALL expose the companion as an image whose accessible name states its stage.
3. WHEN a reminder or prompt appears, THE sidebar SHALL announce it through a polite live region without moving focus.
4. THE Webviews SHALL meet a contrast ratio of at least 4.5:1 for body text and at least 3:1 for large text, UI component boundaries and meaningful graphics.
5. THE sidebar SHALL work without horizontal scrolling at widths from 240 to 400 px and remain usable below 240 px.
6. THE Webviews SHALL follow Kiro's light, dark and high-contrast themes through theme tokens for controls and text outside the companion scene.
7. THE Webviews SHALL render pixel art at integer scale with nearest-neighbour sampling.
8. WHEN The Last Human panel has focus, Escape SHALL Dismiss it, and the primary action SHALL receive initial focus.
9. THE Webviews SHALL NOT rely on colour alone to convey stage or reminder state.
10. THE Webviews SHALL respect the editor's font size and family tokens for text.

### Requirement 14 — Privacy and local data

**User story:** As a user, I want my data to stay on my machine and be easy to erase.

1. THE Extension and its Webviews SHALL make no network requests.
2. THE Extension SHALL NOT read, store, log or transmit document contents, keystrokes, file names, paths, workspace or repository names, clipboard, screenshots, camera or microphone data.
3. THE Extension SHALL persist only aggregate durations, counters, extension-event timestamps, reminder outcomes, Confirmed Breaks, and (only if opted in) check-in answers.
4. THE Extension SHALL store state only in local extension storage (`globalState`), and SHALL keep only the current Session and today's aggregates.
5. WHEN the user runs "Graveyard Shift: Clear Local Data" and confirms in a modal dialog, THE Extension SHALL delete all persisted state and reset in-memory counters.
6. THE Extension SHALL work fully offline.
7. THE Extension SHALL write only lifecycle events and errors to its output channel, with no message payloads or content.
8. WHEN the user runs "Graveyard Shift: Pause" with a duration (30 minutes, 1 hour, until restart), THE Extension SHALL stop estimation, reminders and companion changes until the duration ends or the user resumes. Paused time SHALL count as neither activity nor a break.

### Requirement 15 — Webview security and message bridge

**User story:** As a user, I want the extension's UI to be safe by construction.

1. THE Extension SHALL set a Content Security Policy on every Webview with `default-src 'none'`, scripts allowed only with a per-load nonce or from the Webview's own resource origin, styles, images and fonts only from that origin, and no `connect-src`.
2. THE Extension SHALL limit `localResourceRoots` to the packaged webview bundle and asset folders, and SHALL NOT enable command URIs.
3. THE Host and Webviews SHALL validate every message with shared validators; IF a message is invalid or has an unknown protocol version, THEN the receiver SHALL drop it and log only its type.
4. THE Host SHALL own all timing and state; Webviews SHALL render Host snapshots and send user intents only.
5. THE Webviews SHALL NOT render any string as HTML.
6. THE Host SHALL handle intents idempotently by occurrence, break or prompt id.

### Requirement 16 — Demo simulation

**User story:** As a hackathon presenter, I want to show the full experience in under two minutes without faking real data.

1. WHEN the user runs "Graveyard Shift: Start Demo Simulation", THE Extension SHALL show a persistent "DEMO · simulated time" label on every Graveyard Shift surface, prefix demo notifications with "[Demo]", and title the panel "The Last Human (Demo)".
2. THE Demo Simulation SHALL run in a separate engine instance with a simulated clock and in-memory storage, and SHALL NOT write persisted state, today's aggregates or real reminder history.
3. WHILE a Demo Simulation runs, THE Extension SHALL continue real estimation but SHALL hold real reminders; WHEN the demo ends, held reminders SHALL follow normal delivery rules.
4. THE Demo Simulation SHALL progress Human → Tired → Infected → Zombie → The Last Human within 120 seconds, and SHALL let the presenter take a simulated break to show Recovery.
5. WHEN the user runs "Stop Demo Simulation", the demo completes, 5 minutes pass, or the Extension restarts, THE Extension SHALL end the demo and restore the real view; a demo SHALL never resume after restart.
6. THE Demo Simulation SHALL respect the current motion and sound settings.

### Requirement 17 — Commands

**User story:** As a keyboard user, I want every main action in the command palette.

1. THE Extension SHALL contribute these commands under the "Graveyard Shift" category: Open Companion, Take a Break, Start Eye Rest, Pause, Resume, Check In, Preview The Last Human, Start Demo Simulation, Stop Demo Simulation, Reset Settings to Defaults, Clear Local Data.
2. WHILE Paused, THE status bar item and sidebar SHALL show "Paused" and offer Resume.
3. Commands that destroy data or settings SHALL require a modal confirmation; no other command SHALL be modal.

### Requirement 18 — Lifecycle and resources

**User story:** As a user, I want the extension to be light and to clean up after itself.

1. WHEN the Extension deactivates, THE Extension SHALL dispose every event subscription, timer, status bar item and Webview it created.
2. THE Host SHALL run one periodic tick (15 seconds†) plus at most one one-shot timer for the nearest deadline.
3. THE Extension SHALL persist state at most once every 30 seconds† for accrual, immediately after outcomes and breaks, and on a best-effort basis at deactivation.
4. IF one adapter throws, THEN THE Extension SHALL log it and keep other features running, showing at most one error notification per Session.
5. WHILE a Webview is hidden, it SHALL stop its animations.

### Requirement 19 — User-facing language

**User story:** As a user, I want messages that are calm, plain and honest.

1. THE Extension SHALL write messages in plain English, at most two short sentences each.
2. THE Extension SHALL NOT make medical claims, diagnoses or risk statements, and SHALL describe the long-session threshold as the user's own setting.
3. THE Extension SHALL NOT use guilt, shame, exaggerated urgency, emoji decoration, or achievements for long sessions.
4. THE Extension SHALL keep all user-facing strings in one module so they can be reviewed together.

### Requirement 20 — Build, verification and packaging

**User story:** As the maintainer, I want reliable checks and a reproducible package.

1. THE repository SHALL provide npm scripts `typecheck`, `lint`, `test`, `build`, `package` and `verify`, where `verify` runs typecheck, lint and unit/property tests and exits non-zero on any failure.
2. THE lint configuration SHALL fail if a domain module imports `vscode` or webview code, or if webview code imports Host code.
3. A test SHALL fail if the contributed setting defaults differ from `config/defaults.json`.
4. `npm run package` SHALL produce a `.vsix` containing only runtime files, which installs and activates in Kiro.
5. THE repository SHALL include a LICENSE (to be chosen, decision D6), a README with privacy statement, install and test steps, and an asset record listing the origin and licence of every sprite and sound.
6. Each completed task SHALL include a verification note stating what ran, what passed, what failed and what remains manual.
