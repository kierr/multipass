# State Machine Signal Patterns

Concrete patterns that indicate state machine concerns worth reviewing.

## Invalid Transition Paths

| Pattern | Why It's Suspicious |
|---------|---------------------|
| `failed` -> `succeeded` directly | Failed tasks should retry from pending, not jump to success |
| `archived` -> `active` without unarchive | Usually requires explicit restoration logic |
| `draft` -> `published` bypassing review | May skip required approval workflow |
| `cancelled` -> any active state | Cancelled is typically terminal |
| `rejected` -> `approved` without resubmission | Should go through review again |
| `expired` -> `active` without renewal | Usually requires explicit reactivation |

## Implicit State via Timestamps

| Pattern | What It Encodes |
|---------|-----------------|
| `claimed_at` not null, no `released_at` | Resource is claimed/in-use |
| `started_at` not null, `completed_at` null | Job is running |
| `published_at` not null | Content is published (but check status field) |
| `deleted_at` not null | Soft delete (but check if truly deleted state) |
| `verified_at` not null | Identity verified (but check verification_status) |
| Multiple `_at` timestamps | Each represents a state transition |

**Signal**: Status enum says one thing, timestamps say another.

## Orphaned State Patterns

| Pattern | The Bug |
|---------|---------|
| `claimed_at` set, process died | Resource permanently locked |
| `status: running`, worker crashed | Job stuck, never completes |
| Lock row exists, lock holder gone | Distributed lock leaked |
| `assigned_to` set, user deleted | Task assigned to ghost |
| Session record exists, long expired | Orphaned session state |

**Look for**: Cleanup jobs, timeout handling, process death detection.

## Callback Assumptions

| Pattern | The Assumption That May Not Hold |
|---------|----------------------------------|
| `after_transition to: :published` | Assumes entity was ever in draft |
| `before_save :validate_publishable` | Fires on every save, not just publish |
| `validate :reviewer_must_exist` | What if created directly in approved state? |
| `status_was == 'pending'` check | New records have no prior state |
| `changes[:status]` in observer | Only works if status actually changed |

## Missing State Guards

| Pattern | What's Missing |
|---------|----------------|
| Direct `status = 'published'` | Should go through `publish!` method |
| `update(status: :approved)` | Bypasses approval workflow |
| Mass assignment to status | No transition validation |
| String comparison `status == 'active'` | Should use enum constant |
| Status change without audit log | No paper trail for critical transition |

## State Machine Gem Patterns (Ruby)

| Gem | How It Protects |
|-----|-----------------|
| `aasm` | `aasm_state` column, `transition` guards, event methods |
| `statesman` | Separate transitions table, history preserved |
| `workflow` | `workflow_state` column, state-specific methods |

**Signal**: Status enum without gem in complex domain = implicit state machine.

## Common Invariant Violations

| Invariant | What Breaks It |
|-----------|----------------|
| Published content must have been reviewed | Direct `update(status: :published)` |
| Running jobs must have started_at | Status change without timestamp |
| Claimed resources must have claimer | `claimed_at` set without `claimed_by` |
| Approved items must have approver | Status change without audit |
| Paid orders must have payment record | Status set without payment association |
