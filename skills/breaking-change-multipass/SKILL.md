---
name: breaking-change-multipass
multipass_desc: "Gate diffs, releases, and migrations for backward-compatibility risk across APIs, CLI flags, config keys, data formats, events, and automation."
description: "-"
when_to_use: "When reviewing diffs, releases, or migrations for backward compatibility risks, or when the user mentions breaking changes, deprecations, or version compatibility."
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

# Breaking Change Review

Review a change set with one question: what can break for existing users and integrations.

## Scope

- Identify user-visible surfaces touched by the diff: API contracts, CLI commands and flags, config keys, file formats, webhooks or events, data schemas, and behavior expectations.
- Include operational and workflow breaks, not only compile-time breaks.

## Workflow

1. Enumerate interface changes in the diff.
2. Compare old and new behavior for each interface.
3. Classify each finding:
- hard break: existing usage fails
- soft break: behavior still works but meaning changes
- latent break: works now but breaks on upgrade or edge cases
4. Recommend mitigation: alias, fallback, compatibility shim, migration guide, staged deprecation, or version bump.

## Common Breaking Patterns

- Removal or rename of commands, flags, endpoints, or keys
- Stricter validation that rejects previously valid input
- Default changes that alter behavior without explicit opt-in
- Output format changes consumed by scripts or downstream parsers
- Error code or error payload changes used by clients
- Ordering, timing, or retry semantics changed in integrations

## Guardrails

- Do not call internal refactors breaking unless external behavior changed.
- Do not ignore undocumented but de facto behavior relied upon by clients.
- Do not assume additive fields are harmless if clients use strict decoding.
- Separate "breaking by design" from accidental regressions.
- Contract drift across docs, schemas, tests, and SDKs (ongoing drift, not release-gating a diff) is `api-contract-multipass`'s domain. If a finding touches it, report the finding here with `api-contract-multipass` noted in the triage entry — do not defer or hand it off; running that lens is the human's routing decision.

## Useful Checks

```bash
git diff --name-only <base>...<head>
git diff <base>...<head>
rg -n "deprecated|compat|migration|v1|v2|legacy|alias|fallback"
```

Use release notes, changelog entries, and integration tests as evidence when present.

### Example Findings

**[high] app/controllers/api/v2/users_controller.rb:12** — removed `username` field from response without version bump or deprecation window
- **What:** The v2 API response previously included `username` alongside `email`. A refactor removed it because "nobody uses it." No deprecation header was sent, no migration period was provided.
- **Why it matters:** Three downstream services deserialize `username` from the response. Removal causes `KeyError` / `undefined method` in production consumers with no graceful fallback.
- **Fix:** Re-add `username` to the v2 response with a `Deprecated` header. Announce removal in v3. Add integration tests that assert on the response schema consumed by downstream services.

**[medium] lib/sdk/client.rb:45** — changed default timeout from 30s to 5s without documenting the behavioral change
- **What:** The SDK client's default `timeout` was reduced from 30 to 5 seconds. The changelog says "minor config cleanup" with no mention of the timeout change.
- **Why it matters:** Consumers with latency-sensitive workflows (file uploads, bulk operations) now timeout unexpectedly. The change is invisible to consumers who don't pin defaults.
- **Fix:** Document the timeout change in the changelog with migration guidance. Consider making the change opt-in via a minor version bump rather than a patch.

## Output Template

- Surfaces reviewed:
- Hard breaks:
- Soft breaks:
- Latent breaks:
- Mitigations required before release:
- Items safe to ship now:

Bias toward preventing surprise outages during upgrades.
