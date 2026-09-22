---
name: pii-multipass
multipass_desc: "Review personal data flows — collection minimization, storage encryption, logging balance, retention policies, right-to-erasure paths."
description: "-"
when_to_use: "When reviewing personal data flows, data collection, encryption, retention, or when the user mentions PII, privacy, or GDPR."
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

# PII Review

Personal data demands respect at every layer: collection, storage, transit, logging, and eventual erasure. But protection without diagnosability creates blind spots — over-filter logs and incidents become untraceable; under-filter and you leak secrets. Find the balance.

## Scope

- Review diffs by default, or the named file, path, or whole repo when scope is expanded.
- Scan across surfaces: data models, controllers, serializers, loggers, message queues, audit systems.
- The guiding questions: **What data is collected? How is it protected? Where does it appear? Can it be erased?**

## What Personal Data Looks Like

**Identity anchors** — names, emails, phone numbers, government IDs, addresses. The things that pin a person to a record.

**Authentication artifacts** — passwords (hashed or not), tokens, session identifiers, API keys, biometric data. Even expired credentials carry risk.

**Behavioral traces** — IP addresses, device fingerprints, location data, browsing patterns. Often overlooked but highly identifying.

**Financial footprints** — credit card numbers, bank accounts, transaction histories. The obvious ones, but also derived data like credit scores.

**Health signals** — medical records, prescriptions, appointment histories. Even metadata like "visited this clinic" is sensitive.

**Relational data** — social connections, family members, organizational memberships. One person's PII often implicates others.

## The Protection Spectrum

**At rest** — Is PII encrypted in the database? Which columns are plaintext by design vs negligence? Are backups equally protected?

**In transit** — TLS everywhere, but what about internal service-to-service calls? Message queue payloads? Webhook deliveries?

**In logs** — Are sensitive parameters filtered before logging? Is the filtering complete enough? Too aggressive? Can you still diagnose production issues?

**In memory** — How long does PII live in application state? Are there unnecessary caches, memoization, or session bloat?

**In transit to third parties** — What leaves the system? Is it minimized? Is there consent and audit?

## The Diagnosability Tension

**Over-filtering symptoms** — support tickets that cannot be traced, incidents with no user context, debugging sessions that require production database access just to understand what happened.

**Under-filtering symptoms** — credentials in log files, emails in error notifications, names in metrics, phone numbers in debug output.

**The balance point** — enough context to diagnose without enough data to identify. User IDs instead of emails in logs. Request IDs that can be resolved to users only with database access. Aggregated metrics that preserve behavioral patterns without individual traces.

## Workflow

1. Map the data flows: where does PII enter, where is it stored, where does it appear in output.
2. Check storage: encrypted columns, proper key management, backup parity.
3. Check logging: parameter filtering completeness, over-filtering blind spots, structured logging discipline.
4. Check transit: API responses, webhooks, message queues, third-party integrations.
5. Check retention: data lifecycles, archival policies, right-to-erasure cascade paths.
6. Check audit: who accessed what, when, from where. Is sensitive access itself sensitive?
7. Distinguish critical (actively leaking) from actionable (clear remediation) from architectural (requires design change).

## Guardrails

- Not all PII needs encryption — but the decision should be intentional, not accidental.
- Logs must remain useful — filtering is about reduction, not elimination of all identifying data.
- Retention policies mean nothing without enforcement — check for cleanup jobs, not just documentation.
- Right to erasure is only real if cascade deletes cover all derived data — check the full path.
- Third-party data sharing is a compliance surface — check consent, contracts, and audit trails.
- Error messages are a common leak vector — ensure sanitized output without losing debuggability.

### Example Findings

**[high] app/models/user.rb:15** — SSN stored as plaintext string column with no encryption at rest
- **What:** The `users` table has a `ssn` column stored as a plain `varchar`. No application-level encryption, no database-level encryption, no vault integration.
- **Why it matters:** Any DB dump, backup, or admin query exposes Social Security Numbers. This violates PCI-DSS and most data protection regulations. A single breach triggers mandatory disclosure.
- **Fix:** Encrypt the column at application level using `attr_encrypted` or the Rails 7 `ActiveRecord::Encryption` API. Rotate existing values through a migration.

**[medium] app/controllers/api/v1/users_controller.rb:34** — full user record including email and phone logged in info-level request log
- **What:** `Rails.logger.info("User created: #{user.attributes}")` logs all user attributes including email, phone number, and hashed password digest at `info` level.
- **Why it matters:** Info-level logs are shipped to the log aggregation service and visible to all engineering. PII in logs bypasses database access controls and retention policies.
- **Fix:** Log only the user ID: `Rails.logger.info("User created: id=#{user.id}")`. Add a log filter for known PII fields if the pattern is widespread.

## Output Template

- Scope:
- PII collection surfaces:
- Storage protection (at rest):
- Logging posture (filtered / over-filtered / under-filtered):
- Transit exposure (APIs, queues, webhooks):
- Retention and cleanup:
- Right-to-erasure paths:
- Audit coverage:
- Not reviewed:
