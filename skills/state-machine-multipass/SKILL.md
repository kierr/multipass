---
name: state-machine-multipass
multipass_desc: "Review status fields, enum transitions, lifecycle callbacks. Catches invalid transitions race detectors miss — failed-to-succeeded jumps, orphaned claims."
description: "-"
when_to_use: "When reviewing state machines, status transitions, lifecycle callbacks, or when the user mentions state machines, transitions, or lifecycle."
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

# State Machine Review

Most business logic is a state machine in disguise. The question is whether the code knows it — and whether the transitions are intentional or accidental.

## Scope

- Review diffs by default, or the named file, path, or whole repo when scope is expanded.
- Look for explicit state machines (gems, libraries, frameworks) and implicit ones (status columns, enum fields, nullable timestamps that encode state).
- The guiding question: **Can this entity reach every state it claims? Are there paths that should be impossible?**

## What State Machine Bugs Look Like

**Impossible transitions** — jumping from `failed` to `succeeded` without passing through `pending`, moving `archived` items back to `active` without unarchiving logic, promoting `draft` to `published` without validation.

**Implicit state via timestamps** — `completed_at` means completed, but what if it's set and the status is still `pending`? `claimed_at` without `released_at` means in-use, but who claims the orphans?

**Callbacks that assume history** — `after_transition` handlers that expect prior state to exist, `before_save` validations that only make sense for certain transitions, observers that fire on every save but only mean something on state changes.

**Orphaned claims and leaked state** — resources claimed but never released, jobs marked `running` after the worker died. A concurrency or shutdown root cause is `concurrency-multipass`'s domain; if one is present, report it here with `concurrency-multipass` noted in the triage entry — do not defer or hand it off. This lens owns the state model: are orphaned states detectable? Is there a recovery path? Is the claim TTL appropriate?

**Missing state change auditing** — critical transitions that leave no trace, status changes without timestamps, approval flows with no paper trail.

**Enum fields without guards** — direct assignment to status columns, string comparison instead of enum constants, transition logic scattered across controllers and services.

**Lifecycle assumptions** — code that assumes an entity was ever in a prior state, callbacks that break when entities are created in non-initial states, validation that checks `status_was` but the record is new.

## Workflow

1. Map the state space: What states exist? What transitions are valid? Where is this defined — explicitly in a state machine, or implicitly scattered?
2. Trace transition paths: Can the code reach impossible states? Are there missing transitions that leave entities stranded?
3. Find the orphans: Claimed but never released, started but never finished, locked but the key was lost.
4. Check invariants: What must be true in each state? Is it enforced? Can concurrent operations break it?
5. Verify auditing: Do critical transitions leave evidence? Can you reconstruct what happened?
6. Recommend explicit state machines when the implicit one grows too complex.

## Guardrails

- Not every enum needs a state machine gem. Simple status fields are fine if transitions are obvious and few.
- Don't flag every direct status assignment — only the ones that bypass intended transition logic.
- Distinguish between bugs (impossible transitions, leaked state) and design debt (implicit state machines that work but are hard to reason about).
- Respect preservation annotations. Some legacy state machines are frozen deliberately.

## Useful Checks

Look for state machine declarations and transition logic:

```bash
rg -n "aasm|statesman|workflow|state_machine|finite_machine" --type ruby
rg -n "enum .*status|enum .*state|define_state_machine"
rg -n "transition|can_transition|may_\w+\?"
rg -n "claimed_at|locked_at|acquired_at|released_at"
```

Also check for implicit state encoded as nullable timestamps (`completed_at`, `archived_at`) or status enums without transition guards.

### Example Findings

**[high] app/models/order.rb:67** — transition from `shipped` to `cancelled` allowed with no guard or compensation
- **What:** The state machine allows `shipped → cancelled` without reversing the shipment, refunding payment, or notifying fulfillment. The `cancel!` event has no guard restricting source states.
- **Why it matters:** A cancelled-after-shipped order leaves the warehouse holding a dispatched package while the customer receives a refund. Inventory and financial records diverge.
- **Fix:** Add a guard: `guard -> { fulfillment.cancellable? }` on the cancel transition from `shipped`, or add a separate `recall` transition that triggers the reversal workflow.

**[medium] app/models/submission.rb:34** — `completed_at` timestamp used as implicit state without transition validation
- **What:** Code checks `if submission.completed_at?` to determine completion state, but nothing prevents `completed_at` from being set before all required steps finish. Any code can write to `completed_at` directly.
- **Why it matters:** A bug that sets `completed_at` early makes the submission appear complete while downstream processors skip it. The implicit state has no invariant enforcement.
- **Fix:** Replace the timestamp check with an explicit `status` column and state machine, or add a validation that `completed_at` can only be set when all required steps are verified.

## Output Template

- Scope:
- State surfaces found (explicit machines, status enums, timestamp-encoded):
- Confirmed transition bugs (impossible paths, orphaned state, broken invariants):
- Audit gaps (untracked transitions, missing paper trail):
- Not reviewed:
