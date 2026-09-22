---
name: dependency-multipass
multipass_desc: "Review dependency health — outdated, unmaintained, CVE-affected packages. Checks boundary direction, cyclic coupling, and architecture drift."
description: "-"
when_to_use: "When reviewing dependency health, outdated packages, CVE exposure, or when the user mentions dependencies, packages, or supply chain."
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

**Dependency-role verification:** Before classifying health or recommending change, verify the dependency's role in the live bundle — who depends on it (transitive scan), whether it is runtime-probed, what pin convention the repo uses, and why a fork exists. Absence of activity is a hypothesis about role, not evidence of deadness; a one-line manifest comment is a claim about purpose, not proof.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |
| **Investigate-provenance** | Forked/repackaged dep whose justification is unclear | Before migrate/replace/pin: confirm the fork carries a live diff vs upstream, whether upstream has absorbed it (fork stranded), and whether the gem is exercised. Read the fork's commit history (`gh api .../commits/<branch>`) and surface the diff purpose; action is "confirm justification" when provenance can't be established from manifest comments alone |

# Dependency Review

Two surfaces: **external package health** and **internal dependency direction**.

## Scope

- External: dependency manifests, lockfiles, package registries. Covers Ruby, Node, Python, Go, Rust.
- Internal: module and package import graphs, boundary direction, shared utilities.

## Workflow

1. Detect ecosystems and list direct dependencies with constraints.
2. Gather health signals in batches (not one-by-one). Classify as Healthy, Concerning, or Dead, applying these mandatory checks before any Dead classification or removal recommendation:
   - **Finished-library check.** Before classifying on age alone, answer: is this a finished/stable library — an algorithm binding, a spec-compliant parser, a frozen format reader — where no releases is the expected steady state? If yes, classify Healthy and state that release absence is completion, not abandonment.
   - **Transitive + runtime-probe scan before any removal.** Run the lockfile dependency walk (every gem's nested dep list) AND grep installed gem `lib/` sources for `require "<gem>"` and `gem install <gem>` notice strings. A gem another gem runtime-probes (`begin; require X; rescue LoadError; warn(...)`) is load-bearing even when absent from every gemspec — that is an optional runtime enhancement and must not be flagged removable. Only confirm no live probe before recommending removal.
3. Assess migration difficulty before recommending change. Prioritize by risk and effort.
4. Map internal dependency graph hotspots and boundary crossings.
5. Identify cycles, layering violations, and junk-drawer shared modules.
6. Recommend boundary-preserving refactors where direction is wrong.

## External Package Health

Use [references/ecosystem-command-cookbook.md](references/ecosystem-command-cookbook.md) for ecosystem-specific commands.

### Health Classification

| Signal | Healthy | Concerning | Dead |
|---|---|---|---|
| Last release | < 12 months | 12-24 months | > 24 months |
| Last commit | < 6 months | 6-18 months | > 18 months |
| Open issues | Stable/decreasing | Growing unanswered | Abandoned |
| Bus factor | Team maintained | Solo + active | Solo + inactive |
| Successor | None needed | Exists, optional | Official deprecation |
| Archived | No | — | Yes |

Override: CVE = always P0. Stable "complete" libraries (algorithm bindings, spec-compliant parsers, frozen format readers) are Healthy with infrequent releases — apply the finished-library check in Workflow step 2 before classifying on age. Active fork migration = original is Dead.

### Priority

| Priority | Criteria |
|---|---|
| `P0` | Critical CVE, actively exploited |
| `P1` | High CVE, or Dead with Easy migration |
| `P2` | Concerning with successor, Medium migration |
| `P3` | Concerning, Hard migration |
| `P4` | Healthy with routine update available |

### Migration Difficulty

- **Easy**: 1-2 files, thin wrapper, drop-in replacement
- **Medium**: several files, manageable API deltas
- **Hard**: deep integration, no drop-in, architectural changes

### Git-source dependencies

Before recommending a pin style (branch / tag / ref-SHA), run three checks and default to whatever the repo already does — diverge only with a stated reason:

- `gh api repos/<org>/<repo>/tags` — existing tags and their naming convention.
- `gh api repos/<org>/<repo>/commits/<branch>` — the current resolved HEAD SHA.
- grep the manifest for sibling git-sources to detect the house convention (`tag:` vs `ref:` vs `branch:`).

Calibrate severity from the lockfile, not the ref style: a committed lockfile already freezes today's resolved SHA, so `branch:` only moves on a deliberate `bundle update <gem>` — do not treat a moving ref as high-risk by default. Surface the tradeoff when prescribing: existing tags often lag branch HEAD, so tag-pinning may require creating new tags at HEAD (a shared-state write), while SHA-pinning is zero-mutation.

## Internal Dependency Direction

Review whether module and package boundaries enforce architecture intent.

### Workflow

1. Map dependency graph hotspots and boundary crossings.
2. Identify cycles and two-way knowledge between layers.
3. Check whether high-level policy depends on low-level details.
4. Check whether shared modules have become junk drawers.
5. Recommend boundary-preserving refactors.

### Boundary Smells

- Cyclic dependencies across modules or packages
- Domain logic importing infrastructure details
- Wide fan-in to unstable or frequently changing modules
- Shared `common`/`utils`/`helpers` with no clear contract
- Feature code coupled to sibling internals instead of public interfaces
- Transitive dependency leaks through exports

## Guardrails

- Evaluate health by maintenance activity and security posture, not age alone
- Recommend change only with a concrete benefit
- Always assess migration cost before recommending replacement
- Balance theoretical purity against delivery constraints
- Split modules only when ownership and dependency direction improve
- Distinguish temporary migration seams from long-term drift

### Example Findings

**[high] Gemfile.lock:87** — `rack < 2.2.8` vulnerable to CVE-2023-22795 (reDoS in header parsing)
- **What:** The locked version of rack is below the patched release. The CVE has a known exploit path through crafted Range headers.
- **Why it matters:** Any endpoint accepting Range headers triggers the regex backtracking, enabling denial-of-service with a single request.
- **Fix:** Run `bundle update rack` to pull `>= 2.2.8`. Verify no downstream gems pin against the older version.

**[medium] package.json:45** — `lodash@4.17.20` classified Dead — no commits in 28 months, 4 open critical issues unaddressed
- **What:** lodash is frozen at a version with known prototype pollution. The package itself has been archived by the maintainer.
- **Why it matters:** No security patches will arrive. Prototype pollution enables property injection in downstream merge operations.
- **Fix:** Replace usage with native `Object.entries`/`Array.from` where possible, or migrate to `lodash-es` maintained fork. Migration difficulty: Medium (several files, but API-compatible).

**[Corrected] Gemfile.lock — `cityhash` is Healthy, not Dead (finished library, load-bearing via runtime probe)**
- **Wrong classification:** last release 2017 → flagged Dead → recommend removal.
- **Correct classification:** Healthy. `cityhash` is a thin Ruby binding over Google's finished CityHash algorithm; no releases is the expected steady state. It is also load-bearing: Shopify's `identity_cache` runtime-probes it in `cache_hash.rb` (`begin; require "cityhash"; rescue LoadError; warn(...); end`) — if loaded, the memcache hot path uses `CityHash.hash64`; otherwise a deprecation notice fires and it falls back to `Digest::MD5`. Removing it silently regresses performance and re-triggers the notice. The gem appears in no gemspec dependency list; only the transitive + runtime-probe scan found the live probe.
- **Lesson:** absence of releases is a hypothesis about role, not evidence of deadness; run the finished-library check and the probe scan before any removal.

**[Investigate-provenance] Gemfile — `active_record_doctor` forked from upstream, justification to confirm**
- **What:** The gem is forked under a private namespace rather than sourced from rubygems. Manifest comments say "validation/check-constraint awareness" but do not establish whether the fork is still justified.
- **Action — Investigate-provenance:** before migrate/replace/pin, read the fork's branch/commit history and answer: (a) does the fork carry a live diff vs upstream, and what is it; (b) has upstream since absorbed that diff (fork stranded); (c) is the gem actually exercised. Surface the diff purpose; the action is "confirm justification" when provenance can't be established from manifest comments alone — do not jump to org-migration mechanics.

## Output Template

- Ecosystems reviewed:
- External health findings (Concerning/Dead dependencies with priority):
- Internal boundary violations (cycles, layering, junk drawers):
- Migration recommendations (with difficulty and priority):
- Suggested fixes:
