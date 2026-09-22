---
name: feature-flags-multipass
multipass_desc: "Review feature flag hygiene — stale flags, flag coupling, missing removal paths, untested branches, evaluation side effects, and migration planning for flag retirement."
description: "-"
when_to_use: "When reviewing feature flag logic, flag lifecycle, flag removal, or when the user mentions feature flags, feature toggles, or rollout."
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
| `critical` | Active incident risk or data loss from flag state | Stale flag blocking incident response, flag causing double-processing of payments |
| `high` | Likely bug that affects correctness or operational safety | Coupled flags requiring coordinated rollout, flag default that disables safety check |
| `medium` | Quality issue that could cause problems under specific conditions | Only one branch tested, flag with no removal plan, evaluation side effects |
| `low` | Minor improvement — naming, documentation, cleanup | Inconsistent flag naming, missing flag description, orphaned flag definition |
| `unverified` | Plausible but not confirmed against primary source | Flag that appears unused but may be referenced via dynamic evaluation |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Staleness verification:** Trace the flag's rollout history. Check git blame, flag management platform (Flipper, LaunchDarkly), and deployment records. A flag that was enabled 6 months ago and has no disable path planned is stale — but a flag that was enabled 6 months ago with a planned Q3 cleanup is tracked, not stale. Only flag genuinely orphaned flags.

**Coupling verification:** When claiming two flags are coupled, trace the actual code paths. Do they guard the same behavioral switch? Does toggling one without the other cause a real failure (exception, wrong data, broken UX) or just a suboptimal state? Only flag coupling that causes correctness issues, not convenience coupling.

**Coverage verification:** When claiming a branch is untested, check ALL test files — not just the obvious unit test. Integration tests, feature specs, and E2E tests may cover the "other" branch. Only flag branches with zero test coverage across the entire suite.

**Side-effect verification:** When claiming flag evaluation has side effects, confirm the side effect is observable (state mutation, I/O, logging of sensitive data). A flag check that reads from a cache is not a side effect. A flag check that writes to a database IS a side effect.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Feature Flag Review

Feature flags are the fastest-accumulating form of technical debt. A flag is added in minutes for a rollout, then never removed. Within a year, the codebase is riddled with conditional branches that nobody remembers adding, nobody knows if they can remove, and nobody tests both paths. This lens reviews the full flag lifecycle: creation, evaluation, testing, and retirement.

## Scope

- Flag lifecycle hygiene: creation, rollout tracking, retirement planning
- Stale flag detection: flags fully rolled out but never removed
- Flag coupling: flags that must be toggled together for correctness
- Test coverage: both branches of flag-guarded code paths
- Evaluation correctness: side effects in flag checks, performance of evaluation, default safety
- Migration paths: documented plan for flag removal after rollout completion
- Flag naming and discoverability: can someone find all flags? Is there a flag registry?

## The Silent Killers

**The stale flag that blocks incident response** — A feature flag `use_new_payment_processor` was enabled 8 months ago. The rollout was "successful" and everyone moved on. At 2 AM, payments start failing. The on-call engineer sees the flag and, unsure whether disabling it is safe (what state will the system be in?), wastes 45 minutes tracing code paths instead of toggling it off. The flag should have been removed months ago — its continued existence created ambiguity during an incident. Every fully-rolled-out flag that remains in the codebase is incident response debt.

**The coupled flags with no coordination** — Flag `enable_checkout_v2` gates the new checkout flow. Flag `enable_tax_calculation_v2` gates the tax service it depends on. They were rolled out independently by different teams. At some point, `checkout_v2` is enabled but `tax_v2` is not. The new checkout calls a tax endpoint that doesn't exist yet. The error is caught in staging — this time. Next time, the flags may be toggled in the wrong order during an incident. Coupled flags need coordinated rollout documentation and, where possible, a single parent flag.

**The untested off-branch** — A flag is added with the "new" path well-tested (after all, that's what the team is shipping). The "old" path hasn't been tested since the flag was introduced — it still runs in production when the flag is disabled, but nobody has verified it works. When the flag is disabled during an incident rollback, the old path fails because the data model changed underneath it. The old path must be tested with the same rigor as the new path for as long as it exists.

**The flag with no kill switch** — A flag is added as a safety mechanism: `disable_rate_limiting` (default: off). During an incident, someone enables it. The rate limiter is off. Traffic spikes. The system goes down. The flag was meant to be a temporary override but has no automatic re-enable, no TTL, and no monitoring. Safety flags need expiration, monitoring, and a default-safe state.

## Workflow

1. **Inventory all flags.** Grep for flag evaluation patterns (Flipper, LaunchDarkly, ENV checks, config toggles). Build a flag map: name, location, default state, current state (if discoverable).
2. **Check staleness.** For each flag, determine rollout status. If fully rolled out (always enabled or always disabled in production), check for a removal plan or open issue. Flags fully rolled out with no removal plan are stale.
3. **Trace coupling.** For each flag, check whether the guarded code depends on the state of other flags. Map dependencies. Coupled flags without documentation or coordination are a finding.
4. **Audit test coverage.** For each flag-guarded code path, check whether both branches are tested. Untested branches (especially the "off" / rollback branch) are a finding.
5. **Review evaluation correctness.** Check for side effects in flag evaluation (DB writes, state mutations during reads). Check for performance issues (flag checks in hot loops, remote flag evaluation without caching).
6. **Check defaults and safety.** For each flag, evaluate whether the default state is safe (fails closed, not open). Safety-critical flags that default to "enabled" are a finding.
7. **Verify migration paths.** For recently enabled flags, check for documented removal plans. For flags enabling new code, check that the old code path can still function (rollback safety).

## Guardrails

- This lens reviews flag *lifecycle* hygiene. Flag *semantics* (precedence, reload, environment overrides) are owned by `config-safety-multipass`. Flag-related *technical debt* (stale code, dead abstractions) is owned by `debt-multipass`.
- Not all conditionals are feature flags. A simple `if Rails.env.production?` is an environment check, not a feature flag. An `if user.admin?` is a permission check. Focus on toggles that control feature rollout or operational behavior independently of deployment.
- Distinguish feature flags from config toggles. A feature flag gates a rollout and should eventually be removed. A config toggle is a permanent operational setting (e.g., `max_connections`). Config toggles are reviewed by `config-safety-multipass`.
- A flag that appears unused may be evaluated dynamically (string interpolation, reflection). Before flagging as dead, check for dynamic evaluation patterns.
- Flag removal is a design decision. Suggest removal plans, but do not recommend immediate removal of flags you cannot fully trace.

## Useful Checks

```bash
rg -n "Flipper|flipper|FeatureFlag|feature_flag|feature\.enabled|feature\.disabled" -i
rg -n "LaunchDarkly|LDClient|ldclient|variation|toggle" -i
rg -n "Unleash|unleash|is_enabled|get_variant" -i
rg -n "ENV\[.*FEATURE|ENV\[.*FLAG|ENV\[.*ENABLE|ENV\[.*DISABLE" -i
rg -n "Rails.configuration\.(feature|flag)|Settings\.feature|AppConfig\.feature" -i
rg -n "if.*enabled|if.*disabled|unless.*enabled|unless.*disabled" -i
rg -n "rollout|roll_out|flag_id|flag_name|flag_key" -i
rg -n "A\/B|ab_test|experiment|variant|split_test" -i
rg -n "remove_flag|delete_flag|cleanup_flag|retire_flag" -i
```

## Common Risk Areas

- **Stale flags after full rollout** — the most common and most dangerous pattern. Flag is enabled, rollout succeeds, nobody schedules removal. Accumulates indefinitely.
- **Coupled flags** — two or more flags that must be toggled together for correctness but have no documented relationship. During incidents, they get toggled independently.
- **Untested rollback branch** — the "old" path that runs when the flag is disabled. Tested at flag introduction, then never again. Silently breaks as surrounding code evolves.
- **Flag evaluation in hot paths** — remote flag checks (LaunchDarkly, etc.) inside request loops or tight iterations. Performance degradation from flag evaluation overhead.
- **Dynamic flag evaluation** — flags evaluated via string interpolation or reflection (`Feature.enabled?("#{flag_name}")`). These are invisible to grep-based flag inventories and may appear unused when they are not.
- **Missing default safety** — flags that default to "enabled" for dangerous behavior. A disabled-then-re-enabled flag during debugging that gets forgotten. Flags need safe defaults (fail closed).
- **No flag registry** — flags scattered across the codebase with no central inventory. Impossible to answer "what flags exist and what do they control?" during incident response.

## Example Findings

**[critical] app/services/payment_processor.rb:23** — `use_new_payment_processor` flag fully rolled out 8 months ago but never removed, creating incident response ambiguity
- **What:** The flag `use_new_payment_processor` has been enabled in production for 8 months (verified via Flipper UI). The old payment processor code at line 45 still exists but has not been tested since the flag was enabled. During a payment incident (INC-892), on-call wasted 30 minutes determining whether disabling the flag was safe.
- **Why it matters:** Stale flags create incident response debt. The flag's existence implies there's a rollback path, but the old path is untested and likely broken. This wastes incident time and risks making things worse if toggled.
- **Fix:** Remove the old payment processor code path, delete the flag, and update tests to only test the new processor. If the old processor must be retained as a rollback option, schedule its removal with a specific date and add the flag to a cleanup registry.

**[high] app/models/checkout.rb:67** — `enable_checkout_v2` depends on `enable_tax_v2` but flags are toggled independently with no coordination
- **What:** `Checkout#process` branches on `enable_checkout_v2` (line 67). The v2 path calls `TaxCalculatorV2.calculate` (line 82), which only exists when `enable_tax_v2` is enabled. These two flags can be toggled independently, and there is no guard that prevents `checkout_v2` being on while `tax_v2` is off.
- **Why it matters:** If `checkout_v2` is enabled without `tax_v2`, the checkout process calls a method that doesn't exist. This will cause a `NoMethodError` on every checkout. During a staged rollout or incident toggle, the flags can easily get out of sync.
- **Fix:** Either: (1) make `enable_checkout_v2` implicitly enable `enable_tax_v2` (nested flag), (2) add a guard clause in the v2 checkout path that verifies `enable_tax_v2` is on, or (3) document the coupling in the flag registry and add a coordinated rollout runbook.

**[medium] spec/services/checkout_spec.rb:34** — `enable_checkout_v2` only tests the enabled branch; the disabled (rollback) path has zero test coverage
- **What:** The test file has 12 examples testing the v2 checkout flow (flag enabled). Zero examples test the v1 checkout flow (flag disabled). The v1 flow still runs in production when the flag is off.
- **Why it matters:** The v1 path is untested. Any changes to shared dependencies (e.g., the order model) may silently break the v1 path. If the flag is disabled for a rollback, untested code runs in production.
- **Fix:** Add test coverage for the flag-disabled path. At minimum, add a smoke test for the v1 checkout flow. Consider a shared example group that tests both branches.

## Output Template

- Scope:
- Stale flags (fully rolled out, no removal plan):
- Coupled flags (undocumented dependencies between flags):
- Untested branches (flag paths with zero test coverage):
- Evaluation issues (side effects, performance, dynamic evaluation):
- Default safety issues (unsafe flag defaults):
- Migration gaps (recently enabled flags with no removal plan):
- Not reviewed:
