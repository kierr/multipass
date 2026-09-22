---
name: debt-multipass
multipass_desc: "Audit for actionable technical debt — dead abstractions, stale workarounds, abandoned experiments, recurring maintenance drag, refactor priorities."
description: "-"
when_to_use: "When auditing for technical debt, dead abstractions, stale workarounds, or when the user mentions tech debt, cleanup, or maintenance drag."
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

# Debt Review

Review technical debt that is already costing time, reliability, or roadmap flexibility.

## Scope

- Review diffs by default, or the named file, path, or repo slice when scope is expanded.
- In diff mode, focus on debt introduced or meaningfully worsened by the change.
- If the user does not narrow scope and `git diff HEAD` is empty, use the shared Git fallback hierarchy before falling back to a prioritized high-churn slice.
- Read full files in scope plus the closest supporting modules before judging whether debt is real.
- Prefer present-day maintenance drag over abstract "code health" commentary.
- Use this for repo hygiene or cleanup audits when the concern is stale leftovers and recurring drag more than layout or correctness.

## References

- [references/debt-signals.md](references/debt-signals.md)

## Workflow

1. Decide whether the request is about change review or backlog triage.
2. Build a short candidate list from code, config, tests, migration artifacts, scripts, and recent churn.
3. Classify each candidate by the kind of drag it creates:
   - recurring change friction
   - migration or compatibility debt
   - boundary or ownership drift
   - dead or orphaned code paths
   - abandoned experiments or stale debug artifacts still burdening the tree
   - operational or tooling debt with direct developer cost
4. Keep only debt where the interest is already visible: repeated edits, fragile invariants, stale bridges, or blocked planned work.
5. Prioritize the shortlist by current cost, blast radius, and deletion or simplification leverage.
6. Recommend the smallest incremental paydown step, not a rewrite, unless incremental repair is clearly impossible.
7. When a narrower lens is the real issue, say so: name the `*-multipass` skill that owns it in the triage entry rather than duplicating its finding here.

## Guardrails

- Do not turn every TODO, FIXME, or older pattern into a finding.
- Do not recommend rewrites without concrete evidence that incremental repair will not work.
- Do not treat version freshness alone as tech debt; use `dependency-multipass` or `security-multipass` when those are the real concerns.
- Do not drift into pure bug hunting, docs drift, or test coverage review unless they create clear maintenance drag. Over-abstraction or speculative generality without maintenance cost is `complexity-multipass`'s domain.
- Findings that touch a sibling lens's domain are still reported here with that lens named in the triage entry — do not defer or hand them off. Running another lens is the human's routing decision.
- Respect explicit preservation comments (`DO NOT REMOVE`, `DO NOT DELETE`, `KEEP`, or similar annotations). Never flag annotated-to-keep code as debt or recommend its removal — the annotation is the requirement, not the debt.
- Prefer no finding over vague statements about "code health."
- Distinguish debt worth paying now from debt that is an acceptable temporary tradeoff.

## Useful Checks

```bash
git diff HEAD
git log --format= --name-only | sort | uniq -c | sort -rn | head -20
rg -n "TODO|FIXME|XXX|deprecated|legacy|temporary|compat|shim|workaround|remove after|cleanup" .
rg -n "eslint-disable|@ts-ignore|@ts-expect-error|type: ignore|nolint" .
```

Use repo-native tests, import graphs, or ownership tools when they give stronger evidence than text search.

### Example Findings

**[high] app/models/legacy_import.rb:1-180** — dead import adapter with zero callers and 3 TODOs referencing a completed migration
- **What:** `LegacyImport` has no call sites in production code. It contains three `TODO: remove after migration` comments dated 6 months ago. The migration it supported is closed and deployed.
- **Why it matters:** Every developer touching the import directory reads this file to determine if it's relevant. The class pulls in `legacy_api_client` which itself has 4 deprecated methods, creating cascading dead weight.
- **Fix:** Delete `legacy_import.rb` and its test file. Remove the `legacy_api_client` dependency if no other code uses it.

**[medium] config/initializers/feature_flags.rb:8** — shim redirecting `Features.enabled?` to `Flipper.enabled?` used by 3 callers after migration completed
- **What:** `Features.enabled?` was a shim layer during the Flipper migration. The migration finished 2 months ago and all callers now import Flipper directly — except 3 files that still call the shim.
- **Why it matters:** The shim adds indirection every time someone reads the call site, requiring a hop to understand what `Features` actually does. It also prevents removing the `FeatureFlag` module entirely.
- **Fix:** Update the 3 remaining callers to use `Flipper.enabled?` directly, then delete the `Features` shim and its initializer.

## Output Template

- Scope:
- Confirmed debt worth paying now:
- Debt acceptable to defer:
- Prioritized cleanup backlog:
- Evidence of recurring drag:
- Suggested incremental fixes:
- Lenses not fully reviewed:

Keep the backlog short. For each retained item include the category, why it matters now, an effort guess, and the first incremental step.
