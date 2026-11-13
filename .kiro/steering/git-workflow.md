---
inclusion: always
---
# Git workflow

The agent manages Git for Graveyard Shift on its own. It may create branches, stage its own changes, commit, and merge verified work into `develop` without asking each time. Every safety rule below still applies.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Stable, release-ready code. Never commit or merge into it automatically. |
| `develop` | Integration branch for completed, verified work. |
| `feat/<name>` | New features (e.g. `feat/activity-accounting`). |
| `fix/<name>` | Bug fixes. |
| `refactor/<name>` | Internal changes without behaviour change. |
| `docs/<name>` | Documentation and spec updates. |
| `test/<name>` | Test-only improvements. |

- Branch from `develop`. Use short, descriptive kebab-case names, normally one branch per spec task (`feat/task-03-activity-accounting`).
- Never implement on `main`. Never work directly on `develop` except for `--no-ff` merges.
- If a repository has no commits, make one clean initial commit of the existing files on `main`, then create `develop`.

## Per-task loop

1. Run `git status` and check the current branch.
2. Preserve existing user changes. If unrelated changes are present, leave them unstaged and untouched, and isolate your own work. Never stash, reset or discard them.
3. Create or reuse the task branch from an up-to-date `develop`.
4. Implement the task according to `.kiro/specs/graveyard-shift/`.
5. Run `npm run verify` (typecheck, lint, tests), plus `npm run build` or `npm run package` when the task touches build or packaging.
6. Review the staged diff for unintended edits, generated files (`dist/`, `*.vsix`, `node_modules/`), secrets, personal data and unrelated changes. Stage files by name, not with `git add -A`.
7. Commit using Conventional Commits.
8. Update the task's checkbox and verification note in `tasks.md`, and commit that with the task.
9. When the task is verified, merge into `develop` with `git merge --no-ff <branch>`.
10. Re-run `npm run verify` on `develop` after the merge.
11. Continue with the next task, unless a review checkpoint says stop.

## Commits

- Format: `type(optional-scope): summary` in the imperative, lower case, without a trailing period. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `chore`, `style`, `perf`.
- Keep commits focused and reasonably small. Do not mix unrelated changes, and do not make filler commits.
- Never amend or rewrite commits that may belong to someone else, or commits already merged into `develop`.

## Integration gate

Merge into `develop` only when all of these hold:

- the task's acceptance criteria are met
- typecheck, lint and relevant tests have actually run and passed
- the diff has been reviewed and matches the approved spec
- no known regressions

Never claim a check passed unless it ran and passed. Manual checks that have not been done are reported as pending, not as passed.

## Safety rules

- No force-push. No `reset --hard`, `clean -fd`, `checkout -- .`, `branch -D` or other destructive commands on user work.
- Never commit secrets, credentials, tokens or `.env` files.
- Never merge failing or unverified work.
- Never resolve complex merge conflicts silently. Stop and report.
- Never merge or push into `main` automatically. Release merges need explicit user approval.
- Never create GitHub Actions workflows.
- Never run database seeders or destructive scripts.
- Never push to any remote unless the user explicitly authorises remote publishing.
- Do not modify Git config.

## Kiro integration

- Keep `.kiro/specs/graveyard-shift/tasks.md` current as tasks complete.
- Keep `.kiro/steering/`, `.kiro/agents/`, `.kiro/hooks/` and `.kiro/specs/` under version control. Never gitignore them.
- Respect review checkpoints in `tasks.md`. Work before a checkpoint may be committed and merged into `develop`, but do not start work past the checkpoint until the user has reviewed it.

## Reporting

After each milestone, report:

- tasks completed
- branches created and merged
- key commit hashes
- tests and checks run, with results
- known limitations and pending manual checks
- the next planned milestone
