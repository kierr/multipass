---
name: schema-multipass
multipass_desc: "Review database schema for index coverage, FK integrity, column types, normalization quality, and migration safety."
description: "-"
when_to_use: "When reviewing database schema, indexes, foreign keys, migrations, or when the user mentions schema, indexes, or database design."
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

# Schema Review

Review database schema for structural soundness, query-path efficiency, and safe evolution.

## Scope

- Review schema definitions, migrations, and ORM models for structural concerns.
- Focus on decisions that affect data integrity, query performance, and operational safety.
- Include index strategy, constraint coverage, type choices, and normalization boundaries.
- The guiding question: **Will this schema survive real data, real traffic, and real changes?**

## What Shapes Schema Problems

**The silent table scan** — FK columns without indexes, queries that look simple but touch every row, join tables that force the planner into nested loops because nothing is indexed.

**The phantom constraint** — columns that should reference other tables but have no FK, cascade rules that silently delete or orphan data, unique constraints that exist in code but not in the database.

**The type mismatch** — storing structured data as text that should be JSONB, using strings where integers belong, varchar limits that are too tight or meaninglessly large, timestamps without timezone awareness.

**The unindexed JSONB** — querying JSON columns with `->>` operators while the planner helplessly scans the whole table, missing GIN indexes that would make semi-structured queries fast.

**The counter lie** — denormalized counter cache columns that drift from actual counts, race conditions in increment logic, stale values that undermine trust in the data.

**The migration cliff** — schema changes that lock tables in production, migrations without rollback paths, adding NOT NULL columns to large tables without a safe transition strategy.

**The audit gap** — tables without change tracking where it matters, missing PaperTrail or temporal coverage for compliance-sensitive data, encryption gaps for fields that hold secrets.

## Workflow

1. **Always read the schema file** (`db/schema.rb`, `schema.sql`, or equivalent) regardless of diff scope. Schema problems hide in the existing schema, not in the diff. If the diff touches a model, check that model's table for missing indexes and constraints.
2. Map the data model — tables, relationships, and the queries that traverse them.
3. Trace the query paths — where do joins happen? What columns appear in WHERE clauses? What gets sorted or grouped?
4. Check constraint coverage — are relationships enforced at the database level? Are business invariants backed by FKs and checks?
5. Evaluate type choices — do column types match the data they hold? Are they future-appropriate?
6. Assess migration safety — can this change be deployed without downtime? Is rollback possible?
7. Flag structural debt — missing indexes, orphan risks, denormalization that needs reconciliation.

## Guardrails

- Index recommendations require query evidence — suggest indexes only for columns used in lookups, joins, or filters, because unnecessary indexes slow writes and waste storage.
- Denormalization isn't automatically wrong. Accept counter caches and precomputed values when the tradeoff is intentional.
- Migration safety depends on table size and traffic patterns. Qualify recommendations with scale assumptions.
- Respect existing naming conventions and schema patterns unless they cause actual problems.
- Distinguish between structural problems (will cause issues) and stylistic preferences (would be nicer).

### Example Findings

**[high] db/schema.rb:87** — `orders.user_id` has no foreign key constraint and no index
- **What:** The `orders` table has a `user_id` column referenced in `belongs_to :user`, but no FK constraint in the schema and no index on the column.
- **Why it matters:** Without the FK, orphan orders can exist pointing to deleted users. Without the index, every order lookup by user is O(n). On a table with millions of rows, both are production-critical.
- **Fix:** Add a migration: `add_foreign_key :orders, :users` and `add_index :orders, :user_id`.

**[medium] db/migrate/20240315120000_add_settings_to_users.rb:4** — adding NOT NULL column without default to populated table
- **What:** `add_column :users, :settings, :jsonb, null: false` adds a NOT NULL column with no default value to a populated table.
- **Why it matters:** PostgreSQL must rewrite every row to add the column. On a large `users` table this locks the table for minutes. Existing rows violate the NOT NULL constraint before the migration completes.
- **Fix:** Add the column as nullable first, backfill with `User.update_all(settings: {})`, then add the NOT NULL constraint in a separate migration.

## Output Template

- Scope:
- Structural integrity (FKs, constraints):
- Index coverage gaps:
- Type and normalization concerns:
- Migration safety flags:
- Not reviewed:
