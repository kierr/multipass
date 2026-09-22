---
name: new-multipass-lens
description: Create a new multipass review lens (skill + agent pair) in the plugin.
when_to_use: When adding a new specialist review skill, creating a review lens, or the user mentions new multipass lens.
---

# New Multipass Lens

Create a new review lens (skill + agent pair) in the multipass plugin.

## Input

The user provides:
- **Lens name** (e.g., `kubernetes-multipass`, `api-multipass`)
- **Domain** — what the lens reviews
- **Key risk surfaces** — what to watch for

## Steps

1. Read an existing lens for the template pattern:
   - Skill: `skills/security-multipass/SKILL.md`
   - Agent: `agents/security-multipass.md`

2. Read an existing lens for the shared review contract pattern (scope hierarchy, finding format, self-challenge protocol).

3. Create the skill directory and SKILL.md:
   - Directory: `skills/<name>/`
   - Frontmatter fields to set:
     - `name: <name>`
     - `multipass_desc: "<description>"` — the full description, always double-quoted
     - `description: "-"` — sentinel required by the platform's frontmatter loader (field must be non-empty); the real description for agent selection lives in `multipass_desc`. Leaving a real value here causes the run/SKILL.md parser to use it on the fallback path instead of `multipass_desc`.
     - `allowed-tools:` Read, Grep, Glob, Bash, LSP
   - Body must include the branch-aware scope section (branch diff → working tree → recent commits)
   - Body must include a self-challenge protocol specific to this domain
   - Body must follow the finding format from the shared review contract

4. Create the agent definition:
   - File: `agents/<name>.md`
   - Frontmatter:
     - `name: <name>`
     - `description: "..."` copied (double-quoted) from the skill's `multipass_desc` field
     - `tools: Read, Grep, Glob, Bash, LSP`
     - `model: opus` (all multipass agents are opus-class — never inherit, sonnet, or haiku)
     - `memory: project`
     - `skills: [<name>]`
   - Body: brief delegation instruction (same pattern as existing agents, including the memory capture section after the completion checklist)

5. Validate the new lens:
   - Check SKILL.md frontmatter has all required review fields
   - Check agent .md references the correct skill name
   - Verify file paths are consistent

## Checklist

- [ ] SKILL.md has `multipass_desc` with the lens description (double-quoted, plain scalar) and `description: "-"`
- [ ] SKILL.md has `when_to_use` with domain-specific trigger phrases, double-quoted
- [ ] `multipass_desc` includes trigger phrases for automatic discovery
- [ ] Body includes branch-aware scope section
- [ ] Body includes domain-specific self-challenge protocol
- [ ] Agent .md references the correct skill name in `skills` field
- [ ] Agent .md `description` matches SKILL.md `multipass_desc` exactly (double-quoted)
- [ ] Agent tools are read-only (no Edit, Write)
- [ ] No `context: fork` in SKILL.md (agent handles isolation)
