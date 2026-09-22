---
name: caching-correctness-multipass
multipass_desc: "Review caching correctness — invalidation logic, TTL consistency, stale reads, stampede protection, key collisions, serialization drift across HTTP, CDN, ORM, and application-level caches."
description: "-"
when_to_use: "When reviewing caching logic, cache invalidation, TTL policies, stale data risks, or when the user mentions cache, memoization, or invalidation."
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
| `critical` | Exploitable vulnerability, data loss, or production breakage | Stale cache serving incorrect auth decisions, cache poisoning via key collision |
| `high` | Likely bug that affects correctness under normal usage | Missing invalidation on write, thundering herd causing cascade failure |
| `medium` | Quality issue that could cause problems under specific conditions | Inconsistent TTL across cache layers, missing stampede protection |
| `low` | Minor improvement — style, naming, dead code | Inconsistent cache key naming, redundant cache layers |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Invalidation verification:** Trace the write path from mutation to cache invalidation. Confirm the invalidation fires on ALL write paths — not just the happy path. Check that the invalidation targets the correct key (not a key that happens to overlap due to naming collision). Verify the invalidation happens BEFORE or atomically with the write, not after (which allows a stale-read window).

**Consistency verification:** When claiming TTL inconsistency, confirm both layers actually serve the same data. Caches with different TTLs serving different data shapes are not inconsistent — they're different caches. Only flag when the same logical data has different expiry windows across layers that serve the same consumers.

**Stampede verification:** Confirm the cache is actually under concurrent access. A cache with a single writer and single reader doesn't need stampede protection. Flag missing protection when the access pattern is concurrent, not as a blanket rule.

**Serialization verification:** When claiming serialization drift, confirm the reader and writer use the same serialization format. Check for version skew — is the writer newer than the reader? Does the schema allow backward-incompatible changes?

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Caching Correctness Review

Caching is the architecture's most dangerous abstraction: it's invisible when correct and catastrophic when wrong. This lens reviews caching as a cross-cutting concern across all cache layers — HTTP, CDN, application-level, ORM/session, and distributed stores (Redis, Memcached). Redis-specific correctness (Lua scripts, key schemas, connection pools) is owned by `redis-multipass`; this lens focuses on the caching semantics that exist above and beyond any single store.

## Scope

- Cache invalidation logic: write-through, write-behind, explicit invalidation, TTL-based expiry
- TTL consistency across cache layers serving the same data
- Stale-read tolerance: how long is stale data acceptable, and is the TTL configured to match?
- Stampede / thundering herd protection: what happens when a hot key expires under load?
- Cache key design: collision risk, namespace isolation, versioning strategy
- Serialization format stability: can the cache survive a deployment that changes the serialized shape?
- Distributed cache consistency: multi-node invalidation, eventual consistency windows
- Cache-aside vs cache-through correctness: who owns the write, who owns the invalidation?

## The Silent Killers

**The invalidation that doesn't fire on the error path** — The happy path invalidates the cache after a write. But the error handler returns early, rolls back the DB, and leaves the stale entry. Now the cache holds data that contradicts the DB — and it'll stay there until the TTL expires, which might be hours. Every cache invalidation must be audited against ALL code paths that modify the underlying data, not just the primary success flow.

**TTL mismatch across layers** — The CDN cache has a 1-hour TTL. The application cache has a 5-minute TTL. The ORM query cache has no TTL (lives until process restart). A write invalidates the application cache but not the CDN. The CDN continues serving stale data for 55 more minutes. The user sees old content, refreshes, sees new content, refreshes again and sees old content again. Invalidation must cover ALL layers that cache the same logical data, or the shortest TTL must be a bound on staleness.

**Thundering herd on a hot key** — A popular resource is cached with a 60-second TTL. At 10K QPS, when the key expires, 10K requests simultaneously miss the cache and all hit the database. The database, designed for 500 QPS, goes down. The fix is stampede protection (lock per key, single-flight pattern, or probabilistic early expiry) — but it's never added because "caching solved the load problem."

**Serialization drift across deployments** — The cache stores JSON blobs with schema v1. A deployment changes the schema to v2. Now half the fleet reads v2 and writes v2, half reads v1 and writes v1. Deserialization errors cascade. The cache never considered that the serialized shape is a contract that survives deployments.

**Key collision via poor namespacing** — Two subsystems cache user data. One uses `user:{id}`, the other uses `user:{id}`. They store different shapes. When subsystem B reads subsystem A's cache entry, deserialization fails silently or returns wrong-typed data. Key namespaces must include the data shape or cache owner, not just the entity ID.

**Read-through with no fallback** — A cache miss calls the database. The database is slow. The cache miss now takes 5 seconds instead of 5ms. Under load, this cascades: cache expires, flood of slow DB queries, more timeouts, more cache misses. The read-through path needs a fallback (stale-while-revalidate, circuit breaker, or hard timeout) to prevent cascade failure.

## Workflow

1. Map all cache layers: identify every caching mechanism (HTTP headers, CDN config, application cache, ORM cache, distributed store). Build a layer map.
2. For each cached entity, trace the invalidation path: what triggers invalidation, does it fire on ALL write paths, does it cover ALL layers?
3. Check TTL consistency: for entities cached at multiple layers, are TTLs consistent with the acceptable staleness window?
4. Audit stampede protection: for hot-path caches, is there protection against thundering herd on expiry?
5. Review cache key design: namespace isolation, collision risk, versioning strategy for schema evolution.
6. Check serialization stability: are cached formats versioned? Can a deployment cause format drift?
7. Verify distributed consistency: multi-node invalidation mechanisms, replication lag tolerance, split-brain scenarios.

## Guardrails

- This lens reviews caching correctness, not cache performance. Performance is owned by `performance-multipass`. Redis-specific store correctness is owned by `redis-multipass`.
- Not every cache needs stampede protection. Apply the check where access patterns are concurrent and hot keys are plausible.
- TTL inconsistency is only a finding when the same logical data is served with conflicting staleness windows to the same consumers. Different data at different TTLs is fine.
- Distinguish between "this cache could be wrong" (unverified) and "this cache IS wrong" (traced invalidation failure). Only the latter is a confirmed finding.
- Cache invalidation is famously "one of the two hard problems." Prefer concrete findings over theoretical concerns. "The write path at line X doesn't invalidate the cache" beats "this caching strategy is fragile."

## Useful Checks

```bash
rg -n "cache|Cache|CACHE|fragment|expire|invalidate|bust|purge|stale|fresh" -i
rg -n "read_through|write_through|write_behind|cache_aside|memoize|memoization" -i
rg -n "stale_while_revalidate|must_revalidate|no_cache|no_store|max.age|s.maxage" -i
rg -n "thundering.herd|stampede|lockout|single_flight|singleflight|coalesce" -i
rg -n "ETag|If-None-Match|If-Modified-Since|Last-Modified|Vary" -i
rg -n "fragment_cache|Russian.doll|key_rotation|cache_key|cache_version" -i
rg -n "Rails.cache|ActiveSupport::Cache|cache_store|Memcached|Dalli" -i
rg -n "Cache-Control|X-Cache|Surrogate-Key|Fastly|CloudFront|Cloudflare" -i
```

### Example Findings

**[critical] app/models/user.rb:45** — password change does not invalidate session cache, allowing stale auth for TTL duration
- **What:** `User#update_password` hashes the new password and saves it to the DB but does not invalidate the session cache keyed on `session:user:{id}`. The session cache has a 4-hour TTL. Any existing session continues to authorize with the old password hash until the cache entry expires naturally.
- **Why it matters:** After a password reset or compromise response, the compromised session remains valid for up to 4 hours. This is a security vulnerability — the stated purpose of password rotation is not achieved.
- **Fix:** Add `Rails.cache.delete("session:user:#{id}")` in the password update method, after the DB write succeeds. Consider also rotating the session token itself.

**[high] app/services/product_catalog.rb:78** — cache stampede on popular product pages under high traffic
- **What:** `ProductCatalog.find(id)` uses `Rails.cache.fetch("product:#{id}", expires_in: 5.minutes)` with no stampede protection. At 5K QPS on popular products, cache expiry causes all concurrent requests to hit the database simultaneously.
- **Why it matters:** During traffic spikes (flash sales, marketing pushes), the database receives 5K simultaneous queries for the same product. This has caused two production outages in the last quarter (see incident reports INC-442, INC-507).
- **Fix:** Add a `race_condition_ttl` (Rails) or implement a single-flight pattern: `Rails.cache.fetch(key, expires_in: 5.minutes, race_condition_ttl: 10.seconds)`. This allows one request to regenerate while others serve the stale value for 10 additional seconds.

**[medium] config/initializers/caching.rb:12** — CDN TTL (1 hour) exceeds application cache TTL (5 minutes) for user profile data
- **What:** User profiles are cached in the application layer with a 5-minute TTL but the CDN `Cache-Control: s-maxage=3600` serves the same data for 1 hour. Profile updates invalidate the application cache but not the CDN cache.
- **Why it matters:** Users who update their profile see changes after 5 minutes on direct hits but up to 1 hour on CDN-served requests. The inconsistency is visible to the user and generates support tickets.
- **Fix:** Either reduce the CDN TTL to match the application TTL, or add a CDN invalidation call (Surrogate-Key purge) on profile update.

## Output Template

- Scope:
- Invalidation gaps (write paths missing cache busting):
- TTL consistency issues (same data, different staleness windows):
- Stampede risks (hot keys without protection):
- Key design issues (collision risk, poor namespacing):
- Serialization stability risks (format drift across deployments):
- Distributed consistency gaps (multi-node invalidation):
- Not reviewed:
