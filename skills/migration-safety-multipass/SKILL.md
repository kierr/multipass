---
name: migration-safety-multipass
multipass_desc: "Review database migration execution strategy — zero-downtime compatibility, lock risk on large tables, rollback plans, expand-contract correctness, and data migration safety."
description: "-"
when_to_use: "When reviewing database migrations, schema changes, data migrations, or when the user mentions migrations, schema changes, or rollback."
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
| `critical` | Migration will cause data loss, extended downtime, or unrecoverable state | Dropping column with data still being read, irreversible data destruction |
| `high` | Migration will cause table lock, timeout, or partial failure in production | ADD NOT NULL without default on large table, missing statement timeout |
| `medium` | Migration is risky under specific conditions (table size, traffic pattern) | Expand-contract pattern skipped but table is small, missing rollback documentation |
| `low` | Migration hygiene or documentation gap | Missing migration comment, inconsistent naming |
| `unverified` | Plausible but not confirmed against primary source | Risk depends on unknown table size or traffic pattern |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Lock verification:** Trace the DDL operation to its lock type (AccessExclusiveLock, ShareRowExclusiveLock, etc.). Verify the lock is held for the entire operation, not just part of it. Check whether concurrent reads/writes are blocked and for how long. Estimate row count to assess duration.

**Reversibility verification:** Can this migration be reverted without data loss? If the `down` method exists, does it restore the previous state or only undo the structural change? Does reversal depend on data that was destroyed by the forward migration?

**Multi-step verification:** When a migration is part of a deploy sequence, trace the full sequence. Does the app code deployed alongside this migration still work with both the old and new schema? Are there intermediate states where the app is incompatible with the database?

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Migration Safety Review

Review database migration execution strategy for zero-downtime deploy compatibility, lock risk, rollback feasibility, and data integrity.

## Scope

- Review migration files, deploy scripts, and ORM migration classes for execution safety.
- Focus on operations that lock tables, destroy data, or create forward-only states.
- Include multi-step deploy sequences (expand-contract), data migrations, and rollback paths.
- The guiding question: **Can this migration be deployed to production without downtime, and can it be safely reversed?**

## The Silent Killers

**The table lock** — `ALTER TABLE` on a high-write table holds an AccessExclusiveLock, blocking all reads and writes for the duration. Adding a column with a default value, changing a column type, or adding a constraint can lock the table for minutes on large tables. The migration looks harmless in development with 100 rows; it's catastrophic in production with 100 million.

**The NOT NULL cliff** — adding `NOT NULL` without a default to a populated table forces PostgreSQL to rewrite every row (MySQL too). The migration appears instant with test data. On production, it's an outage.

**The irreversible rename** — renaming a column or table in one step breaks all running app instances that reference the old name. The deploy window is the risk window: any instance still using the old schema crashes.

**The expand-contract skip** — dropping a column that code still reads, removing a table still referenced in models, changing a type without an intermediate nullable phase. The correct pattern is: add new → migrate data → deploy code reading new → remove old. Skipping steps causes instant errors.

**The data migration bomb** — data migrations that process every row in a transaction. One failure rolls back the entire operation. With millions of rows, the transaction holds locks long enough to starve other queries.

**The silent FK lock** — adding a foreign key constraint validates all existing rows by default (`VALIDATE CONSTRAINT` is implicit). On large tables this means a full table scan under lock. The safe pattern is `NOT VALID` + separate `VALIDATE CONSTRAINT` outside a transaction.

**The rollback void** — migrations with no `down` method, or where `down` restores structure but not data. A column drop destroys data that `down` cannot recreate. A data transformation (`UPDATE` all rows) has no meaningful reverse.

**The deploy ordering trap** — migration runs before new code deploys, but the migration removes a column the old code still reads. Or new code deploys before migration runs, but the code expects a column that doesn't exist yet.

## Workflow

1. **Identify all migration files in scope.** Look for `db/migrate/`, `migrations/`, `alembic/versions/`, `prisma/migrations/`, or framework-equivalent directories. Also check for raw SQL migrations and data migration scripts.
2. **Classify each migration operation.** Map every DDL and DML statement to its lock type and risk profile:
   - Safe: `CREATE TABLE`, `CREATE INDEX CONCURRENTLY`, `ADD COLUMN nullable`, `ADD COLUMN with static default`
   - Moderate: `ADD INDEX` (non-concurrent), `ADD FK NOT VALID`, `ADD CHECK NOT VALID`
   - Dangerous: `ALTER COLUMN TYPE`, `ADD NOT NULL`, `DROP COLUMN`, `DROP TABLE`, `RENAME COLUMN`, `ADD FK` with validation
3. **Assess table size and traffic context.** Use `pg_class.reltuples`, `information_schema.tables`, or ORM row counts to estimate impact. A dangerous migration on a table with 100 rows is different from 100 million.
4. **Trace the deploy sequence.** If multiple migrations run in sequence, or if app code deploys alongside migrations, verify compatibility at each intermediate state. Check for expand-contract pattern adherence.
5. **Evaluate rollback feasibility.** Does `down` exist? Does it restore data or just structure? Would rollback require data restoration from backup?
6. **Check for data migration safety.** Are data transformations batched? Are they wrapped in transactions that could hold locks? Is there idempotency for re-runs after partial failure?
7. **Verify statement timeouts.** Migrations should run with explicit `statement_timeout` set. Without it, a long-running migration can block replication, consume connections, or exhaust lock space.

## Guardrails

- Lock risk is table-size dependent. Qualify all lock findings with estimated table size or row count. A finding that's `critical` on a 50M-row table may be `medium` on a 1K-row table.
- Expand-contract pattern is not required for small tables or zero-downtime-tolerant deploys. Assess the tradeoff against operational reality.
- Framework-specific safety helpers (e.g., Rails `strong_migrations`, Django `RunPython`, ZeroDowntimeMigrations gem) reduce but don't eliminate risk. Check whether they're used correctly, not just whether they're present.
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. Migrations that wrap everything in a transaction (Django's default) will fail. Check framework transaction settings.
- Migration safety is inherently probabilistic — you're estimating risk, not guaranteeing safety. Frame findings as risk assessments with concrete mitigation steps.
- Distinguish between structural problems (will cause issues in production) and best-practice recommendations (would be safer).

## Useful Checks

**PostgreSQL-specific:**
- `pg_class.reltuples` for table row estimates
- `pg_locks` for understanding lock types
- `CREATE INDEX CONCURRENTLY` for non-blocking index creation
- `ALTER TABLE ... VALIDATE CONSTRAINT` for split FK validation
- `SET LOCAL statement_timeout` for per-migration timeouts

**MySQL-specific:**
- `INFORMATION_SCHEMA.TABLES.TABLE_ROWS` for estimates
- `ALTER TABLE ... ALGORITHM=INPLACE` for online DDL
- `pt-online-schema-change` or `gh-ost` for large table migrations
- `lock_wait_timeout` for migration session settings

**Rails-specific:**
- `strong_migrations` gem for automatic safety checks
- `migrate` with `disable_ddl_transaction!` for concurrent index creation
- `change_table` bulk mode for reducing lock duration
- `ActiveRecord::Migration[7.1].disable_ddl_transaction!` pattern

**Django-specific:**
- `RunPython` vs `RunSQL` for data migrations
- `database_operations` / `state_operations` split for multi-step
- Transaction behavior: Django wraps migrations in transactions by default — `CREATE INDEX CONCURRENTLY` requires `Atomic(False)`

### Example Findings

**[critical] db/migrate/20240315120000_drop_user_settings.rb:3** — dropping column still read by deployed code
- **What:** `remove_column :users, :settings, :jsonb` removes the `settings` column in a single-step migration. The current deployed code reads `User#settings` in the profile controller.
- **Why it matters:** Any app instance running old code will raise `ActiveModel::MissingAttributeError` after migration runs. The deploy window creates a gap where the column is gone but code still references it.
- **Fix:** Use expand-contract: (1) deploy code that stops reading `settings`, (2) run migration to drop column, (3) verify no references remain. Or ignore the column in models first with `self.ignored_columns = [:settings]`.

**[high] db/migrate/20240315120000_add_not_null_to_users.rb:4** — adding NOT NULL without default to potentially large table
- **What:** `change_column_null :users, :email, false` adds a NOT NULL constraint. If any `users` rows have `email IS NULL`, the migration fails. On a large table, PostgreSQL must scan every row while holding a lock.
- **Why it matters:** Table scan under lock blocks writes for the duration. If the table has millions of rows, this is minutes of blocked writes. If any NULLs exist, the migration fails and the deploy blocks.
- **Fix:** (1) Add a default or backfill NULLs first: `User.where(email: nil).update_all(email: '')`, (2) Add constraint as NOT VALID: `execute "ALTER TABLE users ADD CONSTRAINT email_not_null CHECK (email IS NOT NULL) NOT VALID"`, (3) Validate separately: `execute "ALTER TABLE users VALIDATE CONSTRAINT email_not_null"`, (4) Convert to real NOT NULL.

**[medium] db/migrate/20240315120000_add_fk_orders_users.rb:5** — FK validation will scan full orders table under lock
- **What:** `add_foreign_key :orders, :users` validates all existing rows by default. On a large `orders` table this holds a ShareRowExclusiveLock for the full scan duration.
- **Why it matters:** ShareRowExclusiveLock blocks `INSERT`, `UPDATE`, and `DELETE` on `orders`. The scan duration scales linearly with row count.
- **Fix:** Add as `VALIDATE CONSTRAINT` in two steps: `add_foreign_key :orders, :users, validate: false` (instant), then `validate_foreign_key :orders, :users` in a separate migration (holds ShareRowExclusiveLock but is documented and can be scheduled).

## Output Template

- Scope:
- DDL operations and lock risk:
- NOT NULL and constraint additions:
- Expand-contract pattern adherence:
- Data migration safety:
- Rollback feasibility:
- Deploy ordering concerns:
- Not reviewed:
