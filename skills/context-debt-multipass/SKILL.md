---
name: context-debt-multipass
multipass_desc: "Measure and reduce context debt — the accumulating per-turn cost of always-loaded agent context: instruction files, memory indexes, skill descriptions, embedded system prompts. Checks volume against doctrine anchors, instruction density, load-condition placement, prose-stated constraints that belong in hooks, and cross-surface duplication. Use when the user mentions context debt, over-documentation, context budget, bloat, CLAUDE.md too long, AGENTS.md bloat, memory bloat, or token budget."
description: "-"
when_to_use: "When reviewing always-loaded agent context (instruction files, memory, skills-as-context, system prompts) for volume, density, placement, enforcement medium, or duplication cost, or when the user mentions context debt, over-documentation, context budget, bloat, CLAUDE.md/AGENTS.md size, memory bloat, or token budget."
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

# Context Debt Review

Audit the economics of agent-loaded context. Every always-loaded token is paid every turn, so volume, density, placement, and duplication are costs even when the content is correct. Context debt is accumulated always-loaded context whose per-turn cost compounds and never gets paid down — volume, instruction density, misplacement, duplication, and prose-where-hooks-belong are all forms of it.

## Scope

Discover every agent-loaded surface and classify it by load condition:

| Load condition | Meaning | Examples |
|---|---|---|
| always | Injected every session | Root and nested `AGENTS.md`/`CLAUDE.md` (incl. `CLAUDE.local.md`, `.cursorrules`, `copilot-instructions.md`, other client instruction files), auto-memory indexes (`MEMORY.md`), skill descriptions surfaced at discovery, statusline prompts |
| on-demand | Loaded only when invoked | Skill bodies (`SKILL.md`), `references/` files |
| conditional | Loaded under a path or section condition | Path-scoped rules, conditionally-scoped sections |
| non-context | Zero-token enforcement | Hooks, permissions, CI gates |

Always-loaded surfaces are reviewed for cost. On-demand surfaces are reviewed only for misclassification (content on the wrong side of a load condition). Non-context surfaces are the recommended destination for enforce-elsewhere findings, not a review target.

Under a "full review" / repo-wide scope, this lens's full scope is all agent-loaded context surfaces in the repo — not every source file.

**Out of scope:** content truth of instruction files — drift, staleness, symlink hygiene (fix type "update") → `agents-md-multipass`; human-facing docs agents never load → `docs-drift-multipass`; prompt/skill structure quality — XML structure, examples, deprecated patterns, >500-line SKILL.md bodies → `prompt-multipass`; code debt → `debt-multipass`. Findings that touch those domains are still reported here with the sibling lens named in triage — never deferred.

## References

- [references/cost-model.md](references/cost-model.md) — the measured and doctrinal ground for every check. Cite its sections in findings; never assert causal performance claims.

## Workflow

1. **Inventory.** Discover all agent-loaded surfaces in scope. Record file | load condition | lines | ≈tokens. Measure (`wc -l`, `wc -c`/4 or words × 1.3 — state the estimator used); never estimate by eye.
2. **Measure the budget.** Total always-loaded lines/≈tokens. Report against doctrine anchors (instruction files < 200 lines — cost-model §3), as measurements plus citations.
3. **Apply the checks** below, per surface and per section.
4. **Recommend dispositions** — cut / reclassify / enforce-elsewhere / SSOT pointer / keep — each with estimated recovery (≈tokens) and the rationale preserved.

## Checks

1. **Budget** — always-loaded totals vs anchors. Volume is a cost even for correct content: padding alone degrades reasoning (cost-model §1).
2. **Causal test per section** — "Would removing this cause the agent to make mistakes? If not, cut it" (cost-model §3, Anthropic per-line test).
3. **Derivable content** — directory trees, inventories, architecture overviews restating the filesystem or codebase → cut; the agent derives them by reading the repo (cost-model §3: auto-memory skips derivables).
4. **Instruction density** — count imperatives per always-loaded file; high counts mean rules compete and adherence decays monotonically with density (cost-model §2).
5. **Positional risk** — load-bearing rules buried mid-file while low-stakes content frames the ends (cost-model §1, U-curve).
6. **Semantic distance** — globally-loaded rules serving one path or task → path-scope them or move to a skill; degradation is worst when instructions are distant from the task at hand (cost-model §1, Chroma).
7. **Enforcement medium** — hard constraints ("never/must/always") living only in prose are advisory: "context, not enforced configuration." Report with the constraint quoted verbatim and a named enforcement point (PreToolUse hook, permission rule, CI gate). Highest severity when the constraint is billing/safety/public-write class and no enforcement surface exists (cost-model §3).
8. **Progressive disclosure** — multi-step procedures and narrow-scope content in always-loaded files → skill, path-scoped rule, or `references/` (cost-model §3). Check both directions: always-loaded content that should be on-demand, and on-demand content actually loaded unconditionally.
9. **Cross-surface duplication** — the same rule on N always-loaded surfaces costs N× per turn and drifts apart; consolidate to one SSOT plus pointers. Emit the duplication map.
10. **Default-restating rules** — instructions restating model/harness default behavior are no-op tokens. Verify the default actually behaves as stated before flagging (see Verification).
11. **Rationale retention** — constrains this lens's own recommendations: cuts strip structure, restatement, and derivable facts; never the rationale/why. Rationale is the highest value-per-token content and prevents future re-litigation.

## Verification

- **Derivability:** reproduce the flagged content from the repo with one command before recommending the cut.
- **Measurement:** every line/token count comes from an actual measurement; re-run it if the file may have changed.
- **Enforcement target exists:** confirm the target client has the hook/permissions surface (settings file present, feature documented) before recommending prose → hook.
- **Load-bearing check:** before recommending a cut, check git history and issue refs for incidents the rule prevents. A rule that exists because of a past failure is load-bearing even if it fails the causal test on its face — report as keep, with the evidence.
- **Load condition:** verify claimed load conditions against how the client actually loads the surface (e.g. is `CLAUDE.md` a symlink of `AGENTS.md`? does the statusline prompt actually run every turn?) — a mis-classified surface miscalculates the whole budget.

## Guardrails

- Findings carry measurements and doctrine citations, never causal performance claims ("this will degrade the model N%") — the evidence base has cohort and transfer caveats (cost-model §4).
- Every cut/reclassify recommendation quotes the rationale into its replacement — the why survives the cut.
- This lens reviews agent-loaded context only: a doc no agent loads is out of scope regardless of size or quality.
- Do not recommend cutting a constraint that lacks enforcement — recommend enforcing it (check 7 covers the gap; the cut question is separate).

### Example Findings

**[medium] CLAUDE.md:1** — always-loaded instruction file at 412 lines vs < 200-line anchor
- **What:** Root instruction file measures 412 lines (≈5.4k tokens), all always-loaded; 6 of 11 sections restate directory trees and tool inventories derivable by `ls` and `mise tasks`.
- **Why it matters:** Volume is paid every turn and reduces adherence to the rules that remain (cost-model §1, §3).
- **Fix:** Apply the per-section causal test; measured cut candidates (§ checklist 3) recover ≈180 lines. Rationale lines quoted into the trimmed file.

**[high] AGENTS.md:87** — billing-class constraint lives only in prose
- **What:** "Never route LLM calls directly to chutes.ai hosts" (verbatim) has no matching hook, permission rule, or CI gate; prose is advisory context.
- **Why it matters:** The one failure mode the rule exists for is exactly the one prose cannot block (cost-model §3: "context, not enforced configuration").
- **Fix:** Add the enforcement at the named point (bash-guard PreToolUse hook exists in `.claude/settings.json`); keep one prose line carrying the why.

## Output Template

- Surfaces inventory: (file | load condition | lines | ≈tokens)
- Total always-loaded budget:
- Cut candidates (failed causal test / derivable / default-restating), per-item estimated recovery:
- Reclassify candidates (→ skill | path-scoped | references/ | SSOT pointer):
- Enforce-elsewhere candidates (constraint verbatim + named enforcement point):
- Duplication map (rule → surfaces):
- Density/positional risks:
- Estimated budget recovered (≈tokens, % of always-loaded total):
- Verdict:
