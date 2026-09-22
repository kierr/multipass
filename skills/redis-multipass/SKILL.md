---
name: redis-multipass
multipass_desc: "Review Redis code, Lua scripts, key schemas, config. Catches blocking scripts, unbounded structures, key collisions, pool mismatches, TTL leaks."
description: "-"
when_to_use: "When reviewing Redis code, Lua scripts, key schemas, connection pooling, or when the user mentions Redis, caching, or key patterns."
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

# Redis Review

Redis lies at the intersection of cache, queue, and database — and each role has different failure modes. Review for the silent killers: operations that work at low scale and block at high scale, patterns that leak memory slowly, and abstractions that hide complexity until production load arrives.

## Scope

- Redis client code: commands, pipelines, transactions, Lua scripts
- Key design: naming conventions, collision risk, cardinality assumptions
- Connection handling: pool sizing, timeout configuration, retry logic
- Infrastructure config: maxmemory policies, eviction, persistence settings
- TTL hygiene: coverage, reasonable expiration windows, orphan detection

## The Silent Killers

**Lua scripts that block** — Redis is single-threaded. A Lua script holds the event loop hostage. What looks atomic at 100 keys becomes a full-stop at 1M keys. The `KEYS` command inside Lua is the classic offender: O(N) key scanning with the world frozen.

**Sorted sets that never end** — ZRANGE with large ranges, ZSCAN assuming bounded results, leaderboards that grow forever. Sorted sets are memory-dense; unbounded ones are memory bombs.

**Key namespaces that collide** — Environment prefixes that differ by one character, tenant IDs that get concatenated without delimiters, keys that look unique until two subsystems pick the same naming scheme.

**Connection pools sized for another universe** — One connection per thread sounds right until you realize the pool is 100 but the async runtime has 1000 concurrent tasks waiting. Or the opposite: 500 connections for 8 CPU cores, each connection burning memory for the idle timeout.

**TTLs that exist in theory** — The code sets TTLs... sometimes. On the happy path. But the error path creates keys without expiration. Or the batch job that creates 10K keys daily with 1% orphaned. Six months later, memory alerts fire.

**Probabilistic structures with wrong assumptions** — Bloom filters and Cuckoo filters are magical until capacity is exceeded and false positive rates spike, or inserts start failing. The capacity decision made at deployment time doesn't age well.

## Workflow

1. Identify all Redis interactions: commands, scripts, connection handling.
2. Map key schemas and their lifecycle: creation, access patterns, expiration.
3. Check Lua scripts for blocking operations and unbounded iterations.
4. Verify connection pool sizing against actual concurrency model.
5. Audit TTL coverage: which keys have it, which don't, which paths bypass it.
6. Look for memory-unbounded structures: growing lists, sets, sorted sets, streams.

## Guardrails

- Redis performance at 1K keys is not Redis performance at 1M keys. Reason about scale.
- Distinguish between correctness bugs (race conditions, lost updates) and capacity risks (will this work at 10x load?).
- TTL hygiene is about coverage, not perfection. 95% coverage with reasonable durations beats 100% coverage with 7-day TTLs on short-lived data.
- Key naming conventions matter more as the system grows. Review with an eye toward future collision risk.
- Lua scripts are powerful but dangerous. Prefer built-in commands and transactions when possible.

## Useful Checks

```bash
rg -n "redis|Redis|REDIS"
rg -n "eval|evalsha|KEYS|SCAN"
rg -n "ttl|expire|expireat|pexpire|setex" -i
rg -n "connection.*pool|pool.*size|max.*connection" -i
rg -n "zadd|zrange|zscan|sadd|lpush|xadd"
```

### Example Findings

**[high] lib/rate_limiter.rb:23** — non-atomic check-then-increment allows burst past the rate limit
- **What:** `current = redis.get(key); redis.set(key, current + 1) if current < limit` performs a read and conditional write in two separate commands. Under concurrent requests, multiple workers read the same value before any write.
- **Why it matters:** Under load, 10 requests can all read `current = 9` and all increment to 10, allowing 10 concurrent operations when the limit is 10/minute. The rate limiter provides no actual rate limiting.
- **Fix:** Use a Lua script for atomic check-and-increment: `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return c`.

**[medium] lib/session_store.rb:12** — sessions stored without TTL, orphaned sessions accumulate indefinitely
- **What:** `redis.set("session:#{token}", data.to_json)` stores session data with no expiry. Sessions are never explicitly deleted on logout — only the client cookie is cleared.
- **Why it matters:** Over months, the session keyspace grows without bound. Redis memory usage climbs steadily. Old sessions from terminated accounts remain readable if the token is ever replayed.
- **Fix:** Add `redis.setex("session:#{token}", SESSION_TTL, data.to_json)` with a TTL matching the session lifetime. Set a shorter TTL on logout.

## Output Template

- Scope:
- Blocking and atomicity risks (Lua, KEYS, large scans):
- Capacity risks (unbounded structures, pool sizing, memory):
- Hygiene gaps (TTLs, key collisions, orphaned keys):
- Not reviewed:
