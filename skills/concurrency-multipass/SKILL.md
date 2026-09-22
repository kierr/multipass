---
name: concurrency-multipass
multipass_desc: "Review concurrent/async code for race, deadlock, cancellation, backpressure, lifecycle, and shutdown correctness risks."
description: "-"
when_to_use: "When reviewing concurrent, async, or parallel code, or when the user mentions race conditions, deadlock, threads, or async."
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

# Concurrency Review

Review correctness under load and shutdown, not only correctness in happy-path single-thread execution.

## Scope

- Identify concurrent units: threads, goroutines, tasks, workers, channels, queues, timers, and callbacks.
- Identify shared mutable state and ownership rules.
- Identify lifecycle boundaries: startup, steady state, overload, cancellation, and shutdown.

## Workflow

1. Map concurrency model and ownership of shared state.
2. Check synchronization strategy and lock or channel discipline.
3. Verify cancellation, timeout, and context propagation.
4. Verify backpressure, queue bounds, and overload behavior.
5. Verify shutdown ordering and resource cleanup.
6. Classify risks by reproducibility and impact.

## Common Concurrency Risks

- Unsynchronized shared state access
- Lock-order inversion or lock scope too broad
- Blocking operations in critical paths
- Channel send or receive operations that can stall forever
- Goroutine or worker leaks after cancellation
- Unbounded queues, retries, or fan-out
- Partial shutdown that drops in-flight work or corrupts state

### OTP / BEAM-specific risks

- GenServer that tracks state but doesn't own the work — split responsibility where the check (GenServer.call) and the action (caller-side HTTP) are non-atomic
- GenServer calling itself recursively via direct function call instead of GenServer.call — bypasses OTP dispatch, breaks tracing/middleware
- ETS table with `:public` write access when a GenServer should serialize writes — state can diverge between GenServer state and ETS
- DynamicSupervisor child_spec using `:via` tuple as `id` but not passing it as `name` through opts — child starts but doesn't register
- Process name conflicts when starting multiple instances of a module that defaults `name: __MODULE__`
- `GenServer.call(__MODULE__, ..., :infinity)` that hangs forever if the target process dies before responding
- Supervision tree startup ordering: GenServer A depends on GenServer B but B is listed after A in the children list

## Guardrails

- Evaluate concurrency safety regardless of traffic level, because race conditions are probabilistic and low traffic only reduces frequency, not possibility.
- Require a concrete failure mode before labeling an async pattern risky, because async is often the correct design choice.
- Separate throughput tuning from correctness bugs, because they have different urgency and different fix strategies.
- Use existing invariants and tests before proposing a model rewrite, because the current design may encode domain constraints not visible in the code.

## Useful Checks

Look for concurrency primitives and shared-state patterns:

```bash
rg -n "Mutex|Monitor|Concurrent::|Thread\.new|Queue\.new|Channel\.new"
rg -n "async/await|tokio::|goroutine|sync\.Mutex|sync\.WaitGroup"
rg -n "GenServer\.(call|cast)|:ets\.insert|Agent\.update|SharedVar"
rg -n "with_lock|ActiveRecord::Base\.transaction|SELECT.*FOR UPDATE"
git diff --name-only
```

Run race detectors and stress tests where available.

### Example Findings

**[high] app/workers/batch_processor.rb:47** — shared `@results` array mutated by concurrent threads without synchronization
- **What:** `threads.map { |item| Thread.new { @results << process(item) } }.each(&:join)` pushes to a shared array from multiple threads without a mutex or thread-safe collection.
- **Why it matters:** MRI's GIL masks this in CRuby, but JRuby and TruffleRuby expose the race, causing lost or corrupted results. Even on MRI, the pattern signals incorrect concurrency intent.
- **Fix:** Use `Thread::Queue` for collection, or `Concurrent::Array`, or map-and-collect pattern: `items.map { |item| Thread.new { process(item) } }.map(&:value)`.

**[medium] lib/connection_pool.rb:23** — unbounded retry loop on connection acquisition with no backpressure
- **What:** `while conn.nil?; conn = try_acquire; sleep(0.1) if conn.nil?; end` retries forever when the pool is exhausted.
- **Why it matters:** Under sustained load, all workers pile into this loop, consuming threads that could otherwise drain the pool. No timeout means the process hangs indefinitely.
- **Fix:** Add a max-wait timeout and raise `ConnectionTimeout` when exceeded: `deadline = monotonic_now + MAX_WAIT; while conn.nil? && monotonic_now < deadline; ...; end; raise unless conn`.

## Output Template

- Concurrency surfaces reviewed:
- Confirmed correctness bugs:
- Deadlock or stall risks:
- Backpressure and overload risks:
- Shutdown and lifecycle risks:
- Recommended minimal fixes:

Prioritize deterministic behavior during overload and shutdown.
