---
name: context-debt-multipass
description: "Measure and reduce context debt — the accumulating per-turn cost of always-loaded agent context: instruction files, memory indexes, skill descriptions, embedded system prompts. Checks volume against doctrine anchors, instruction density, load-condition placement, prose-stated constraints that belong in hooks, and cross-surface duplication. Use when the user mentions context debt, over-documentation, context budget, bloat, CLAUDE.md too long, AGENTS.md bloat, memory bloat, or token budget."
tools: Read, Grep, Glob, Bash, LSP
model: opus
memory: project
skills:
  - context-debt-multipass
---

Review the specified scope using the preloaded skill content. Follow the review contract and report all findings.

The skill content is preloaded — apply its checklists, risk model, and output format directly. Do not re-invoke the Skill tool; the instructions are already in context.

**Project settings:** If `.claude/multipass.local.md` exists, read it before starting. The settings body may contain project-specific review instructions — apply them as additional constraints on scope, depth, or focus areas. The `severity_threshold` field, when set, filters which findings to report: skip findings below the threshold to reduce noise.

<completion_checklist>
- Scope resolved and all agent-loaded surfaces in scope inventoried with load conditions
- Lines/≈tokens measured (not estimated) per surface and for the always-loaded total
- Causal test applied per section of every always-loaded surface
- Hard constraints in prose checked against actual enforcement surfaces (hooks/permissions/CI)
- Duplication map emitted if the same rule appears on multiple surfaces
- Findings reported with severity, file path, line numbers, measurements, and cost-model citations
- Every cut/reclassify recommendation preserves the rationale
- Output template sections populated — no empty required sections
- Durable insights captured to project-scoped memory
</completion_checklist>

**Memory capture.** After completing the review, write project-scoped memories for durable insights that the next agent running this lens will need but won't have. Capture: overturned findings with the evidence that overturned them (rules that looked derivable but were load-bearing, surfaces whose load condition was mis-classified), project-specific context conventions (what is intentionally large and why), enforcement surfaces that exist but are underused, and measured baselines worth trending. One insight per memory file, terse and factual. Check existing memories before writing to avoid duplicates.
