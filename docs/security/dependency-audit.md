# Dependency audit

Last reviewed: 2026-11-14 · Reviewer: Kiro agent, at the maintainer's request.

## Summary

| Scope | Command | Result |
|---|---|---|
| Runtime (what ships in the VSIX) | `npm run audit:prod` (`npm audit --omit=dev`) | **0 vulnerabilities** |
| Development tooling | `npm audit` | 11 moderate, one root cause |

The shipped extension contains only the esbuild host bundle and the Vite webview bundle (React 19.3.1, react-dom, scheduler). The VSIX has no `node_modules`, and neither bundle contains `minimatch` or `brace-expansion`.

## Finding: minimatch GHSA-g3hv-75wg-m249 (CVE-2026-118764), moderate

- **What it is:** a crafted glob *pattern* compiled at `optimizationLevel >= 2` causes amplified preprocessing and quadratic comparison, which costs CPU and memory (denial of service). Affects minimatch `>=7.0.0 <11.0.1`; fixed in 11.0.1.
- **Why it shows as 11 findings:** `minimatch@10.2.6` is a dependency of `eslint` 10 (and `@eslint/config-array`), `typescript-eslint` 8.72 (through `@typescript-eslint/typescript-estree`), and `@vscode/vsce` 4. npm reports every package on those paths.
- **Actual impact here: none in practice.** The patterns these tools compile come from this repository's own files (`eslint.config.mjs`, `.vscodeignore`, tsconfig `include` globs), which the maintainer controls. No pattern comes from users or the network, and the tools only run on a developer machine. The extension never uses minimatch.

## Fixes considered

| Option | Decision | Reason |
|---|---|---|
| `npm audit fix --force` | Rejected | It *downgrades* across majors (eslint 10 → 9.39.5, typescript-eslint → 8.36.0, @vscode/vsce 4 → 3.9.1) to escape the vulnerable range. That loses current fixes and the TS 6 support we rely on. |
| `overrides: { "minimatch": "^11.0.1" }` | Rejected for now | minimatch 11 is a breaking release: it removes `makeRe()`, `Minimatch#regexp`, the `AST` class and several methods, and changes trailing-slash matching. eslint, typescript-eslint and vsce all declare `^10`. Forcing 11 under them risks silent lint or packaging misbehaviour. |
| Wait for upstream ranges that allow `minimatch@^11.0.1` | **Chosen** | No exposure in the meantime, given the trusted-input analysis above. |

## Follow-up

- Re-run `npm audit` when bumping eslint, typescript-eslint or @vscode/vsce, and remove this finding once their ranges allow the fixed minimatch.
- `npm run audit:prod` must stay at 0. Any runtime finding blocks a release.
