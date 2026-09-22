---
name: outdated-multipass
multipass_desc: "Review code for outdated patterns — deprecated APIs, superseded tooling, EOL dependencies, dead links, and vintage methodology the industry has moved on from."
description: "-"
when_to_use: "When reviewing code for outdated patterns, deprecated APIs, EOL dependencies, or when the user mentions outdated patterns or legacy code."
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

# Outdated Review

Find what time has left behind. The world has changed since then — has the codebase kept up?

## Scope

- Review diffs by default, or the named file, path, or whole repo when scope is expanded.
- Scan across surfaces: code, docs, config, dependencies, URLs, comments.
- The current year is {{ now | date "2006" }}. Judge "outdated" relative to today.
- The guiding question: **Does this belong to today, or to a different era?**

## What Smells Like the Past

**Old skool patterns** — callbacks when async/await exists, var when let/const is standard, manual state management when frameworks handle it, XMLHttpRequest when fetch is universal.

**Vintage methodology** — build tooling from a previous generation (Grunt, Gulp, Bower), testing approaches superseded by modern frameworks, deployment patterns that predate containers and CI/CD.

**The world has changed** — references to services that shut down, domains that don't resolve, documentation that moved, companies that were acquired or pivoted, APIs that were deprecated or removed.

**Zombie workarounds** — fixes for bugs that were resolved upstream years ago, browser hacks for browsers nobody uses, polyfills for features with universal support.

**Dated assumptions** — security practices from before we knew better (MD5, SHA1, disabled TLS), scaling assumptions from before cloud was standard, deployment scripts that assume physical servers.

## Workflow

1. Scan the surface with your "is this current?" sense active.
2. When something smells old, verify: Is there a modern alternative? Is the old thing deprecated, EOL, or just not how we do things anymore?
3. Distinguish critical (breaking, insecure) from actionable (clear upgrade path) from informational (works but dated).
4. Recommend the modern alternative when it's unambiguous.
5. Report findings with suggested modern alternatives.

## Guardrails

- Old doesn't mean wrong. Some patterns are timeless. Require evidence the world has moved on.
- Don't chase the bleeding edge. Focus on things the industry has clearly left behind.
- Verify dead links before flagging. A URL being old doesn't mean it's dead.
- Respect preservation annotations. Some vintage code is kept deliberately.

### Example Findings

**[high] app/services/auth.rb:8** — `JWT.decode(token, nil, false)` accepts tokens with no signature verification
- **What:** The JWT decoder was configured with `verify: false` during initial development. No signature key or algorithm is configured. The code shipped to production.
- **Why it matters:** Any attacker can forge a valid-looking JWT with arbitrary claims. Authentication is theater — every protected endpoint accepts any token.
- **Fix:** Set `JWT.decode(token, hmac_secret, true, { algorithm: 'HS256' })` with the secret from the vault. Verify in staging that existing tokens still validate.

**[medium] config/database.yml:5** — `reaping_frequency` and `pool: 5` are Rails 4-era defaults carried through three upgrades
- **What:** The database config uses `reaping_frequency: nil` and `pool: 5` from a Rails 4 scaffold. Rails 7 defaults are `reaping_frequency: 60` and `pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>`.
- **Why it matters:** Without reaping, stale connections accumulate in the pool under Puma's threaded model. The hardcoded pool size ignores thread configuration changes.
- **Fix:** Remove `reaping_frequency` to accept the Rails 7 default, and switch `pool:` to the ERB template that reads from the thread count.

## Output Template

- Scope:
- Smells like the past:
- The world has changed (dead/broken):
- Old skool but functional:
- Not reviewed:
