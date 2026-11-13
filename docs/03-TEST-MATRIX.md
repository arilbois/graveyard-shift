# Test matrix

Core invariants for tests (Vitest + fast-check):
- Active duration never becomes negative or decreases unexpectedly after time jumps.
- Losing window focus or crossing idle threshold stops adding active time; document events alone do not prove human typing.
- No duplicate pending reminder for the same reminder type/period; snooze cannot cause notification floods.
- A meaningful break confirmed by the user resets or pauses the unbroken long-session counter as specified; idle alone does not.
- Eye break of 20 seconds does not reset the long-session counter.
- Zombie state transitions stay within valid states; short recoveries cannot instantly erase all history.
- A dismissed long-session warning respects cooldown and never traps the editor.
- `reducedMotion=true` means no intensive animations or flashing; sound has volume and mute controls.
- Settings survive reload; invalid values are validated, clamped or rejected with clear feedback.
- Webview messages reject invalid payloads and HTML cannot execute unexpected remote scripts.
- Automated simulation is labeled DEMO and never contaminates actual health/reminder history.
- No code content/keystroke/path is persisted or sent outside the device.

Manual acceptance:
- Kiro launch, reload, install and uninstall `.vsix`; sidebar at narrow width; Webview focus and keyboard; system sleep/wake; non-ASCII strings; dark/light themes; sound-muted OS; reduced-motion OS preference; runtime disposal; Devpost video footage reflects working product.
