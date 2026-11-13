---
inclusion: fileMatch
fileMatchPattern: ["src/webview/**/*", "assets/**/*"]
---
# Costume Contest visual identity — no AI slop

Direction: meticulously crafted indie pixel-art horror, unexpectedly warm and human, not a generic productivity dashboard.

Palette starting point (validate contrast rather than blindly applying):
- Ink `#191E1B`, panel `#252C26`, bone `#EBE7DA`, olive `#9AAD86`, aged rust `#B47C66`, muted secondary `#B3BDB0`.
- Keep at most one warm accent and one green accent visible at a time. Dark/light themes need deliberate treatment.

Layout and hierarchy:
- Companion sprite is the anchor, self-care action second, supporting statistics third.
- Simple 8px spacing rhythm, responsive minimum sidebar width, short natural sentences.
- Avoid stacked cards everywhere, gratuitous gradients, glassmorphism, neon glows, random emojis, confetti, gradients on every button, generic AI art, and cluttered charts.
- Design for real sidebar widths around 240–400px, high DPI and accessibility; editor panel can be cinematic but not disruptive.

Animation:
- One consistent character design across states; coherent frame-by-frame expressions with original/licensed sprites.
- Pixel-perfect nearest-neighbor rendering, meaningful idle/breath/eye movement, respectful transitions.
- Respect reduced motion in CSS and JS. If true, use static or minimally animated frames; no flashing, forced effects, or sudden sound.
- No dependency on online images, external fonts, or network APIs.

All major states must have screenshots at narrow and wide widths and pass keyboard and contrast checks.
