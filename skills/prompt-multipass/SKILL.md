---
name: prompt-multipass
multipass_desc: "Review prompts, system prompts, AGENTS.md, and SKILL.md files for prompt engineering quality — structure, anti-patterns, thinking config, tool use."
description: "-"
when_to_use: "When reviewing prompts, system prompts, AGENTS.md, SKILL.md for prompt quality, or when the user mentions prompt engineering or prompt quality."
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

# Prompt Review

Review prompts, system prompts, AGENTS.md/CLAUDE.md files, SKILL.md files, and instruction sets for prompt engineering quality issues.

## Scope

**Review targets:** Prompts (user-facing or internal system prompts), system prompt blocks in code or configuration, instruction files (AGENTS.md, CLAUDE.md, SKILL.md), tool use setup, agentic system design, thinking configuration, prompt-specific anti-patterns and deprecated constructs.

## Workflow

1. Identify the prompt/instruction artifacts in scope (system prompts, AGENTS.md files, SKILL.md descriptions, configuration prompts, etc.)
2. Apply the checklist items below in order of priority: missing WHY constraints first (high-impact), then structural issues, then deprecated patterns
3. For each finding, note the location, severity (High/Medium), description, and suggested fix
4. Validate: check that reasoning is specific enough for Claude to generalize, that deprecated patterns are fully replaced, that examples cover edge cases

## Guardrails

- Focus on **prompt engineering effectiveness**, not subjective style. A finding must map to Anthropic guidance or a specific anti-pattern.
- Do not review for grammar, tone, or brand voice — only structure and engineering quality.
- Do not overlap with `skill-engineering` (lifecycle, scoring), `agents-md-multipass` (organizational drift), `context-debt-multipass` (always-loaded volume, placement, enforcement medium), or `llm-safety-multipass` (injection, trust boundaries).
- When a prompt is embedded in code (e.g., system prompt in a Python file), treat it as a prompt artifact and audit it.
- Deprecated patterns are findings only on modern models (Opus 4.6, Sonnet 4.6). For legacy codebases targeting older models, note the model version and only flag deprecations if actual migration is feasible.

## Checklist: What to Look For

### Missing or Implicit Constraints (HIGH PRIORITY)

1. **Explicit WHY is missing.** Rules stated without reasoning.
   - Bad: `"Never use ellipses."`
   - Good: `"Never use ellipses — this is read aloud by TTS. Breaks audio flow."`
   - Fix: Add reasoning that Claude can generalize to related cases.

2. **Vague directives.** No clear output shape or success criteria.
   - Bad: `"Improve this code."`
   - Good: `"Refactor this function: extract repeated logic into a helper, reduce cyclomatic complexity below 5, preserve all tests."`

### Structural Issues

3. **Missing XML tags for complex prompts.** Multi-section prompts need `<instructions>`, `<context>`, `<input>`, `<documents>` tags.
   - Check: If the prompt has 5+ distinct sections or mixes reference data with instructions, does it use XML tags?

4. **Weak or missing examples.** Fewer than 3 examples, or examples don't cover edge cases.
   - Fix: Add 3–5 diverse examples including boundary conditions and failure cases.

5. **Context ordering issue.** For long documents (20k+ tokens), query comes before document.
   - Fix: Move documents to top, query to end. Improves quality ~30%.

### Deprecated Patterns (HIGH PRIORITY on modern models)

6. **`budget_tokens` on Claude Opus 4.6 or Sonnet 4.6.**
   - Old: `thinking={"type": "enabled", "budget_tokens": 10000}`
   - New: `thinking={"type": "adaptive"}, output_config={"effort": "high"}`
   - Fix: Migrate to adaptive thinking.

7. **Prefilled responses on Claude 4.6+.**
   - Old: System prompt includes prefilled `<assistant_response>` block or message template.
   - Fix: Remove. Use structured outputs, direct instruction (`"Respond without preamble"`), or user-turn continuation instead.

### Extended/Adaptive Thinking Issues

8. **Effort level missing or inappropriate.**
   - Missing: No `output_config={"effort": ...}` in adaptive thinking setup for a complex reasoning task.
   - Inappropriate: `effort: "low"` for research synthesis or multi-step logic.
   - Fix: Add or adjust effort level based on task complexity.

9. **Tool use with thinking not constrained.**
   - Issue: `tool_choice: "force"` or `"specific_tool"` with thinking enabled (invalid).
   - Fix: Use only `"auto"` or `"none"` with thinking.

10. **Thinking blocks not passed back.** When referencing earlier thinking, the block is summarized instead of passed back unmodified.
    - Fix: Pass original thinking block unmodified when providing tool results.

### Tool Use Issues

11. **Emphatic force-instructions on modern models.**
    - Bad: `"CRITICAL: You MUST use [tool] for every change."`
    - Better: `"Use [tool] when you need to..."`
    - Issue: Force-instructions cause overtriggering on 4.5+. Conditional framing is more effective.
    - Fix: Replace emphatic imperatives with conditional guidance.

12. **Missing parallel tool guidance.** When multiple independent operations exist, no `<use_parallel_tool_calls>` block.
    - Fix: Add block to system prompt for ~100% parallel adoption.

13. **Explicit intent missing.** Tool invocation relies on Claude inferring intent from context.
    - Bad: `"Can you suggest changes?"`
    - Good: `"Modify this function to..."`
    - Fix: Be direct about the desired action.

### Agentic System Issues

14. **No safety/reversibility prompt for destructive tools.**
    - Issue: System prompt permits destructive operations (rm, git reset --hard, DROP TABLE, external writes) without confirmation.
    - Fix: Add `<reversibility>` block requiring explicit confirmation.

15. **Missing context-window awareness for multi-window workflows.**
    - Issue: No guidance that Claude should not stop early due to token budget.
    - Fix: Add: `"Do not skip steps or cut short reasoning to stay under a token limit. If approaching the context window, I will continue this conversation in the next message."`

16. **Subagent overuse guidance missing.** For systems that can spawn subagents, no explicit scope.
    - Issue: Opus 4.6 spawns subagents for simple grep-level tasks.
    - Fix: Add `<subagent_guidance>` block with clear when/when-not-to criteria.

17. **Missing anti-pattern guardrails.** No `<investigate_before_answering>` block to prevent hallucination or hard-coding.
    - Fix: Add block directing to read files before reasoning about them.

### AGENTS.md / CLAUDE.md Issues

18. **Instruction using what-NOT-to-do instead of what-TO-do.**
    - Bad: `"Do not use weak variable names."`
    - Good: `"Use clear, descriptive variable names that convey intent."`
    - Fix: Reframe as positive direction.

19. **Overly prescriptive system prompts for simple tasks.** Overkill ceremony, too many nested guardrails.
    - Fix: Evaluate each paragraph — does Claude really need this? Remove non-essentials.

### SKILL.md Issues (if reviewing skills)

20. **Description is vague or first-person.**
    - Bad: `"I can help you with PDFs"` / `"Helps with documents"`
    - Good: `"Extracts text and tables from PDF files. Use when working with PDFs or when the user mentions forms."`
    - Fix: Rewrite to third-person WHAT+WHEN.

21. **SKILL.md body over 500 lines.**
    - Fix: Move heavy detail to `references/` subdirectory. Keep body concise.

22. **No progressive disclosure.** References point to other references (A→B→C chains).
    - Fix: Flatten to one level. A should point directly to C.

23. **Reserved words in skill name.** Name contains "anthropic", "claude", "openai", XML tags.
    - Fix: Rename to be generic and descriptive.

### Hook-Specific Issues

24. **Missing re-entry guard in Stop hooks.** Stop hooks that return `decision: "block"` without checking `stop_hook_active` will loop indefinitely — the hook blocks, Claude continues, hits stop again, hook blocks again.
    - Fix: Check `stop_hook_active` at the top and `exit 0` when true.

25. **Hook registered in managed-settings.** Hooks in managed-settings.json silently fail to load due to a platform bug where `skipDangerousModePermissionPrompt` suppresses the approval flow.
    - Fix: Move to `~/.claude/settings.json` (global) or project `.claude/settings.json`.

26. **Hook reason over-specifies procedure.** Stop hook reasons that include detailed step-by-step instructions override the stop agent's own procedure with a narrower prompt.
    - Fix: Keep the reason minimal — state what's wrong, name the agent to spawn, stop there.

### Agent Definition Issues

27. **Authority chain conflict with invoked skills.** The agent prompt contradicts rules in skills it loads via `skills:` frontmatter. Weaker models resolve contradictions unpredictably — usually by following whichever instruction has stronger emphasis.
    - Fix: Resolve conflicts explicitly at the agent level. Use XML blocks (e.g., `<commit_guidance>`) to pass overrides.

28. **Exit condition satisfiable by destruction.** Rules like "do not stop until git status is clean" or "working tree must be clean after this step" create pressure to delete files rather than commit or report them.
    - Fix: Make exit conditions observational ("report remaining files") not gates ("must be empty").

29. **Missing completion checklist.** Agent definitions without an explicit `<completion_checklist>` are vulnerable to "nothing to do" short-circuits, especially on Haiku-tier models.
    - Fix: Add a checklist of concrete verification items that must all be true before reporting done.

30. **Missing state-gathering step.** Agent jumps directly into work without first collecting named state variables. Weaker models then reason about implicit state from tool outputs, leading to errors.
    - Fix: Add a Step 1 that runs diagnostic commands and records named variables (e.g., BRANCH, HAS_DIRTY_FILES, IS_FEATURE_BRANCH).

31. **Nested conditionals instead of flat decision tree.** `if X then if Y then Z` structure that Haiku-tier models fail to follow correctly.
    - Fix: Use sibling XML blocks (`<if_feature_branch>`, `<if_main_branch>`) each containing a complete procedure.

## Output Template

- Scope:
- Prompt artifacts reviewed:
- Missing or implicit constraints (WHY, vague directives):
- Structural issues (XML tags, examples, context ordering):
- Deprecated patterns (budget_tokens, prefilled responses, emphatic force-instructions):
- Tool use issues (parallel guidance, intent, thinking constraints):
- Agentic system issues (reversibility, context awareness, subagent scope):
- AGENTS.md / SKILL.md issues (negative framing, over-prescription):
- Suggested fixes:
- Not reviewed:
