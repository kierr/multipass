---
name: docs-drift-multipass
multipass_desc: "Verify that READMEs, docs, examples, runbooks, and inline comments still match current code, config, tests, schemas, and runtime behavior."
description: "-"
when_to_use: "When reviewing documentation for code drift, stale READMEs, outdated examples, or when the user mentions docs, README, or documentation accuracy."
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

# Docs Drift Review

Compare documented claims against the strongest local source of truth, then report only actionable drift and documentation maintenance debt.

## Scope

- Review `README*`, `docs/`, inline comments, generated specs, sample configs, migration notes, runbooks, changelogs, onboarding guides, and other long-form documentation in scope.
- Compare them with code, tests, schemas, CLI help text, route definitions, config structs, defaults, scripts, fixtures, and other implementation evidence.
- Prefer the narrowest relevant scope. If the user names files or a feature area, stay there first.
- Treat documentation review as both a correctness check and a maintenance-cost check. Ask whether each doc earns its upkeep.

## Workflow

1. Build an inventory of docs in scope and the concrete claims each one makes.
2. Find the strongest source of truth for each claim in code, tests, schemas, CLI help, fixtures, or generated artifacts.
3. Classify issues precisely:
   - `stale`
   - `missing`
   - `contradictory`
   - `misleading example`
   - `dead reference`
   - `drift-prone`
   - `duplicate of discoverable source`
   - `high-maintenance / low-value`
   - `remove candidate`
   - `uncertain`
4. For docs that are currently correct, assess future drift risk:
   - fast-moving internals, file paths, versions, flags, config keys, endpoints, and repo structure
   - duplicated facts repeated across multiple docs
   - hand-maintained mirrors of schemas, generated specs, CLI help, or defaults
   - procedural steps that are not exercised by tests or automation
5. Recommend the lowest-maintenance fix:
   - update the doc
   - trim it to stable intent, rationale, and invariants only
   - replace it with a link to a canonical source or generated artifact
   - delete it and rely on discovery from code, tests, schemas, scripts, or CLI help
6. Collect evidence before suggesting fixes.
7. Report high-risk drift first: broken setup steps, wrong commands, wrong config keys, incompatible examples, and misleading docs that should be removed before they drift further.

## Guardrails

- Do not rewrite docs just to improve style when they are still correct.
- Do not keep docs just because they exist. If a doc adds little unique value and mostly restates inspectable implementation details, call that out.
- Do not treat undocumented internal refactors as drift unless a user-facing artifact changed.
- Do not assume tests are authoritative when they are clearly stale; call out conflicting evidence.
- Do not infer behavior from naming alone when a real implementation path can be inspected.
- Flag generated docs separately from hand-maintained docs so the fix lands in the right place.
- Prefer source surfaces over markdown mirrors: CLI `--help`, schemas, typed config, generated specs, fixtures, and runnable examples.
- Do not recommend deletion for docs that contain unique rationale, policy, architecture decisions, operational judgment, or non-obvious workflows that are not discoverable elsewhere.
- When suggesting removal, explain what the agent should use instead.

## Useful Checks

- Compare config docs against config schemas, structs, and defaults.
- Compare README commands against actual scripts, task runners, and package or build files.
- Compare API docs against handlers, routes, request validation, and response fields.
- Compare setup instructions against current env vars, paths, and dependency versions.
- Compare examples against real fixtures and tests.
- Compare runbooks against operational scripts and deployment manifests.
- Flag docs that enumerate volatile details already discoverable from code or generated outputs.
- Flag duplicated instructions or copied tables that require parallel edits in multiple files.
- Flag narrative docs that have devolved into thin mirrors of implementation without unique user value.

```bash
rg -n "config_key|flag_name|endpoint|env var" README.md docs/ .
rg --files | rg 'README|docs|openapi|schema|config|examples'
git diff --name-only
```

### Example: drift finding

```
[stale] docs/setup.md says "Run `npm install`" but package.json
has no lockfile and mise.toml configures bun as the JS runtime.
Fix: Replace with "Run `bun install`" or remove the install section
and point to mise.toml as the source of truth.
```

Use repository-native validation commands when they exist. A smoke test or CLI `--help` output is stronger evidence than a guess.

## Output Template

- Scope:
- Confirmed drift:
- Drift-prone but currently correct docs:
- Removal or replacement candidates:
- Unverified claims:
- Recommended doc actions:
- Suggested generation, validation, or discovery improvements:
