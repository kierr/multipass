---
name: run
description: Run a concurrent multi-lens review. Auto-discovers relevant agents, spawns them in parallel, synthesizes one report.
---

Ultrathink

# Multipass Parallel Run

Auto-discover relevant review agents, spawn them concurrently, synthesize one report.

## Scope

- One broad review pass that selects the right specialist agents, runs them in parallel, and synthesizes one report.
- Eligible agents: any `-multipass` agent from this plugin.

## Thoroughness Mandate

Identical to the serial multipass skill. This is the only lens the user trusts for full coverage — gaps here are invisible gaps.

- **Select agents by contextual relevance.** An agent is included when its declared surfaces, risk lenses, or specialty match the changed files, domain, or risk surface.
- **Report all findings at face value with their original severity.**
- **Scale review depth with changeset size.** Large changesets warrant more agents; focused changesets warrant fewer.
- **Spawn every selected agent.** Selection is a commitment.
- **Positive observations are not findings.** Report them in the "Positive notes" section of the output template. Do not assign severity levels or inflate finding counts with observations about what the code does well. Finding counts reflect actual issues that need attention.

## Changed files

```!
git diff --name-only
git ls-files --others --exclude-standard
```

## Scope Resolution

**When the user specifies scope** (file path, "the PR", a commit hash, "everything", a branch name), use that scope directly.

**Default scope** when the user provides no explicit scope — use the first match:

1. **Branch diff.** If on a non-default branch (not main/master), diff against the merge base: `git diff $(git merge-base HEAD origin/main)...HEAD`. This captures the full branch changeset.
2. **Changed files.** If the changed files list above is non-empty, use those files as scope.
3. **Recent commits.** If on the default branch with an empty changed files list, review the last 5 commits (`git log --oneline -5`).

**Scope overrides:**
- "review the PR" / "pr review" → `gh pr view` to get the PR, then `git diff <base>...HEAD`
- "full review" / "review everything" → all source files in the repo
- Named file or directory → that path only

## Agent Selection

### Available Specialists

```!
python3 -c "
import yaml, os, glob
paths = glob.glob('skills/*/SKILL.md') + glob.glob(os.path.expanduser('~/.claude/plugins/cache/multipass/multipass/*/skills/*/SKILL.md'))
seen = set()
for path in sorted(paths):
  lines = open(path).readlines()
  if not lines or lines[0].strip() != '---': continue
  try:
    end = next(i for i,l in enumerate(lines[1:],1) if l.strip()=='---')
    fm = yaml.safe_load(''.join(lines[1:end]))
  except: continue
  name = fm.get('name','')
  if name in ('run','multipass-configure','new-multipass-lens') or name in seen: continue
  seen.add(name)
  desc = fm.get('multipass_desc','')
  if not desc or desc == '-':
    desc = fm.get('description','')
  if desc and desc != '-' and name:
    print(f'- {name}: {desc}')
" 2>/dev/null || echo "# Agent discovery failed — fall back to manual selection"
```

If the Available Specialists list is empty (the `!` template block did not execute or found no matches), fall back to: (1) the **canonical lens list** in this plugin's `README.md` "Available Lenses" table (each row is `agent-name` → domain), or (2) list all directories under skills/ matching *-multipass and read each SKILL.md's `multipass_desc` field (falling back to `description` if `multipass_desc` is absent or `-`). Build the specialist list from that, then proceed — discovery failure does not change the binding rule that each selected lens runs as its dedicated agent.

1. Inspect the user request, current repo context, changed files, and untracked files.
2. Match the specialists above to the changeset. Agents follow the naming convention `<domain>-multipass`.
3. Select agents using context-based selection:
   1. Add agents whose specialty matches what changed. Match on concrete signals: file extensions, directory paths, framework/library names, infrastructure patterns.
   2. Include `wide-multipass` when the scope spans multiple domains or when no specialist fully covers the changeset.
   3. Exclude agents whose specialty has no connection to the changeset.
4. **Breadth guarantees.** After context-based selection, enforce these mandatory inclusions:

   - **Security surface:** Always include `security-multipass` when the changeset contains server-side code that handles user input — controllers, handlers, views, serializers, API endpoints, GraphQL resolvers, form processors, middleware, or any file containing `params`, `request`, `req.body`, or equivalent input-access patterns. Match on file content and naming signals, not just directory conventions.
   - **Access control:** Always include `access-control-multipass` when the changeset touches authorization surfaces — policies, permissions, roles, guards, tenant scoping, or authorization framework usage (`authorize`, `pundit`, `can?`, `ability`).
   - **Test parity:** Always include `test-multipass` when new source files are added without corresponding test files, or when test files are deleted while the source remains.
   - **Context surface:** Always include `context-debt-multipass` when the changeset grows agent-loaded context — instruction files (`AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md`, `.cursorrules`, `copilot-instructions.md`), auto-memory indexes (`MEMORY.md` or a `memory/` dir of loaded memory files), `skills/*/SKILL.md` descriptions, embedded system prompts or statusline prompts in code/config. Match on file path; net-negative diffs (pure deletions) do not force inclusion.
   - **Suppression surface:** Always include `debt-inventory-multipass` when the changeset touches a linter/formatter/type-checker config (`.rubocop.yml`, `.eslintrc*`, `biome.json`, `.stylelintrc`, `.sorbet.yml`, `pyproject.toml`, `tsconfig*.json`, `.golangci.*`, `buf.yaml`, `.gitleaks`), a regenerating baseline (`*_todo.yml`, `sorbet_untyped_baseline.json`, `sorbet/rbi/`, `baseline.json`, `.ruff-baseline`, an ignore-list), a test that asserts a numeric cap/ratchet/freeze/count on suppression entries (`ratchet`, `freeze`, `cap`, `MAX`), or adds an inline-disable (`rubocop:disable`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `type: ignore`, `noqa`, `nolint`). Match on file path and these content signals.

   If a guaranteed agent was already selected by context matching, do not double-count it.
5. Tie-break: prefer `wide-multipass` as the generalist safety net over adding irrelevant specialists.

## Parallel Execution (Step 6)

**Binding rule — spawn the dedicated `*-multipass` agents, never generic substitutes.** Every selected lens MUST run as its dedicated agent (`subagent_type: "<lens>-multipass"`). Each `<lens>-multipass` agent definition carries `skills: [<lens>-multipass]` in its frontmatter, which PRELOADS the full review contract, self-challenge protocol, severity model, domain checklist, and output template into that agent's context. That preloaded content is the entire reason the agent exists — it is what makes a security review a *security* review rather than a generic glance.

**Do not substitute `general-purpose`, `Explore`, `fork`, or any non-multipass agent for a selected lens.** A generic agent does not have the preloaded skill, so it either skips the checklist or forces you to hand-paste an ad-hoc prompt — both yield shallower, inconsistent findings and silently drop the lens's verification steps. This holds even if a prior session memory claims the multipass agents are "permission-denied" or "unavailable": they are first-class agent types registered by this plugin and are the intended execution unit. If you are about to fall back to a generic agent, stop — you are off-path; fix the spawn instead of replacing the agent.

**If a dedicated agent fails to spawn** (transient error, safety-classifier outage, concurrency cap), RETRY that same lens's dedicated agent — in a smaller batch if needed — until it lands or you have hard evidence the agent type itself is unusable. Do not convert the slot to `general-purpose`. A lens that genuinely cannot spawn is recorded as a gap in the final report (with the failure reason), not silently substituted.

**The only sanctioned fallback**, if the dedicated agent type is provably unusable in this harness, is to invoke the Skill tool to load `<lens>-multipass` into the current context and apply its contract verbatim — never invent a review prompt from memory. This runs in the orchestrator context, so reserve it for the rare hard block and report it as a gap.

For each selected agent, use the Agent tool:

```
Agent(
  description="<agent-name> review",
  prompt="Review the following scope: <scope description>. Follow the preloaded skill content. Report all findings with severity, file path, and line numbers.",
  subagent_type="<agent-name>",
  model="opus"
)
```

- `<agent-name>` is the lens name without the plugin namespace prefix (e.g., `security-multipass`, not `multipass:security-multipass`). If the harness does not resolve the short name, use the fully-qualified `multipass:<agent-name>`.
- `model` — **opus, always. Never spawn a multipass agent on sonnet or haiku.** Code review is pure judgment work; weaker models produce plausible-but-shallow reports that silently miss findings, which is worse than no review because it manufactures false confidence (verified empirically: a sonnet arm returned a one-line "memories saved" summary for the same lens where the opus arm returned ten findings including two high-severity bugs). Set `model="opus"` on every spawn. A `.claude/multipass.local.md` `model_overrides` entry may pin a *specific opus variant* but must never downgrade — any non-opus value is invalid and ignored. The explicit model also satisfies environments that reject model-less agent spawns.
- Place all Agent calls in one message block so they execute concurrently; spawn the full set before waiting for results. Each agent runs in its own context window.
- Each agent already has its skill content preloaded — do NOT tell it to invoke the Skill tool.
- Pass the review scope in the prompt so the agent knows what to review.

## Verification (Step 7 — mandatory)

Before synthesizing output:

1. List every Agent tool call made. For each, state: the agent name and **a one-line excerpt from its actual response**.
2. If the answer to question 1 is empty, STOP. You have not spawned any agents. Any findings you produce now are fabricated. Go back and execute the previous step.
3. For each agent that returned empty or failed, record it as a gap with the failure reason.
4. **Agent-fidelity audit.** For every spawned agent, confirm its `subagent_type` was the dedicated `<lens>-multipass` agent (or, under the sanctioned fallback in Step 6, that the Skill tool loaded `multipass:<lens>-multipass` into its context). Any lens that ran via `general-purpose` or another non-dedicated agent WITHOUT loading the skill is a **degraded lens**: list it in **Gaps** as `degraded: <lens> (ran via <subagent_type>, canonical skill not loaded)`, and weight its findings lower-confidence during merge — they reflect ad-hoc focus, not the lens's curated contract. This turns a silent substitution visible at synthesis instead of letting it leak into the report as if the real lens ran.

## Merge and Output (Steps 8-9)

Merge findings using root-cause clustering:
- Group findings that reference the same files, resources, or behavioral gap across agents.
- When multiple agents flag the same root cause, keep the finding from the agent with the strongest ownership claim as primary. Fold others as supporting evidence.
- Rank deduplicated findings by severity, then by number of agents that flagged the same root cause.

### Output Template

**Header:**
- **Scope:** (files/paths reviewed)
- **Scope source:** (explicit user scope | default diff | branch diff | last N commits)
- **Modes:** review-only, parallel execution
- **Agents:** (comma-separated, ✓ completed / ✗ failed with reason)

**Findings table:**

| # | Sev | Finding | Agent | File(s) |
|---|-----|---------|-------|---------|
| 1 | High | one-line description | owning-agent (+supporting) | path:line |

**Finding details:** expanded What/Why/Fix for each confirmed finding.

**Cross-cutting themes:** (1-3 bullets — patterns spanning multiple agents)

**Gaps:** (agents that failed to load or were excluded with justification)

**Positive notes:** (patterns worth reinforcing)

**Triage:** Present finding triage with suggested actions (Fix / TODO / Issue).
