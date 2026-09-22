---
name: data-quality-multipass
multipass_desc: "Review counter_cache, confidence scores, normalization, enrichment pipelines, denormalized fields, search index sync, and source attribution drift."
description: "-"
when_to_use: "When reviewing data quality, counter caches, denormalization, search index sync, or when the user mentions data quality, consistency, or enrichment."
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

# Data Quality Review

Entity data has been touched by too many hands. Counters cached for performance that no longer match reality. Confidence scores that once meant something, now just cargo-culted through layers. Normalization that was supposed to unify, instead fracturing into subtle duplicates. Enrichment pipelines that ran once and were never run again.

## Scope

- Review diffs by default, or the named file, path, or whole repo when scope is expanded.
- Focus on data access layers: models, repositories, services, enrichment jobs, denormalization logic.
- Watch for counter caches, confidence/computed fields, normalization pipelines, source attribution metadata.
- The guiding question: **Does the data still mean what we think it means?**

## What Drift Looks Like

**Counter caches that lie** - `comments_count` stored on a post, but the actual `COUNT(*)` diverged. Jobs that increment/decrement without transactional safety. Soft-deletes that forgot to update the counter. Batch imports that bypass the model layer entirely.

**Confidence score decay** - Scores that should be monotonic (only increase with more evidence) but jitter or decrease without cause. Thresholds hardcoded for a dataset that's grown 10x. Ensembles that combine scores without calibration. Confidence that's actually just a proxy for "we've seen this before."

**Normalization that creates duplicates** - Case folding that ignores locale (`Istanbul` vs `istanbul` vs `ISTANBUL`). Trimming whitespace that creates `foo ` and `foo` as distinct keys. Unicode normalization forms (NFC vs NFD) that fracture identity. "Canonical" forms that weren't canonical enough.

**Source attribution that goes dark** - `source_id` fields that reference systems turned off years ago. Provenance chains that dead-end. Enrichment jobs that overwrite `updated_at` without preserving `original_source`. Data that arrived through backfill but looks like it was user-submitted.

**Stale enrichment** - Computed fields calculated once and never refreshed. External API lookups that failed silently and left nulls that were later treated as "not applicable." Denormalized fields that should be recomputed on every change but are only computed on create.

**Index vs database schizophrenia** - Search indices (Elasticsearch, Algolia) that drift from the source of truth. Background sync jobs that queue but never process. Partial updates that succeed in Postgres but fail in the index, leaving them permanently out of sync until a full reindex.

## Workflow

1. Trace the data flow: where does it come from, what touches it, where does it land?
2. For counter caches: compare cached vs computed. Look for code paths that bypass increment/decrement hooks.
3. For confidence scores: check monotonicity constraints, calibration assumptions, and what "confidence" actually means in context.
4. For normalization: apply the transformation twice - does it stay stable? (idempotency)
5. For source attribution: follow the provenance chain to its end. Does the source still exist?
6. For enrichment: find the last refresh timestamp. Is that acceptable for this data's decay rate?
7. For index consistency: identify the sync mechanism and look for failure modes that create permanent drift.

## Guardrails

- Data quality issues are often systemic. Fix the root cause, not just the symptom.
- Counter cache recalculations are expensive - recommend batched background jobs, not synchronous recounts.
- Normalization changes affect identity - consider deduplication and merge implications before changing rules.
- Confidence score changes can flip ranking and filtering logic - treat as a schema change.
- Some drift is acceptable. Not every counter needs to be exact. When the business consistency requirement is unclear, default to "eventual consistency within one background job cycle" and flag the assumption.

### Example Findings

**[high] app/models/project.rb:45** — `task_count` counter cache drifted from actual count by 12%
- **What:** `Project#task_count` uses `counter_cache: true` but recent bulk operations (`update_all(status: :done)`) bypass ActiveRecord callbacks, leaving the counter stale. A manual count shows 847 tasks vs `task_count` of 751.
- **Why it matters:** The dashboard displays stale counts to users. Billing calculations based on `task_count` undercharge. The drift widens over time as more bulk operations run.
- **Fix:** Run `Project.find_each { |p| Project.reset_counters(p.id, :tasks) }` to recalculate. Add a scheduled job to verify counter accuracy, or switch to a live count for billing-critical paths.

**[medium] app/services/search_indexer.rb:34** — enriched fields indexed but never refreshed when source data changes
- **What:** `SearchIndexer.enqueue(record)` runs on create but not on update. When a user changes their display name, the search index still shows the old name until the next full reindex (weekly).
- **Why it matters:** Users searching for a renamed contact can't find them. The stale index creates a confusing experience that erodes trust in search quality.
- **Fix:** Add a callback or sidekiq job that re-indexes the record after update: `after_commit -> { SearchIndexer.enqueue(self) }, on: :update`.

## Output Template

- Scope:
- Confirmed drift (counters, scores, stale enrichment):
- Identity fractures (normalization, dedup, attribution):
- Index-vs-source consistency:
- Not reviewed:
