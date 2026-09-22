---
name: deduplication-multipass
multipass_desc: "Review code for structural duplication — copy-paste blocks that have diverged or will diverge, near-duplicate classes, repeated validation logic, and divergent config files."
description: "-"
when_to_use: "When reviewing for duplicate logic, redundant patterns, or when the user mentions deduplication, consolidation, or DRY violations."
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
| `critical` | Diverged copies producing different behavior in production | Validation logic copy-pasted and modified independently, one copy now has a critical bug the other doesn't |
| `high` | Likely divergence that will cause bugs under normal usage | Near-duplicate test setups, service objects that share 80%+ logic |
| `medium` | Structural duplication that increases maintenance burden | Config files that should derive from a base, repeated boilerplate |
| `low` | Minor improvement — dedup opportunity with low risk | Identical helper methods in different modules |
| `unverified` | Plausible but not confirmed against primary source | Looks duplicated but may be intentionally separate |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Same-logic verification:** Trace both copies line by line. Confirm they implement the same logical operation — not just similar-looking code that serves different purposes. Two validation methods that check different fields for different business rules are not duplicates, even if the structure looks similar.

**Coupling verification:** Would extracting the shared logic create harmful coupling between unrelated domains? If the copies live in different bounded contexts (e.g., billing vs shipping address validation), extracting a shared method ties the contexts together. Future changes to one context now break the other. Flag the duplication but note that extraction may not be appropriate.

**Intentional divergence verification:** Confirm the copies weren't intentionally split. Check git history — was there a deliberate "copy this and modify for X" commit with a reason? Some duplications are temporary scaffolding or intentional parallel implementations during a migration.

**Divergence evidence:** The strongest findings show concrete divergence — the copies have already drifted. Two identical blocks that haven't diverged yet are weaker findings (medium/low) than two blocks that were once identical and now behave differently (critical/high).

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Structural Duplication Review

Structural duplication is the inverse of over-abstraction: instead of one abstraction serving too many purposes, it's N copies of the same logic serving slightly different purposes — and diverging silently. This lens detects copy-paste code that has already diverged or will diverge, where `complexity-multipass` (over-abstraction), `debt-multipass` (dead code), and `wide-multipass` (general bugs) do not systematically look.

## Scope

- Copy-paste blocks that have been modified independently after duplication
- Near-duplicate classes, modules, or service objects sharing core logic
- Repeated validation logic across controllers, models, or form objects
- Duplicated test setup (factories, fixtures, helper methods) across test files
- Near-duplicate configuration files (Sidekiq, Docker, CI) that should derive from a shared base
- Controller action patterns repeated across controllers with only model-name differences

## The Silent Killers

**Diverged validation logic** — `app/services/billing/address_validator.rb` and `app/services/shipping/address_validator.rb` were copy-pasted from the same original. The billing copy was updated to require postal codes for VAT calculation. The shipping copy was not. Both are called "address validation" but enforce different rules. A bug fix applied to one copy doesn't reach the other. This is the most dangerous form of duplication because the divergence is invisible — the code looks similar, the class names are similar, but the behavior has silently forked.

**Near-duplicate test setup** — Six controller test files each define their own `sign_in_as` helper. Five of them are identical. The sixth was modified to handle a different auth scheme but the other five weren't updated to match. Tests pass in isolation but the auth helper divergence masks a real bug — one helper sets a session cookie, the others set an API token. Test coverage looks complete but only one path is actually tested.

**Config file clone army** — Eight Sidekiq config files across eight services. They started identical. Three have been updated with new queue definitions. Five haven't. The five stale configs are missing the `critical` queue, so jobs enqueued to `critical` silently fall through to `default` in those services. No test catches this because the config is loaded at runtime and the divergence is across services, not within one.

**The action service validation sandwich** — A 460-line validation method was copy-pasted into three action service classes. Over six months, each copy accumulated different bug fixes. All three copies now have bugs that the other two fixed. The bug density increases with every copy because fixes don't propagate. Extracting the shared logic would have made each fix count once.

**Controller boilerplate sprawl** — Twelve controllers with near-identical CRUD actions. The pattern differs only in the model class name. But two controllers override `create` with additional authorization checks. A security fix applied to the base pattern (strong parameter filtering) was only applied to ten of twelve controllers because the override masked the shared code.

## Workflow

1. **Map duplication hotspots.** Identify files with high similarity scores using structural comparison. Focus on: service objects, validators, test helpers, config files, and controller actions.
2. **Trace divergence.** For each duplicate pair, diff the copies. Identify concrete behavioral differences — not formatting or naming, but logic changes.
3. **Assess coupling risk.** For each finding, evaluate whether extraction would create harmful coupling between bounded contexts. Not all duplication warrants deduplication.
4. **Check git history.** Confirm whether duplication was intentional (deliberate fork with a reason) or accidental (copy-paste without tracking). Accidental duplication with divergence is the strongest finding.
5. **Evaluate maintenance surface.** How many places does a fix need to be applied? If the answer is N > 1 and the copies are logically the same operation, that's a maintenance hazard.
6. **Report with extraction guidance.** For each finding, suggest whether to extract (shared module, base class, or helper) or annotate as intentional duplication with a comment explaining why.

## Guardrails

- This lens detects structural duplication, not over-abstraction. Over-abstraction is owned by `complexity-multipass`. Dead code is owned by `debt-multipass`. This lens specifically catches alive-but-duplicated code that has or will diverge.
- **Not all duplication is bad.** Identical code in different bounded contexts (e.g., two microservices validating addresses independently) may be correct — the duplication insulates them from coupling. Flag it, but note that extraction may not be appropriate.
- **Distinguish structural duplication from coincidental similarity.** Two methods that both iterate and filter but operate on different domains with different rules are not duplicates. The structural similarity is superficial.
- **Prefer concrete findings over theoretical concerns.** "These two copies have diverged at line X — copy A validates postal code, copy B doesn't" beats "these look similar and might diverge someday."
- The Three Strikes rule is a guideline, not a law. Two copies that have already diverged are a stronger finding than three identical copies that haven't.
- Test deduplication findings should consider test isolation. Extracting shared test setup can reduce readability. Flag the duplication but recommend extraction only when the maintenance burden is clear.

## Useful Checks

```bash
# Find files with high similarity (structural duplication candidates)
# Compare service objects, validators, and controllers
rg -l "validates|validate|validation" --type ruby | head -30
rg -l "def (create|update|destroy|index|show)" --type ruby | head -30

# Find copy-paste patterns — repeated method bodies
rg -n "def (validate|check|verify|process|handle|perform)" -A 5 | sort | uniq -d

# Find near-duplicate test setup
rg -n "sign_in_as|login_as|setup_user|create_user" --type ruby
rg -n 'let!(:' --type ruby | sort | uniq -c | sort -rn | head -20

# Find config file duplication
find . -name "*.yml" -o -name "*.yaml" | xargs md5sum 2>/dev/null | sort | uniq -d

# Find duplicate class/module structures
rg -n "class.*Service|class.*Validator|class.*Handler" --type ruby

# Sidekiq / worker config duplication
rg -l "sidekiq_options|Sidekiq::Worker|ApplicationWorker" --type ruby

# Docker / CI config duplication
find . -name "Dockerfile*" -o -name "docker-compose*" | head -20
find . -path "*/.github/workflows/*.yml" | head -20
```

### Example Findings

**[critical] app/services/billing/address_validator.rb:23 vs app/services/shipping/address_validator.rb:23** — diverged validation logic: one copy requires postal code, the other doesn't
- **What:** Both files were copied from the same original address validator six months ago. The billing copy (line 23) was updated to require `postal_code` for VAT calculation. The shipping copy (line 23) still has the original validation without postal code. Both classes are named `AddressValidator` in different namespaces, making the divergence invisible to anyone searching for "address validation."
- **Why it matters:** A bug fix to address validation (e.g., adding country code normalization) must be applied to both copies. If one copy is fixed and the other isn't, the unfixed copy has a bug. Over six months, three fixes were applied to billing but not shipping — the shipping validator now has three known bugs that billing fixed.
- **Fix:** Extract shared validation rules into `app/validators/address_validator.rb` with configurable rules per context. The billing context adds postal code requirement; the shipping context adds delivery zone checks. The shared base handles common normalization and format validation. Add a comment in each context file explaining why it extends the base.

**[high] test/controllers/admin/users_controller_test.rb:12 vs test/controllers/admin/orders_controller_test.rb:15** — duplicated `sign_in_as` helper diverged across 6 controller test files
- **What:** Six controller test files define their own `sign_in_as` helper. Five use `post session_path, params: { email:, password: }` (form-based login). The sixth (`orders_controller_test.rb:15`) uses `setAuthorization` header (API token login). The five form-based copies are identical; the API token copy was modified for a different auth flow but the others weren't updated.
- **Why it matters:** Tests using form-based login don't exercise the API token auth path. A bug in API token validation would pass all five form-based tests but fail in production for API consumers. The test coverage matrix has a blind spot masked by the helper duplication.
- **Fix:** Extract `sign_in_as` into `test/helpers/auth_helper.rb` with a strategy parameter: `sign_in_as(user, strategy: :form)` vs `sign_in_as(user, strategy: :token)`. Each test explicitly chooses the strategy, making the coverage matrix visible.

**[medium] config/sidekiq.yml (services A, B, C) vs config/sidekiq.yml (services D, E, F)** — 8 near-duplicate Sidekiq configs, 3 updated, 5 stale
- **What:** Eight services have near-identical `config/sidekiq.yml` files. Three were updated to include the `critical` queue with higher priority. Five still have the original two-queue config (`default, mailers`). The divergence was introduced when the `critical` queue was added for time-sensitive jobs.
- **Why it matters:** Jobs enqueued to `critical` in services D–F silently fall through to `default` because the queue isn't configured. There's no error — Sidekiq just ignores unknown queues in the config. This means critical-priority jobs run at default priority in 5 of 8 services.
- **Fix:** Extract shared queue configuration into a base config that all services extend. Add a CI check that validates all services define the same queue set. Document the queue configuration policy in a single place.

## Output Template

- Scope:
- Diverged copies (logic that has forked and now behaves differently):
- Near-duplicate structures (likely to diverge without extraction):
- Config duplication (stale or inconsistent config files):
- Test setup duplication (diverged helpers, fixtures, or factories):
- Extraction recommendations (with coupling risk assessment):
- Intentional duplication (confirmed deliberate, no action needed):
- Not reviewed:
