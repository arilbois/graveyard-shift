# Requirements Document — Graveyard Shift

> Tagline: *Your code is alive. But are you?*
> Kiroween 2026 · Costume Contest · Status: **APPROVED** (review decisions D1–D8 applied 2026-11-14)

## Introduction

Graveyard Shift is a privacy-first developer wellness companion for Kiro IDE, built on the VS Code Extension API. A pixel-art companion in the sidebar reflects whether the user has recently taken breaks. Its stages are Human, Tired, Infected, Zombie and Recovery. The extension offers gentle, configurable eye, movement and hydration reminders. When a user-chosen long-session threshold is reached without a recorded meaningful break, it opens **The Last Human**, a large but harmless zombie reminder in an editor-area panel.

The product is about wellness, not productivity. Its goal is greater awareness of self-care while coding. It never rewards longer coding without breaks, and it never makes users feel guilty for skipping reminders. It does not measure health, diagnose anything, or collect code content.

**Activity is an estimate of IDE interaction.** It is built from content-free signals, such as keyboard- or mouse-driven cursor and selection changes and window focus. It is not a measurement of manual typing, effort or health. Cursor movement alone is not proof of typing. Automated changes made by agents, formatters or other extensions must not count as user activity.

### In scope (MVP)
Sidebar companion, status bar item, three reminder kinds, snooze / skip / take a break, user-confirmed breaks, optional Human Check-in, local activity estimates with local daily history, companion state machine, **The Last Human** panel (required in the final product), gentle sound, reduced motion, local persistence, multi-window coordination, demo simulation, VSIX packaging.

### Out of scope (MVP)
Camera, microphone, accounts, cloud backend, telemetry, analytics SDKs, AI inference, medical or mental-health claims, OS-wide overlays, DOM injection into Kiro's UI, history charts, cross-editor compatibility claims beyond what is tested.

### Future enhancements (not in MVP)
- **Immersive fullscreen presentation** of The Last Human. It would be available only after explicit, revocable user consent, and would remain dismissible. It is never a default and never forced.

### Requirement conventions
Criteria use EARS patterns: ubiquitous (`THE … SHALL`), event (`WHEN …`), state (`WHILE …`), unwanted behaviour (`IF … THEN …`) and optional feature (`WHERE …`). Values marked † are internal constants defined in one module (design.md §13). Values marked ⚙ are user settings. All thresholds are product mechanics, not medical assessments.

## Glossary

| Term | Meaning |
|---|---|
| **Host** | The extension host process running the TypeScript extension. |
| **Webview** | The sidebar Webview View or The Last Human Webview Panel, rendered with React. |
| **Activity Signal** | A content-free event suggesting a human is interacting with Kiro (R3.1). It carries only a source type and a timestamp. It is an indication of interaction, not of typing. |
| **Active Time** | Estimated IDE interaction time, built from gaps between Activity Signals that are no longer than `idleMinutes`. |
| **Idle** | No Activity Signal for longer than `idleMinutes`, or the window is unfocused. Idle is never a break. |
| **Gap** | An interval for which no Active Time is credited: idle periods, unfocused periods, system sleep, clock jumps and restarts. |
| **Active Editor Interaction** | A keyboard- or mouse-originated selection signal within the last 10 seconds† in the focused window. |
| **Unbroken Stretch** | Active Time accumulated since the last Confirmed Meaningful Break or the start of the Session. It drives The Last Human. |
| **Confirmed Break** | A break the user explicitly confirmed through a UI action. |
| **Eye Rest** | A confirmed 20-second† pause to look away from the screen. An Eye Rest is not a break. |
| **Meaningful Break** | A Confirmed Break lasting at least 5 minutes†. |
| **Long Break** | A Confirmed Break lasting at least 15 minutes†. |
| **Reminder Occurrence** | One instance of a due reminder, possibly covering several reminder kinds at once. It has a stable id and exactly one final outcome: *taken*, *skipped*, *missed* or *withdrawn*. |
| **Break Reminder** | A Reminder Occurrence that includes movement or hydration. Eye-only occurrences are not Break Reminders. |
| **Missed Break** | A Break Reminder that ended *skipped* or *missed*, or a Last Human showing that ended without a break. Each counts exactly once. |
| **Missed Break Count** | The number of Missed Breaks in the current Session, reduced by Confirmed Breaks (R10.4). It determines the companion stage and is never shown to the user as a number. |
| **Session** | The period from activation, or from the end of a Gap of at least 6 hours†, until the next such Gap. |
| **Surface** | To show a reminder through an interruptive channel: a notification toast, a sound, or The Last Human panel. |
| **Subtle Delivery** | Showing a reminder only in the sidebar, the status bar and the screen-reader live region, with no toast, sound or panel. |
| **Owner Window** | The Kiro window that currently has OS focus. Only it credits activity, writes shared state and surfaces reminders. |
| **Demo Simulation** | An isolated, clearly labelled, accelerated run of the domain engine that never affects real data. |

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

1. THE Extension SHALL contribute these settings with these exact defaults, matching the baseline in `config/defaults.json`:

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

2. THE Extension SHALL also contribute these settings, which extend the baseline without changing it:

   | Setting | Default | Range |
   |---|---|---|
   | `graveyardShift.experience.soundVolume` ⚙ | `30` (percent) | 0–100 |
   | `graveyardShift.reminders.saveCheckInsLocally` ⚙ | `false` | — |
   | `graveyardShift.reminders.snoozeMinutes` ⚙ | `10` | 5–60 |
   | `graveyardShift.companion.tiredAfterMissedBreaks` ⚙ | `1` | 1–20 |
   | `graveyardShift.companion.infectedAfterMissedBreaks` ⚙ | `3` | 2–30 |
   | `graveyardShift.companion.zombieAfterMissedBreaks` ⚙ | `5` | 3–40 |

3. THE Extension SHALL declare every setting with `application` scope, so that only user-level settings apply and repository or workspace configuration cannot change a person's wellness preferences.
4. THE `longSessionMode` setting SHALL accept exactly `panel`, `sidebar` and `off`.
5. WHEN a setting changes, THE Extension SHALL apply the new value within 2 seconds without a window reload and without resetting counters unrelated to that setting.
6. WHEN a reminder interval changes, THE Extension SHALL keep that kind's accumulated Active Time; IF the accumulated time already meets the new interval, THEN THE Extension SHALL create at most one Reminder Occurrence and SHALL NOT create occurrences for past intervals.
7. IF a setting has a wrong type, THEN THE Extension SHALL use its default; IF a numeric setting is out of range, THEN THE Extension SHALL use the nearest valid value. In both cases THE Extension SHALL show at most one non-modal warning per setting per Session that names the setting and the value in use.
8. IF the three stage thresholds are not strictly increasing (tired < infected < zombie), THEN THE Extension SHALL use the default thresholds for all three and show one warning.
9. WHEN a reminder kind is disabled, THE Extension SHALL withdraw that kind's pending occurrence without counting a Missed Break and SHALL NOT schedule new occurrences of it.
10. WHERE `companion.enabled` is false, THE sidebar SHALL show reminders and break controls without the character, and long-session warnings SHALL use a standard notification instead of The Last Human panel.
11. WHEN the user runs "Graveyard Shift: Reset Settings to Defaults" and confirms, THE Extension SHALL remove its user-level setting overrides so that the defaults apply.

### Requirement 3 — Activity estimation

**User story:** As a user, I want the extension to estimate my IDE interaction conservatively, so that reminders are timed sensibly without monitoring what I do.

1. THE Activity Estimator SHALL treat only these as Activity Signals: the window gaining focus; `WindowState.active` becoming true; a text editor selection change whose kind is `Keyboard` or `Mouse`; and the user clicking or pressing a key inside a Graveyard Shift Webview.
2. THE Activity Estimator SHALL NOT treat these as Activity Signals, because automation produces them: text document changes, saves, file system events, active-editor changes, visible-range changes, and selection changes of kind `Command` or `undefined`.
3. WHEN an Activity Signal arrives while the window is focused and the gap since the previous Activity Signal is at most `idleMinutes`, THE Activity Estimator SHALL add that gap to Active Time.
4. IF the gap since the previous Activity Signal exceeds `idleMinutes`, THEN THE Activity Estimator SHALL credit none of that gap.
5. WHEN the window loses focus, THE Activity Estimator SHALL credit time up to the moment focus was lost (subject to criteria 3–4) and SHALL credit nothing until focus returns.
6. WHILE the window is focused and `WindowState.active` is true, THE Activity Estimator SHALL treat each Host tick as an Activity Signal.
7. IF `WindowState.active` is absent at runtime, THEN THE Activity Estimator SHALL work with the remaining signals without error.
8. THE Activity Estimator SHALL process at most one Activity Signal per second, coalescing the rest.
9. WHILE Idle, THE Extension SHALL NOT treat the idle time as a break and SHALL NOT reduce the Unbroken Stretch or the Missed Break Count.
10. THE Extension SHALL describe every activity figure shown to the user as estimated IDE activity. It SHALL NOT describe it as typing, work done, productivity or health.

### Requirement 4 — Time integrity: sleep, clock changes, restarts and new sessions

**User story:** As a user, I want correct behaviour when my machine sleeps, the clock changes, or Kiro restarts, so that I never get bogus reminders or inflated numbers.

1. THE Activity Estimator SHALL measure elapsed time with a monotonic clock and SHALL cross-check each interval against wall-clock time.
2. IF the monotonic and wall-clock durations of an interval differ by more than 60 seconds†, THEN THE Activity Estimator SHALL treat the interval as a Gap, crediting neither Active Time nor a break.
3. IF the wall clock moves backwards, THEN THE Activity Estimator SHALL credit nothing for that interval and SHALL NOT decrease any stored duration.
4. THE Extension SHALL never decrease Active Time, the Unbroken Stretch or a reminder accumulator except through the resets defined in R5, R6.6, criterion 7 below, and R14.5.
5. WHEN the Extension restarts (window reload, workspace change or IDE restart) and less than 6 hours† have passed since the last persisted Activity Signal, THE Extension SHALL resume the persisted Session and SHALL credit no Active Time for the restart gap.
6. WHEN the Extension resumes after a restart gap of at least 5 minutes†, THE Extension SHALL handle that gap like an idle return (R5.8).
7. WHEN a Gap of at least 6 hours† ends, THE Extension SHALL start a new Session in which:
   - the Unbroken Stretch, reminder accumulators and Missed Break Count are zero and the companion is Human;
   - pending and snoozed occurrences from the previous Session are *withdrawn*, so they are neither surfaced nor counted as Missed Breaks;
   - long-session state (cooldowns, showings, "not again this session") is cleared;
   - no Confirmed Break is recorded for the gap;
   - daily history and today's aggregates are kept intact.
8. THE Extension SHALL NOT create Reminder Occurrences for time spent asleep, unfocused or Idle.

### Requirement 5 — Breaks and recovery credit

**User story:** As a user, I want breaks to count only when I say I took them, so that the companion reflects real rest rather than guesses.

1. THE Extension SHALL credit a break only after an explicit user action: completing an Eye Rest, confirming a break started with "Take a break", or answering yes to a welcome-back prompt.
2. WHEN the user starts an Eye Rest, THE sidebar SHALL show a 20-second† countdown with a Cancel action; WHEN the countdown completes, THE Extension SHALL record a confirmed Eye Rest; IF the user cancels, THEN THE Extension SHALL credit nothing and keep the eye occurrence pending.
3. WHEN an Eye Rest is confirmed, THE Extension SHALL reset only the eye reminder accumulator and SHALL NOT change the Unbroken Stretch or the Missed Break Count.
4. WHEN the user chooses "Take a break" for a Break Reminder, from The Last Human, or from the command palette, THE Extension SHALL enter an On Break state that shows the elapsed break time and an "I'm back" action.
5. WHILE On Break, WHEN the user selects "I'm back" or the first Activity Signal arrives more than 60 seconds† after the break began, THE Extension SHALL end the break at that moment and ask the user to confirm it ("You were away for about N minutes. Count it as a break?"). THE Extension SHALL credit the break only if the user confirms.
6. WHEN a Confirmed Break of at least 5 minutes† is recorded, THE Extension SHALL reset the Unbroken Stretch and all reminder accumulators and SHALL resolve pending occurrences as *taken*.
7. WHEN a Confirmed Break shorter than 5 minutes† is recorded, THE Extension SHALL resolve only the occurrence it was started from as *taken* and SHALL NOT change the Unbroken Stretch.
8. WHEN an Activity Signal ends an Idle period (including sleep or restart) of at least 5 minutes† and no break was in progress, THE sidebar SHALL show a non-modal prompt "Welcome back. Were you taking a break?" with Yes and No. Yes SHALL record a Confirmed Break with the measured wall-clock gap; No or no answer SHALL credit nothing. This prompt SHALL appear at most once per 30 minutes† and SHALL NOT use a notification toast or sound.
9. IF the measured gap for a welcome-back prompt cannot be trusted (wall clock moved backwards), THEN THE Extension SHALL NOT show the prompt.

### Requirement 6 — Reminder scheduling

**User story:** As a user, I want eye, movement and hydration reminders based on my estimated IDE activity, so that they arrive when I have actually been at the screen for a while.

1. WHERE a reminder kind is enabled, THE Reminder Scheduler SHALL create a Reminder Occurrence when that kind's accumulated Active Time reaches its configured interval.
2. THE Reminder Scheduler SHALL accumulate only Active Time, never Idle, unfocused, sleep, paused or Demo Simulation time.
3. THE Reminder Scheduler SHALL hold at most one pending occurrence per reminder kind.
4. WHEN an occurrence is created, THE Reminder Scheduler SHALL include every other enabled kind whose accumulator is within 5 minutes† of its interval, producing one combined occurrence.
5. THE Reminder Scheduler SHALL leave at least 5 minutes† of Active Time between any two surfacings, including The Last Human.
6. WHEN an occurrence reaches a final outcome, THE Reminder Scheduler SHALL reset the accumulators of the kinds it covered.
7. GIVEN the same configuration and the same sequence of events, THE Reminder Scheduler SHALL produce the same occurrences, ids and outcomes.

### Requirement 7 — Reminder delivery, focus mode and Do Not Disturb

**User story:** As a user, I want reminders that do not break my concentration and never force an interruption, but that are never silently lost.

1. WHEN an occurrence is created, THE sidebar SHALL show it at once without taking focus, and the status bar item SHALL indicate it.
2. WHERE `focusMode` is enabled, WHILE Active Editor Interaction is in progress, THE Extension SHALL defer surfacing for up to 2 minutes†. WHEN interaction pauses for 10 seconds† within that window, THE Extension SHALL surface the occurrence normally.
3. WHERE `focusMode` is enabled, IF Active Editor Interaction is still in progress 2 minutes† after the occurrence was created, THEN THE Extension SHALL use Subtle Delivery for that occurrence and SHALL NOT later upgrade it to a toast or sound.
4. WHERE `focusMode` is disabled, THE Extension SHALL surface an occurrence as soon as it is created, subject to criterion 6 and R6.5.
5. THE Extension SHALL surface reminders only as non-modal information notifications through the standard IDE notification API, so that the IDE's Do Not Disturb mode applies where supported. THE Extension SHALL NOT use modal dialogs, error or warning severity, or any other mechanism to bypass Do Not Disturb, and SHALL NOT move keyboard focus.
6. WHILE the window is not the Owner Window, or is Paused, On Break, in an Eye Rest, showing The Last Human, or running a Demo Simulation (for real occurrences), THE Extension SHALL NOT surface reminders; occurrences stay pending in the sidebar.
7. IF a notification is closed without choosing an action, THEN THE Extension SHALL treat it as no response and keep the occurrence pending.
8. IF the user acts on a notification or sidebar card for an occurrence that already has an outcome, THEN THE Extension SHALL ignore the action.
9. IF an occurrence receives no response for 15 minutes† of Active Time after it was last surfaced or subtly delivered (time spent snoozed does not count), THEN THE Extension SHALL resolve it as *missed* exactly once, remove it from the sidebar quietly, and SHALL NOT surface it again.

### Requirement 8 — Responding to reminders

**User story:** As a user, I want to take a break, snooze or skip freely, so that I stay in control without being made to feel guilty.

1. WHEN the user chooses "Take a break" on an eye-only occurrence, THE Extension SHALL start an Eye Rest; for a Break Reminder, THE Extension SHALL start the break flow (R5.4).
2. WHEN the user chooses "Snooze", THE Extension SHALL surface the same occurrence again after `snoozeMinutes` ⚙ of Active Time and SHALL confirm with a neutral message.
3. WHEN the user snoozes the same occurrence a third time, THE Extension SHALL resolve it as *missed* instead of scheduling another surfacing, confirm with a neutral message ("Okay. Next check-in in about N minutes."), and start the next interval.
4. WHEN the user chooses "Skip", THE Extension SHALL resolve the occurrence as *skipped* with only a brief neutral acknowledgement.
5. THE Extension SHALL add exactly one to the Missed Break Count when a Break Reminder ends *skipped* or *missed*, however many kinds it covered and however long it stayed pending. Eye-only occurrences, snoozes that do not end the occurrence, and *withdrawn* occurrences SHALL NOT add to the count.
6. THE Extension SHALL NOT use guilt, shame, urgency, countdown pressure or streak language in any response to snooze, skip or dismiss.

### Requirement 9 — Human Check-in (optional)

**User story:** As a user, I want an optional, private way to say how I am doing, so that the companion can respond kindly without inferring anything about me.

1. WHERE `reminders.humanCheckIn` is true, WHEN a Meaningful Break is confirmed and no check-in was offered in the last 2 hours† of Active Time, THE sidebar SHALL offer "How are you doing?" with the answers "Doing okay", "A bit worn out", "I need a longer break" and "Not now".
2. THE Extension SHALL keep check-in answers in memory only, unless `reminders.saveCheckInsLocally` is true, in which case it SHALL store them only in local extension storage.
3. WHEN the user answers "I need a longer break", THE sidebar SHALL offer to start the break flow; other answers SHALL produce a short supportive message and nothing else.
4. THE Extension SHALL NOT change the Missed Break Count, reminder timing or companion stage based on check-in answers, and SHALL NOT infer any health condition from them.
5. THE Extension SHALL NOT show check-ins as notifications and SHALL NOT play sound for them.
6. WHERE `reminders.humanCheckIn` is false, THE Extension SHALL show no check-in prompts.

### Requirement 10 — Companion state machine

**User story:** As a user, I want the companion to reflect my recent break pattern in a playful way, so that I notice when I have been skipping breaks.

1. THE Companion SHALL always be in exactly one stage: Human, Tired, Infected, Zombie or Recovery.
2. THE Companion SHALL derive its resting stage from the Missed Break Count only, never from Active Time alone, using the ⚙ thresholds: Human below `tiredAfterMissedBreaks` (default 1), Tired from `tiredAfterMissedBreaks`, Infected from `infectedAfterMissedBreaks` (default 3), and Zombie from `zombieAfterMissedBreaks` (default 5).
3. THE Extension SHALL cap the Missed Break Count at `zombieAfterMissedBreaks + 2`†, so that recovery from Zombie is always reachable.
4. WHEN a break is confirmed, THE Extension SHALL reduce the Missed Break Count, never below 0: a Confirmed Break shorter than 5 minutes by 1, a Meaningful Break by 2†, and a Long Break to 0. An Eye Rest SHALL NOT change the count.
5. WHEN the count rises, THE Companion SHALL move up at most one stage per event.
6. WHEN a Confirmed Break (not an Eye Rest) is recorded while the stage is Tired, Infected or Zombie, THE Companion SHALL enter Recovery for 3 minutes† and then settle on the stage for the current count.
7. With the default thresholds, a single Meaningful Break SHALL NOT return the Companion from Zombie to Human.
8. WHEN a new Session starts, THE Companion SHALL reset to Human with a count of 0.
9. THE sidebar SHALL present each stage with a text label and accessible description that describe the companion, not a diagnosis of the user.
10. GIVEN the same events and settings, THE Companion SHALL produce the same stages (deterministic, clock injected).

### Requirement 11 — The Last Human long-session reminder

**User story:** As a user who loses track of time, I want a large, memorable but harmless zombie reminder when I reach my chosen long-session threshold without a recorded meaningful break, so that I take a real break.

The Last Human is required in the final product. It must be configurable, dismissible, accessible and non-destructive.

1. WHERE `longSessionMode` is `panel` and the companion is enabled, WHEN the Unbroken Stretch reaches `longSessionHours`, THE Extension SHALL open a Webview Panel titled "The Last Human" beside the active editor without taking keyboard focus, subject to R7.6 and criterion 4.
2. THE panel SHALL show a large pixel-art zombie scene, a plain statement of the estimated active time since the last meaningful break, and the actions "Take a break" (primary), "Remind me in an hour", "Dismiss" and "Not again this session".
3. THE panel SHALL state that the threshold is the user's own setting and SHALL NOT claim a health risk tied to any number of hours.
4. WHERE `focusMode` is enabled, WHILE Active Editor Interaction is in progress, THE Extension SHALL wait for a 10-second† interaction pause before opening the panel. Until then, it SHALL show the long-session message through Subtle Delivery.
5. THE Extension SHALL open the panel automatically at most twice per Unbroken Stretch: once at the threshold, and once more only if the user chose "Remind me in an hour", after 60 minutes† of further Active Time.
6. WHEN the user chooses Dismiss or closes the panel tab, THE Extension SHALL NOT open it automatically again during the same Unbroken Stretch.
7. WHEN the user chooses "Not again this session", THE Extension SHALL NOT open it automatically again until a new Session.
8. THE Extension SHALL open the panel automatically at most 2† times per Session in total.
9. WHILE the long-session condition persists after the panel will no longer open, THE sidebar SHALL show a quiet long-session note without notifications or sound.
10. THE Extension SHALL count each automatic showing that ends without a Confirmed Break as one Missed Break, exactly once per showing.
11. WHEN the user chooses "Take a break" in the panel, THE Extension SHALL start the break flow and close the panel.
12. The Last Human SHALL be non-destructive. THE Extension SHALL NOT make the panel modal, block or delay editing, saving, tasks or closing, close or move the user's editors, discard unsaved changes, use fullscreen, or overlay Kiro's UI.
13. THE Extension SHALL keep at most one Last Human panel open.
14. WHERE `longSessionMode` is `sidebar`, THE Extension SHALL show the long-session message in the sidebar plus one standard notification. WHERE it is `off`, THE Extension SHALL show nothing for this threshold.
15. THE panel SHALL meet R12 and R13. Its actions SHALL be keyboard operable, the scene SHALL have a text alternative, Escape SHALL Dismiss it, and reduced motion SHALL show a static scene.
16. WHEN the user runs "Graveyard Shift: Preview The Last Human", THE Extension SHALL open the panel labelled "Preview" without changing any state or counts.

### Requirement 12 — Motion and sound

**User story:** As a user, I want animation and sound that are pleasant and fully under my control.

1. THE Webview SHALL use reduced motion WHERE `experience.reducedMotion` is true OR the OS reports `prefers-reduced-motion: reduce`.
2. WHILE reduced motion is in effect, THE Webviews SHALL show a static frame per stage, change stages with an instant cut or an opacity fade of at most 200 ms, and SHALL NOT use shake, parallax, looping animation or flicker.
3. THE Webviews SHALL NOT flash more than 3 times in any one-second period in any mode.
4. WHERE `experience.sounds` is true, THE Webview SHALL play a short, soft cue (at most 1.5 s, fade-in at least 100 ms) at `soundVolume` when a reminder is surfaced (not subtly delivered) or Recovery begins.
5. THE Extension SHALL NOT play sound for check-ins, welcome-back prompts, Subtle Delivery, idle transitions or errors.
6. THE sidebar SHALL offer a mute toggle that updates `experience.sounds` immediately.
7. Reduced motion and sound SHALL operate independently. With the baseline defaults (`sounds=true`, `reducedMotion=true`), the user gets static visuals and gentle cues.
8. IF no Graveyard Shift Webview is visible, or the audio context cannot start, THEN THE Extension SHALL stay silent without showing an error.

### Requirement 13 — Accessibility and layout

**User story:** As a user who relies on a keyboard, screen reader, high contrast or a narrow sidebar, I want every feature to work for me.

1. THE Webviews SHALL make every control operable by keyboard with a visible focus indicator and a logical tab order.
2. THE Webviews SHALL give every control an accessible name, and SHALL expose the companion and scenes as images whose accessible names state the stage.
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
3. THE Extension SHALL persist only aggregate durations, counters, extension-event timestamps, reminder outcomes, Confirmed Breaks, daily summaries, and (only if opted in) check-in answers.
4. THE Extension SHALL store state only in local extension storage (`globalState`). It SHALL keep the current Session and daily summaries for the last 30 days†, deleting older summaries automatically.
5. WHEN the user runs "Graveyard Shift: Clear Local Data" and confirms in a modal dialog, THE Extension SHALL delete all persisted state, including history, and reset in-memory counters.
6. THE Extension SHALL work fully offline.
7. THE Extension SHALL write only lifecycle events and errors to its output channel, with no message payloads or content.
8. WHEN the user runs "Graveyard Shift: Pause" with a duration (30 minutes, 1 hour, until restart), THE Extension SHALL stop estimation, reminders and companion changes until the duration ends or the user resumes. Paused time SHALL count as neither activity nor a break.

### Requirement 15 — Webview security and message bridge

**User story:** As a user, I want the extension's UI to be safe by construction.

1. THE Extension SHALL set a Content Security Policy on every Webview with `default-src 'none'`. Scripts SHALL be allowed only with a per-load nonce or from the Webview's own resource origin. Styles, images and fonts SHALL be allowed only from that origin. There SHALL be no `connect-src`.
2. THE Extension SHALL limit `localResourceRoots` to the packaged webview bundle and asset folders, and SHALL NOT enable command URIs.
3. THE Host and Webviews SHALL validate every message with shared validators; IF a message is invalid or has an unknown protocol version, THEN the receiver SHALL drop it and log only its type.
4. THE Host SHALL own all timing and state; Webviews SHALL render Host snapshots and send user intents only.
5. THE Webviews SHALL NOT render any string as HTML.
6. THE Host SHALL handle intents idempotently by occurrence, break or prompt id.

### Requirement 16 — Demo simulation

**User story:** As a hackathon presenter, I want to show the full experience in under two minutes without faking real data.

1. WHEN the user runs "Graveyard Shift: Start Demo Simulation", THE Extension SHALL show a persistent "DEMO · simulated time" label on every Graveyard Shift surface, prefix demo notifications with "[Demo]", and title the panel "The Last Human (Demo)".
2. THE Demo Simulation SHALL run in a separate engine instance with a simulated clock and in-memory storage, and SHALL NOT write persisted state, daily history or real reminder outcomes.
3. WHILE a Demo Simulation runs, THE Extension SHALL continue real estimation but SHALL hold real reminders; WHEN the demo ends, held reminders SHALL follow normal delivery rules.
4. THE Demo Simulation SHALL progress Human → Tired → Infected → Zombie → The Last Human within 120 seconds, and SHALL let the presenter take a simulated break to show Recovery.
5. WHEN the user runs "Stop Demo Simulation", the demo completes, 5 minutes pass, or the Extension restarts, THE Extension SHALL end the demo and restore the real view. A demo SHALL never resume after a restart.
6. THE Demo Simulation SHALL respect the current motion and sound settings.

### Requirement 17 — Commands

**User story:** As a keyboard user, I want every main action in the command palette.

1. THE Extension SHALL contribute these commands under the "Graveyard Shift" category: Open Companion, Take a Break, Start Eye Rest, Pause, Resume, Check In, Preview The Last Human, Start Demo Simulation, Stop Demo Simulation, Reset Settings to Defaults, Clear Local Data.
2. WHILE Paused, THE status bar item and sidebar SHALL show "Paused" and offer Resume.
3. Commands that destroy data or settings SHALL require a modal confirmation. No other command SHALL be modal.

### Requirement 18 — Lifecycle and resources

**User story:** As a user, I want the extension to be light and to clean up after itself.

1. WHEN the Extension deactivates, THE Extension SHALL dispose every event subscription, timer, status bar item and Webview it created.
2. THE Host SHALL run one periodic tick (15 seconds†) plus at most one one-shot timer for the nearest deadline.
3. THE Extension SHALL persist state at most once every 30 seconds† for accrual, immediately after outcomes, surfacings, breaks and focus loss, and on a best-effort basis at deactivation.
4. IF one adapter throws, THEN THE Extension SHALL log it and keep other features running, showing at most one error notification per Session.
5. WHILE a Webview is hidden, it SHALL stop its animations.

### Requirement 19 — Wellness-first language and incentives

**User story:** As a user, I want messages that are calm, plain and honest, and a product that never pushes me to code longer.

1. THE Extension SHALL write messages in plain English, at most two short sentences each.
2. THE Extension SHALL NOT make medical claims, diagnoses or risk statements, and SHALL describe the long-session threshold as the user's own setting.
3. THE Extension SHALL NOT use guilt, shame, exaggerated urgency or emoji decoration.
4. THE Extension SHALL NOT reward longer coding without breaks. It SHALL NOT show active time as a goal, streak, ranking, record or achievement. Any positive feedback SHALL be tied to breaks taken.
5. THE Extension SHALL keep all user-facing strings in one module so they can be reviewed together.

### Requirement 20 — Build, verification, licensing and packaging

**User story:** As the maintainer, I want reliable checks and a reproducible, properly licensed package.

1. THE repository SHALL provide npm scripts `typecheck`, `lint`, `test`, `build`, `package` and `verify`. `verify` SHALL run typecheck, lint and unit/property/webview tests and SHALL exit non-zero on any failure.
2. THE lint configuration SHALL fail if a domain module imports `vscode` or webview code, if webview code imports Host code, or if any module imports a network API.
3. A test SHALL fail if the contributed baseline setting defaults differ from `config/defaults.json`.
4. `npm run package` SHALL produce a `.vsix` containing only runtime files, which installs and activates in Kiro.
5. THE repository SHALL license source code under MIT (`LICENSE`). It SHALL license original artwork the project owns under CC BY 4.0, documented separately in `ASSETS.md`, and SHALL list every third-party asset with its source and licence there.
6. THE repository SHALL include a README with a privacy statement, the activity-estimate disclaimer, install and test steps, and known limitations.
7. THE `.kiro/hooks/verify-after-task.json` hook SHALL use the `PostTaskExec` trigger and run `npm run verify --if-present`.
8. Each completed task SHALL include a verification note stating what ran, what passed, what failed and what remains manual.

### Requirement 21 — Multiple Kiro windows

**User story:** As a user with several Kiro windows open, I want one consistent companion, so that activity is not double-counted and reminders are not duplicated.

1. THE Extension SHALL credit Active Time only in the Owner Window, so that time is never counted twice across windows.
2. THE Extension SHALL keep one shared state in local extension storage. Only the Owner Window SHALL write it. A window that gains focus SHALL adopt the newer stored state before processing its own signals.
3. THE Extension SHALL surface reminders and open The Last Human only in the Owner Window. An occurrence already surfaced or subtly delivered in one window SHALL NOT be surfaced again in another.
4. IF the user acts on an occurrence in a window whose copy of the state is stale, THEN THE Extension SHALL apply the action only if the shared state still has that occurrence pending.
5. IF manual verification in Kiro shows that shared-state handoff between windows is not reliable, THEN THE README SHALL document the limitation, and THE Extension SHALL fall back to a simpler documented behaviour instead of fragile coordination.
