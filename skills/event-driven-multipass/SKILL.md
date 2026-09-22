---
name: event-driven-multipass
multipass_desc: "Review event-driven and messaging systems for ordering, idempotency, DLQ handling, replay safety, schema evolution, and distributed delivery guarantees."
description: "-"
when_to_use: "When reviewing event-driven architecture, message queues, event schemas, or when the user mentions events, messaging, or pub/sub."
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

1. **Branch diff.** If on a non-default branch (not main/master), diff against the merge base: `git diff $(git merge-base HEAD origin/main)...HEAD`. This captures the full changeset.
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
| `critical` | Exploitable vulnerability, data loss, or production breakage | Duplicate payment processing, data corruption from ordering violation |
| `high` | Likely bug that affects correctness under normal usage | Consumer not idempotent, partition key collision, missing DLQ |
| `medium` | Quality issue that could cause problems under specific conditions | Schema evolution gap, fragile retry logic, missing correlation ID |
| `low` | Minor improvement — style, naming, dead code | Inconsistent header naming, missing tracing on a non-critical path |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Idempotency verification:** Trace what happens when the same message is delivered twice. Walk through the consumer handler line by line — does it create side effects (DB writes, external calls, further emissions) that would duplicate on redelivery? Check for an idempotency guard (processed-marker, dedup key, upsert). If the consumer is not idempotent, verify the broker guarantees at-most-once delivery (it almost certainly doesn't).

**Ordering verification:** When claiming an ordering violation, trace the full path including retries, redrives, and consumer group rebalances. Verify the partition/routing key is stable (not derived from mutable state). Verify the consumer doesn't re-enqueue messages that could arrive out of order. Confirm that ordering actually matters for this particular message type — not all event types require ordering.

**Failure-path verification:** When claiming a message can be lost, trace the failure to its terminal state. Where does the message end up? Is there a DLQ? Does anything consume from it? Does the retry chain have a max-retry count? A message that retries forever is not "lost" but it may block the consumer. A message that lands in an unconsumed DLQ IS lost.

**Spec-dependent verification:** When a finding depends on how a broker, protocol, or runtime behaves (Kafka offset semantics, SQS visibility timeout, RabbitMQ acknowledgment modes), verify the claimed behavior against the authoritative source. "Kafka guarantees ordering within a partition" is not a finding until you verify the producer and consumer configs actually enforce it. If you cannot verify against a primary source, flag as `[unverified]` instead of confirmed.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Event-Driven Architecture Review

Review event-driven and messaging systems for the failure modes that only emerge at the distributed system boundary — not individual handler correctness, but the correctness of the event contract, delivery semantics, and cross-service coordination.

This lens is distinct from `concurrency-multipass` (which covers thread/process synchronization within a service) and `data-pipeline-multipass` (which covers multi-stage data flows with stage-N partial failure). This lens covers the messaging fabric: brokers, topics, queues, subscriptions, and the contracts between producers and consumers.

## Scope

- Identify messaging infrastructure: brokers (Kafka, RabbitMQ, SQS/SNS, Google Pub/Sub, Redis Streams, NATS, Celery, Sidekiq), topics/exchanges/queues, consumer groups, subscriptions.
- Identify producers and consumers: event emitters, handlers, processors, subscribers, and the serialization/deserialization boundaries.
- Map delivery guarantees: at-most-once, at-least-once, exactly-once (or the approximation), and where the system actually lands vs. what it claims.
- Map ordering guarantees: per-partition, per-key, global, or none — and what the consumers assume.
- Trace failure paths: retries, DLQs, redrive policies, backoff strategies, poison message handling.
- Identify schema contracts: event schemas, versioning strategy, backward/forward compatibility, schema registry usage.

## The Silent Failure Problem

The central question: **What happens when a message is processed twice, processed out of order, or never processed at all — and does the system detect and recover, or silently corrupt state?**

Event systems fail silently. Duplicate processing causes double charges or double actions. Ordering violations corrupt state in ways that only emerge under concurrent load. Missing DLQ handling causes invisible data loss. These are not theoretical — they are the dominant bug class in event-driven systems.

## Workflow

1. Map the event topology: producers → brokers → consumers, including all intermediate routing, filtering, and transformation.
2. For each producer-consumer pair, identify the delivery guarantee and verify the implementation matches the claim.
3. Trace ordering: identify which paths require ordering and verify the partition/key/routing strategy preserves it.
4. Audit consumer idempotency: verify each consumer can safely process the same message multiple times without side effects.
5. Trace DLQ and retry chains: map every failure path to its terminal state. A DLQ without a consumer is a silent data loss path.
6. Audit schema evolution: verify new fields are backward-compatible and consumers handle unknown fields gracefully.
7. Verify correlation and tracing: can you reconstruct the full event chain for debugging?
8. Classify findings by blast radius: single-event corruption, ordering violation, cascading reprocessing, or unbounded accumulation.

## High-Risk Signals

**Non-idempotent consumers** — a consumer that creates side effects (DB writes, external API calls, further event emissions) without an idempotency key or processed-marker check. At-least-once delivery guarantees mean this will produce duplicates in production.

**Partition key collision or absence** — partition key chosen poorly (high cardinality causing hot partitions) or missing entirely (ordering not guaranteed when it's required). A partition key derived from a mutable field changes between retries, breaking ordering.

**DLQ without consumption** — messages land in a DLQ but nothing reads from it, or the reader has its own failure path with no terminal escalation. DLQ is a holding pattern, not a resolution.

**Offset/ack before processing** — consumer commits the offset or acknowledges the message before completing processing. A crash after ack means the message is permanently lost. This is the most common data-loss bug in event systems.

**Schema evolution landmines** — producer adds a required field that old consumers reject, or consumer assumes a field exists that old messages lack, or schema registry is bypassed for "hot" deploys.

**Retry storm / poison message** — a message that consistently fails triggers infinite retries, consuming consumer capacity and blocking other messages. No max-retry count, no poison message detection, no circuit breaker on the consumer.

**Backpressure bypass** — producer emits faster than consumer can process, with no flow control, no queue depth monitoring, and no backpressure signal. Queue grows unbounded until the broker or consumer OOMs.

**Eventual consistency without reconciliation** — services emit events and assume eventual consistency, but there is no reconciliation or audit mechanism to detect when state has diverged.

## Broker-Specific Risks

### Kafka

- Offset committed before processing completes (at-least-once becomes at-most-once)
- Consumer group rebalance during processing — in-flight work abandoned without completion
- `enable.auto.commit=true` with non-idempotent processing — guaranteed data loss
- Partition count changes breaking consumer routing assumptions
- Compacted topic with null-value tombstones not handled by consumers

### SQS/SNS

- Visibility timeout shorter than processing time — message becomes visible to another worker mid-processing, causing duplicate execution
- `ReceiveMessage` with `WaitTimeSeconds=0` in a tight loop — API call amplification
- FIFO queue dedup ID based on mutable content — dedup defeated on retry
- SNS fan-out to SQS with missing `RawMessageDelivery` setting — wrapper nesting confusion
- Message attributes dropped in SNS→SQS subscription filtering

### RabbitMQ

- Manual ack without `prefetch_count` limit — consumer overwhelmed with unacked messages
- `auto_ack=true` with non-idempotent handler — message lost on crash
- Dead letter exchange that routes back to the originating queue — infinite loop
- Queue mirrored across nodes but consumers not distributed — single-node bottleneck

### Redis Streams

- `XACK` before processing — same offset-before-processing bug as Kafka
- `MAXLEN` trimming without approximate trimming (`~`) — performance penalty on every append
- Consumer group with pending entries never claimed — messages stuck in limbo after consumer crash
- `XREADGROUP` with `COUNT` larger than available messages — unnecessary blocking or empty batches

### Sidekiq / background job queues

- Job `retry` disabled on jobs with external side effects — permanent data loss on transient failure
- Job arguments serialized to JSON and back — symbol/string key mismatch in Ruby, type coercion in Python
- Queue without concurrency limit — all workers compete for the same resource
- `perform_in` with large delay but job class changes before execution — deserialization failure

## Guardrails

- Do not assume exactly-once delivery. Verify what the broker actually provides and what the application layer adds on top.
- Do not assume ordering without tracing the full path including retries, redrives, and consumer group rebalances.
- Do not assume DLQ means handled. DLQ is a holding pattern, not a resolution.
- Separate throughput and latency concerns from correctness bugs. This lens focuses on correctness.
- A warning log is not error handling. A metric is not error handling. Unprocessed messages must be consumed, retried, or explicitly escalated.
- Verify delivery semantics end-to-end: producer config + broker config + consumer config together determine the actual guarantee, not any one in isolation.
- Do not conflate "eventually consistent" with "eventually correct." State can converge to the wrong value without reconciliation.

## Useful Checks

```bash
# Producer/consumer patterns
rg -n "publish|produce|emit|send|broadcast|notify|dispatch"
rg -n "subscribe|consume|receive|handle|process.*message|handle.*event"
rg -n "ack|nack|reject|commit.*offset|seek|checkpoint"

# Delivery guarantees
rg -n "idempoten|dedup|exactly.?once|at.?least.?once|at.?most.?once"

# Failure handling
rg -n "dlq|dead.?letter|retry|redrive|backoff|circuit.?break|max.?retry"

# Ordering and partitioning
rg -n "partition.*key|routing.*key|order|sequence|offset"

# Schema and contracts
rg -n "schema.*registry|event.*version|contract|compat|backward|forward"

# Correlation and tracing
rg -n "correlation.?id|causation.?id|trace.?id|span|link|parent"

# Broker-specific
rg -n "kafka|rabbitmq|sqs|sns|pub.?sub|nats|redis.*stream|sidekiq|celery"
rg -n "consumer.?group|topic|exchange|queue|subscription|channel"

git diff --name-only
```

Trace the full event path — from emission through broker routing to consumer handling and any downstream side effects — before concluding a path is safe.

### Example Findings

**[critical] app/workers/payment_event_consumer.rb:28** — payment processed before Kafka offset committed; offset commit never happens on crash
- **What:** The consumer calls `PaymentService.charge(event)` at line 28, then `consumer.commit()` at line 33. If the process crashes between these lines, the payment is taken but the offset is not committed. On restart, the consumer re-delivers the same message and charges the customer again.
- **Why it matters:** At-least-once delivery combined with a non-idempotent payment operation creates a double-charge risk. This is not theoretical — it happens under normal production conditions during deployments, rebalances, and network blips.
- **Fix:** Make `PaymentService.charge` idempotent by checking a `processed_event_id` guard before executing, or use a transactional outbox pattern that atomically writes the payment and the offset marker.

**[high] app/services/order_event_publisher.rb:15** — partition key derived from mutable `order.status` field
- **What:** The Kafka producer uses `order.status` as the partition key. An order transitions from `pending` → `paid` → `shipped`, changing the partition key at each transition.
- **Why it matters:** Events for the same order are spread across different partitions, losing per-order ordering. A `shipped` event may arrive before a `paid` event at the consumer, corrupting the order state machine.
- **Fix:** Use a stable partition key like `order.id` that does not change across the order lifecycle.

**[medium] app/subscribers/notification_handler.rb:42** — SQS visibility timeout (30s) shorter than processing time (p95: 45s)
- **What:** The handler processes notifications in 30-60 seconds, but the SQS visibility timeout is set to 30 seconds. Messages become visible to other workers while still being processed.
- **Why it matters:** Duplicate notification delivery. Under sustained load, every message gets processed 2-3 times. Not a data integrity issue for notifications, but it degrades the user experience (duplicate emails/pushes) and wastes compute.
- **Fix:** Increase visibility timeout to 90s (2× p95), or use `ChangeMessageVisibility` to extend per-message during processing.

**[medium] config/kafka.yml:8** — `enable.auto.commit=true` with non-idempotent event handler
- **What:** Consumer auto-commits offsets every 5 seconds regardless of processing status. The handler performs DB writes and external API calls.
- **Why it matters:** If the consumer crashes mid-batch, auto-commit may have already committed offsets for messages that were never processed. The at-least-once delivery guarantee becomes at-most-once in practice — messages are silently dropped.
- **Fix:** Disable auto-commit and manually commit offsets only after processing succeeds, or use the transactional consumer API.

## Output Template

- Event topology reviewed (producers, brokers, consumers):
- Delivery guarantee audit (claimed vs. actual):
- Consumer idempotency coverage:
- Ordering guarantee audit:
- DLQ and retry chain risks:
- Schema evolution and contract drift risks:
- Correlation and tracing coverage:
- Backpressure and flow control gaps:
- Recommended safeguards:

Prefer explicit delivery contracts, consumer-side idempotency, and reconcilable state over broker-assumed guarantees.
