---
name: security-multipass
multipass_desc: "Review security posture across trust boundaries — authn/authz, input handling, secret management, dependency exposure, and exploit paths. Includes hop-by-hop input-flow tracing from entry points to data layer."
description: "-"
when_to_use: "When reviewing security posture, trust boundaries, auth, secrets, or when the user mentions security, vulnerabilities, or attack paths."
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

# Security Review

Review realistic attack paths and impact, then report prioritized, actionable risks.

## Scope

- Identify trust boundaries: public inputs, internal services, third-party systems, and privileged operations.
- Identify sensitive assets: credentials, tokens, PII, billing paths, admin actions, and persistent data.
- Include generic container and build surfaces such as Dockerfiles, image defaults, and Compose files when they are in scope.
- Focus on exploitability and blast radius, not checklist theater.

## Workflow

1. Map entry points and privileged actions.
2. **Trace input flows hop-by-hop.** For each controller action or entry point that handles user input:
   1. **Identify user-controlled sources:** request parameters, query strings, headers, cookies, file uploads, URL paths, request bodies, external API responses used in downstream operations.
   2. **Trace each source through every hop to the data layer or external call.** At each boundary, verify protection:
      - **Entry → Controller:** Are params permitted (strong parameters, permit list, input DTO validation) or raw?
      - **Controller → Model/Service:** Are values passed as bind parameters or interpolated into strings?
      - **Model/Service → Database:** Are queries parameterized (bound params, prepared statements, ORM scopes) or string-interpolated?
      - **Model/Service → Shell:** Are values passed via argument arrays (`exec(cmd, arg1)`) or shell-interpolated (`system("cmd #{arg}")`)?
      - **Model/Service → HTML/JSON response:** Are values escaped or raw-rendered?
   3. Flag any hop where user input reaches a sensitive operation without parameterization or sanitization.
3. Verify authn and authz decisions on sensitive operations.
4. Review secret handling, storage, logging, and rotation assumptions.
5. Review common vulnerability classes relevant to the stack.
6. Prioritize by impact and ease of exploitation.

## Common Risk Areas

- Injection risks: SQL, command, template, deserialization
  - String interpolation in SQL: `"WHERE id = #{params[:id]}"`, `f"WHERE id = {request.args.get('id')}"`
  - Raw params in shell commands: `system("convert #{path}")`, `subprocess.run(f"ls {user_input}")`
  - Dynamic column/table names from user input
  - `eval`, `send`, `public_send`, `method` with user-influenced arguments
  - `JSON.parse` on user input without schema validation
  - `YAML.load` on user input (should use `safe_load`)
  - Unescaped output: `raw`, `html_safe`, `v-html`, `innerHTML`, `dangerouslySetInnerHTML`
  - Missing permit: `params[:user]` instead of `params.require(:user).permit(...)`
- Path traversal and unsafe file operations
- SSRF and untrusted outbound fetch behavior
- Broken authz checks or tenant-isolation failures
- Sensitive data exposure in logs, errors, or debug endpoints
- Insecure defaults, weak crypto choices, or missing transport guarantees
- Container risks: root users, broad capabilities, secret leakage, weak base-image hygiene, unsafe mounts, and overexposed ports
- Dependency or supply-chain trust issues

## Guardrails

- Report findings with a plausible exploit path instead of speculative observations, because actionable security findings require a concrete attack scenario.
- Separate defense-in-depth improvements from actual vulnerabilities, because they have different urgency and fix strategies.
- Report each risk as a distinct item with its own exploit path instead of collapsing multiple risks into one vague entry.
- Include deployment-context assumptions when exploitability depends on them, because the same code may be safe or vulnerable depending on environment.
- Defer Flux, Helm, Terraform, Talos, cluster policy, and GitOps-specific controls to project-scoped IaC or GitOps review skills.

## Useful Checks

Look for trust boundary crossings and unsafe operations:

```bash
rg -n "params\[:|request\.body|eval\(|exec\(|system\(" --type ruby --type py
rg -n "authorize|pundit|can\?|ability|before_action.*authenticate"
rg -n "BCrypt|digest|encrypt|OpenSSL|secrets\.secret_key_base"
rg -n "send_file|send_data|render.*file|File\.read.*params"
git diff --name-only

# Input-flow tracing — boundary protection
rg -n "params\[|request\.|req\.body|ctx\.request|input\[" --type ruby --type py --type ts
rg -n "params\.permit|params\.require|strong.parameters|attr_accessible"
rg -n "interpolate|format.*params|f\".*{.*request|#\{.*params" --type ruby --type py
rg -n "eval\(|send\(|public_send\(|__send\(" --type ruby
rg -n "raw\(|html_safe|v-html|innerHTML|dangerouslySetInnerHTML" --type ruby --type ts --type js
rg -n "YAML\.load\b" --type ruby  # should be YAML.safe_load
```

Use existing security tests, static analyzers, and threat-model docs when available.

### Example Findings

**[high] app/controllers/api/v2/exports_controller.rb:34** — user-supplied path traversal in file download
- **What:** `send_file(params[:path])` passes user input directly to the filesystem without sanitization or allowlist.
- **Why it matters:** An attacker can request `../../etc/passwd` or any file readable by the process, leaking secrets, configs, or PII.
- **Fix:** Map `params[:id]` to an allowlisted export directory and validate the resolved path stays within it: `path = Rails.root.join("exports", params[:id]).to_s; raise unless path.start_with?(Rails.root.join("exports").to_s)`.

**[medium] config/initializers/session_store.rb:12** — session cookie missing `secure` and `httponly` flags
- **What:** The session cookie is set without `secure: true` and `httponly: true` in production.
- **Why it matters:** Without `secure`, the cookie transmits over HTTP during mixed-content loads, enabling network sniffing. Without `httponly`, XSS can read session tokens.
- **Fix:** Add `secure: Rails.env.production?, httponly: true, same_site: :strict` to the session store configuration.

## Output Template

- Threat surfaces reviewed:
- Confirmed vulnerabilities:
- High-risk weaknesses:
- Defense-in-depth improvements:
- Required fixes before release:
- Residual risk and assumptions:

Prioritize the smallest fix that reliably breaks the attack path.
