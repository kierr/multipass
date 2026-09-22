---
name: data-pipeline-multipass
multipass_desc: "Review multi-stage data flows where failure at stage N+1 can orphan successful work at stage N. Catches cascading partial-failure bugs."
description: "-"
when_to_use: "When reviewing multi-stage data pipelines, failure cascades, orphaned data, or when the user mentions data pipelines, ETL, or batch processing."
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

# Data Pipeline Review

Review consume-transform-produce chains for the failure modes that only emerge when stages are connected. A single stage can be correct in isolation but still create data loss, corruption, or unbounded accumulation when piped into the next.

## Scope

- Identify pipeline stages: consumers, producers, transformers, queues, workers, schedulers, and the handoff points between them.
- Map stage-to-stage contracts: schema shapes, header conventions, routing keys, partition assumptions, and ordering dependencies.
- Trace failure paths: retries, DLQs, redrive policies, and what happens when retries exhaust.
- Identify deduplication surfaces: idempotency keys, processed markers, claim checks, and exactly-once guarantees.
- Map backpressure and flow control: queue bounds, flow control signals, and overload behavior.
- Include database-backed pipelines: tables polled by workers, status columns used as implicit queues, callback-driven processing chains. A `where(status: :pending)` poll loop is a pipeline stage too.

## The Partial Success Problem

The central question: **What is the system state when stage N commits but stage N+1 fails or never runs?**

This is not theoretical. It is the dominant bug class in production pipelines. A producer acknowledges a message, a worker crashes after processing but before ack, a database write succeeds but the Kafka commit never happens. These are the bugs that only show up under failure, and they leave invisible state corruption that accumulates over time.

## Workflow

1. Map the full pipeline from ingestion to final output, including all intermediate queues, topics, and databases.
2. Identify each handoff point and ask: what has been committed on the left side, and what is not yet committed on the right?
3. For each handoff, trace the failure modes: crash, timeout, network partition, downstream rejection.
4. Verify idempotency coverage: can the same logical work be safely retried from any point?
5. Verify ordering guarantees: if order matters, is it preserved across retries and redrives?
6. Verify DLQ behavior: what enters the DLQ, what consumes it, and does it have its own runaway risk?
7. Verify header and metadata propagation: correlation IDs, tracing headers, schema versions, and source timestamps.
8. Classify findings by blast radius: single-message corruption, ordering violations, cascading reprocessing, or unbounded accumulation.

## High-Risk Signals

**Partial pipeline success** — a stage commits its output but the next stage fails before committing its input, leaving orphaned work that will never be reprocessed or will be double-processed on redrive.

**Stage contract drift** — producer and consumer have incompatible schema assumptions, header expectations, or routing logic. Works until a new field is added or a new consumer subscribes.

**DLQ retry asymmetry** — the DLQ is consumed by a retry mechanism that can itself fail, creating a second-order DLQ or silent drop. Or the DLQ retry logic is different from the original path, missing validations.

**Dedup key gaps** — idempotency keys are missing for some paths, or the key space allows collisions, or keys are based on mutable fields that change on retry.

**Header strip-mining** — metadata (correlation IDs, tracing headers, schema versions, source timestamps) is dropped at a stage boundary, breaking observability or causing downstream consumers to misinterpret messages.

**Dead letter accumulation** — messages enter a DLQ but nothing consumes it, or the consumer is slow, or the retry policy is too aggressive, causing unbounded growth.

**Exactly-once theater** — code claims exactly-once semantics but the implementation allows duplicates under failure, or the idempotency check has a race condition.

**Schema evolution landmines** — new fields are optional for producers but required for consumers, or consumers reject messages with unknown fields, or version negotiation is missing.

## Guardrails

- Do not assume exactly-once delivery without verifying the implementation covers all failure paths.
- Do not assume DLQ means handled. DLQ is a holding pattern, not a resolution.
- Do not assume ordering guarantees without tracing the full path including retries and redrives.
- Do not assume downstream consumers will reject malformed messages; some will crash, some will log and drop, some will corrupt state.
- Separate throughput and latency concerns from correctness bugs. This lens focuses on correctness.
- A warning log is not error handling. A metric is not error handling. Dead letters must be consumed or explicitly escalated.

## Useful Checks

```bash
rg -n "produce|publish|send|consume|subscribe|receive|ack|nack|commit|rollback"
rg -n "dlq|dead.?letter|retry|redrive|reprocess|idempot|dedup|exactly.?once"
rg -n "correlation.?id|trace.?id|header|metadata|schema|version"
rg -n "queue|topic|partition|offset|consumer.?group|worker|job"
git diff --name-only
```

Trace message flow across module boundaries before concluding a path is safe.

### Example Findings

**[high] app/workers/enrichment_worker.rb:34** — enriched record saved to DB but Kafka offset committed before enrichment completes
- **What:** The worker calls `producer.commit_offset` at line 34, then continues with the enrichment write at line 38. If enrichment fails, the offset is already committed and the message will never be retried.
- **Why it matters:** The pipeline has a persistent data-loss path: the source record is marked as consumed but never enriched. Under sustained failures, enriched records silently diverge from source records.
- **Fix:** Move `commit_offset` to after the DB write succeeds, or wrap both in an idempotent transaction with a `processed_at` guard.

**[medium] app/services/event_processor.rb:67** — dedup key based on mutable field that changes on retry
- **What:** Idempotency uses `event.timestamp` as the dedup key, but the downstream system re-queues failed events with an updated `retry_count` and new `timestamp`.
- **Why it matters:** The same logical event generates different dedup keys on each retry, defeating idempotency. Retries create duplicates rather than deduplicating.
- **Fix:** Use a stable identifier (`event.message_id` or `event.correlation_id`) as the dedup key instead of the mutable timestamp.

## Output Template

- Pipeline surfaces reviewed:
- Stage handoffs and contracts:
- Partial success risks:
- DLQ and retry chain risks:
- Dedup and idempotency gaps:
- Header and metadata propagation gaps:
- Schema and contract drift risks:
- Recommended safeguards:

Prefer explicit handoff contracts, end-to-end idempotency, and observable DLQ consumption over optimistic assumptions.
