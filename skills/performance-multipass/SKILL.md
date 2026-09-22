---
name: performance-multipass
multipass_desc: "Review performance — latency, throughput, CPU, memory, allocations, streaming overhead, hot-path inefficiencies."
description: "-"
when_to_use: "When reviewing performance, latency, throughput, memory usage, or when the user mentions performance, optimization, or speed."
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

# Performance Review

Review hot paths for real execution-cost problems.

## Scope

- Use this when latency, throughput, CPU, memory, allocations, buffering, or streaming overhead are the real question.
- Focus on work done per request, per chunk, per item, or per byte.
- Treat startup-only or rarely hit code separately from the steady-state hot path.

## Workflow

1. Map the hot path before suggesting any changes.
2. Prefer evidence: benchmarks and profiles first, or clear operation-count reasoning when measurement is absent.
3. Look for repeated parse, copy, allocation, formatting, buffering, sorting, or logging work inside hot paths.
4. Separate safe wins from risky tricks and from changes that are not performance fixes at all.
5. Report only changes that plausibly move the measured or inferred bottleneck.

## Guardrails

- Do not replace structured parsing with byte-level hacks unless input constraints are explicit and tests cover formatting variants.
- Do not recommend larger transport or socket buffers without evidence they affect the observed bottleneck.
- Timeouts are reliability controls, not throughput improvements.
- `sync.Pool` is only worth it when buffers are large, reused often, and lifetime is clearly safe.
- If the code is I/O-bound, say so. Do not invent CPU micro-optimizations to look busy.

## Useful Checks

Use the repo's native benchmark and profiling tools. Examples by ecosystem:

```bash
# Go
go test -run '^$' -bench . -benchmem ./...
go tool pprof -top cpu.out

# Python
uv run python -m cProfile -s cumtime script.py
uv run pytest --benchmark-only

# Elixir
mix run benchmarks/bench.exs

# Node/Bun
bun run bench
```

Static signals to grep for regardless of language:

- repeated parsing or decoding inside loops
- large per-request allocations or copies
- unconditional logging on hot paths
- full-body buffering where streaming would work
- repeated sort, map-build, or copy work inside request paths

**N+1 signals** — search for iteration blocks containing database calls:

```bash
# Find iteration blocks, then manually inspect bodies for DB calls
rg -n "\.each\b|\.map\b|\.select\b|\.collect\b|for\s+.*\s+in" --type ruby -A 8
rg -n "find_each" --type ruby -A 10
rg -n "for\s+.*\s+in" --type py -A 8
rg -n "\.forEach\b|\.map\b" --type ts --type js -A 8
# Check for eager loading presence in the same files
rg -n "includes\|eager_load\|preload\|joinedload\|selectinload"
```

If there is no benchmark, propose the smallest benchmark that isolates the suspected hot path before larger refactors.

### N+1 Query Detection

Identify query-in-loop patterns where each iteration triggers a separate database query instead of batching or preloading.

**Detection approach:** For each iteration block in scope (`each`, `map`, `for`, `while`, `.forEach`), check whether the body contains a database call. If so, verify the data is preloaded or the call is batched.

**Language-specific patterns:**

Ruby/Rails:
- `find_by` or `where` inside `each`, `map`, `select`, `collect`
- Association access inside iteration without `includes`/`eager_load`/`preload`: `users.each { |u| u.orders }`
- `find_each` with per-record association access not preloaded
- View/serializer accessing un-preloaded associations

Python/SQLAlchemy:
- `session.query()` inside a `for` loop
- Lazy-loaded relationship access in iteration: `for order in orders: order.user.name`

Go:
- `db.Query` / `db.QueryRow` inside `for` loops
- Individual `SELECT` per iteration instead of `WHERE id IN (...)`

JavaScript/TypeScript:
- `await` on individual query calls inside `for`/`.map()` instead of batch query or `Promise.all`
- Sequential `findById` calls instead of `findByIds` / `whereIn`

**Example finding:**

**[high] app/services/order_report_service.rb:23** — N+1 query: loads user per order in loop
- **What:** `Order.all.each { |o| o.user.name }` triggers one query per order to load the user association.
- **Why it matters:** With 10k orders, this fires 10,001 queries instead of 2. The request times out under normal data volume.
- **Fix:** Use `Order.includes(:user).all.each { |o| o.user.name }` or batch load user IDs with `where(id: ids)`.

### Example Findings

**[high] app/controllers/api/v1/reports_controller.rb:23** — report generation serializes 50k records to JSON in a single synchronous request
- **What:** The `show` action calls `Report.generate`, which queries 50,000 records, builds a Ruby array, and serializes to JSON inline. The request times out at 30 seconds on a typical dataset.
- **Why it matters:** The endpoint fails under normal load. Users retry, multiplying the load. The single-threaded serializer blocks the Puma worker for the entire duration.
- **Fix:** Move generation to a background job. Return a 202 with a polling URL. Stream results or paginate. If synchronous is required, use `as_json` with selective field loading and avoid loading full AR objects.

**[medium] app/models/user.rb:89** — `recent_orders` loads all orders and sorts in Ruby instead of using a scoped DB query
- **What:** `def recent_orders; orders.sort_by(&:created_at).last(10); end` loads every order into memory, sorts the full collection, then takes the last 10.
- **Why it matters:** A user with 5,000 orders loads all 5,000 into memory to display 10. The allocation cost scales linearly and is invisible until power users hit the endpoint.
- **Fix:** Replace with a scoped query: `orders.order(created_at: :desc).limit(10)`.

## Output Template

- Hot path:
- Safe wins:
- Risky wins:
- Non-fixes:
- Benchmark to add:
