---
inclusion: fileMatch
fileMatchPattern: ["src/**/*.ts", "src/**/*.tsx", "tests/**/*"]
---
# Code and test quality

- Small focused functions and components with typed inputs and outputs; avoid any; no unchecked casts.
- Write unit tests for state transitions and reminder decisions, property tests for timer monotonicity, deduplication, idempotency and valid ranges.
- Mock time and IDE events. Never require actual five-hour waits to test The Last Human.
- Critical tests: idle threshold boundary, focus lost, restart, system sleep, snooze, skipped reminder, recovery only on confirmed break, cooldown, reduced motion, local storage migrations.
- Cover extensions resource cleanup: subscriptions, timers, webviews and event listeners disposed correctly.
- Security: no secrets or code content in logs; messages validated; webview strict CSP.
- Every task completed must have a verification note stating what ran, passed, failed or remains manual.
