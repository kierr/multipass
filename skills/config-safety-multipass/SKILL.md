---
name: config-safety-multipass
multipass_desc: "Review configuration behavior changes — defaults, env vars, flags, precedence, validation, reload semantics, deprecation, migration compatibility."
description: "-"
when_to_use: "When reviewing configuration behavior changes, defaults, env vars, flag precedence, or when the user mentions config, feature flags, or settings."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - LSP
---

## Review Contract

### Scope & Targeting

**When the user specifies scope** (file path, "the PR", a commit hash, "everything", a branch name), use that scope directly.

**Default scope** when the user provides no explicit scope — use the first match:

1. **Branch diff.** If on a non-default branch (not main/master), diff against the merge base: `git diff $(git merge-base HEAD origin/main)...HEAD`. This captures the full branch changeset.
2. **Working tree.** `git diff HEAD` plus untracked files (`git ls-files --others --exclude-standard`). If non-empty, use these changes.
3. **Recent commits.** If on the default branch with a clean working tree, review the last 5 commits (`git log --oneline -5`).

**Scope overrides:**
- "review the PR" / "pr review" → `gh pr view` to get the PR, then `git diff <base>...HEAD`
- "full review" / "review everything" → all source files in the repo
- Named file or directory → that path only

**Untracked files are always included in working-tree scope.**

**Argument interpretation:** `$ARGUMENTS` may contain a natural language description of what to review — anything from a file path to a focus area to a longer prompt. If arguments contain paths, narrow your search accordingly. If they describe a focus area, prioritize that surface. If arguments are empty or absent, use the default scope above.

### Review Mode

Review-only. No mutations, no fix waves, no loops.

### Core Rules

- Work from repo truth first. Separate confirmed findings from assumptions and unverified areas.
- Report every confirmed finding regardless of severity. Do not pad with unverified speculation, but do not dismiss confirmed findings because they are minor.
- Respect explicit preservation annotations in code (`DO NOT REMOVE`, `DO NOT DELETE`, `KEEP THIS`). Never recommend removal or modification of annotated-to-keep code.
- **Stranded code is not dead code.** Before flagging "dead code" or "unused code," check for `STATUS:` markers, related issues, and integration plans. Only "obsolete" (confirmed dead with no integration path) is removable.
- When another review skill is clearly needed, use only the smallest relevant set of available review lenses.
- **Low-severity findings default to actionable.** "It's just a nitpick" is not a valid reason to downgrade or omit.
- **Out-of-scope findings are reported with a suggested action** (fix/TODO/issue) in the triage table. Never silently drop a finding.

### Finding Severity

| Level | Meaning | When to use |
|---|---|---|
| `critical` | Exploitable vulnerability, data loss, or production breakage | SQL injection, auth bypass, data corruption path |
| `high` | Likely bug that affects correctness under normal usage | Race condition, wrong logic branch, missing null check on hot path |
| `medium` | Quality issue that could cause problems under specific conditions | Missing error handling, fragile test, resource leak |
| `low` | Minor improvement — style, naming, dead code | Unused import, inconsistent naming, minor simplification |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Bug verification:** Trace the full execution path to the failure, construct a concrete failure scenario, verify the operations touch the same resource or invariant, check whether the observed behavior is intentional.

**Quality verification:** Verify the issue is real: the code is harder to read, maintain, or change than it should be. Verify a concrete improvement exists (not just "this could be better"). Check that the improvement is local and safe. Check whether the pattern is intentional.

**Spec-dependent verification:** When a finding depends on how a spec, framework, or runtime behaves, verify the claimed behavior against the authoritative source. "WCAG requires X" is not a finding until verified against the spec. If you cannot verify against a primary source, flag as `[unverified]` instead of confirmed. The cost of a false positive exceeds the cost of reading a spec.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Config Safety Review

Review whether configuration can change safely without surprising operators or breaking existing deployments.

## Scope

- Map all config inputs: files, env vars, flags, remote config, and defaults.
- Map precedence and override rules.
- Map safety-critical fields: auth, network, storage, timeouts, retries, queue limits, and feature gates.
- Include validation paths and runtime reload behavior.

## Workflow

1. Build an input matrix of key, type, default, required, and source.
2. Compare docs, schema, and runtime parsing behavior.
3. Verify precedence and fallback logic.
4. Verify invalid or partial config handling.
5. Review migration and backward compatibility for renamed or removed keys.

## High-Risk Findings

- Silent behavior changes from default changes
- Key renamed or removed without alias or migration support
- Ambiguous precedence between env, flag, and file inputs
- Weak validation for unsafe values
- Reload path applies partial config without atomicity
- Secret fields logged or exposed in status endpoints

## Guardrails

- Do not treat stricter validation as safe if existing deployments can fail to start.
- Do not assume docs describe true defaults; verify in code.
- Distinguish startup-time validation from reload-time validation.
- Separate operator pain from security or correctness risk.

## Useful Checks

Look for configuration definitions and override chains:

```bash
rg -n "ENV\[|ENV\.fetch|dotenv|os\.getenv|os\.environ"
rg -n "config\.yaml|settings\.yml|application\.yml|mise\.toml|pyproject.*tool\."
rg -n "deprecated|legacy|migration|alias|fallback"
git diff --name-only
```

Run the repository config validation command when available.

### Example Findings

**[high] config/production.yml:23** — database URL contains embedded credentials with no secret rotation mechanism
- **What:** The production config contains `database_url: postgres://admin:s3cret@db.internal:5432/app` in plaintext. No vault integration, no env-var substitution.
- **Why it matters:** Credentials in config files are committed to git, readable by anyone with repo access, and not rotated automatically. A leaked config file exposes the production database.
- **Fix:** Use environment variable interpolation (`database_url: ${DATABASE_URL}`) or integrate with a secrets manager. Rotate the exposed credentials immediately.

**[medium] config/settings.yml:45** — feature flag default changed without migration for existing `false` values
- **What:** `new_dashboard` was changed from `default: false` to `default: true`. Existing records with explicit `false` values are unaffected, but the implicit assumption in code is `Settings.new_dashboard` returns `true` for all users.
- **Why it matters:** Users who were explicitly opted out via `false` are still opted out, but the team believes the flag is now universal. The code and config are out of sync.
- **Fix:** Add a migration that removes explicit `false` values if the intent is universal enablement, or document the override path.

## Output Template

- Config surfaces reviewed:
- Confirmed safety risks:
- Compatibility risks:
- Reload or runtime risks:
- Documentation drift:
- Recommended migration steps:

Prioritize safe rollout, reversibility, and operator clarity.
