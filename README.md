# Multipass Plugin

Concurrent multi-lens code review for Claude Code. Each review specialist runs as a dedicated agent with its own context window and persistent project memory.

## What's Included

- **51 review agents**, each wrapping a specialist skill (security, CI, complexity, performance, etc.)
- **51 review skills**: the domain knowledge and checklists for each lens
- **Run skill**: parallel orchestrator that auto-discovers and spawns relevant agents, then synthesizes one report
- **Configure skill** — per-project settings for lens selection, models, and thresholds
- **New-lens skill** to scaffold new review lenses

## Usage

Spawn agents in parallel for concurrent review:

```
Spawn these agents in parallel to review the working tree:
- security-multipass
- ci-multipass
- complexity-multipass
```

Or use individual agents directly:

```
Use the security-multipass agent to review src/auth/
```

## Available Lenses

| Agent | Domain |
|-------|--------|
| `access-control-multipass` | Authorization models (RBAC, IDOR, tenant isolation) |
| `agents-md-multipass` | AGENTS.md/CLAUDE.md instruction files |
| `api-contract-multipass` | API contracts (HTTP, RPC, GraphQL, events) |
| `api-design-multipass` | API design quality (REST conventions, idempotency, versioning) |
| `auth-multipass` | Authentication flows (OAuth/OIDC, JWT, sessions) |
| `breaking-change-multipass` | Backward-compatibility risk |
| `caching-correctness-multipass` | Cache invalidation, TTL consistency, stampede protection |
| `ci-cost-multipass` | CI/CD cost waste |
| `ci-multipass` | CI/CD pipeline safety |
| `complexity-multipass` | Unnecessary complexity, over-abstraction |
| `concurrency-multipass` | Race, deadlock, cancellation risks |
| `config-safety-multipass` | Configuration behavior changes |
| `context-debt-multipass` | Always-loaded agent context: volume, density, placement, enforcement medium |
| `data-contract-multipass` | Data contract consistency across config/schema/code |
| `data-pipeline-multipass` | Multi-stage data flow failures |
| `data-quality-multipass` | Counter caches, normalization, drift |
| `debt-inventory-multipass` | Suppression surfaces (Exclude ledgers, baselines, ratchets) |
| `debt-multipass` | Actionable technical debt |
| `deduplication-multipass` | Structural duplication, copy-paste divergence |
| `dependency-multipass` | Dependency health, coupling |
| `dockerfile-multipass` | Dockerfile efficiency |
| `docs-drift-multipass` | Documentation vs code drift |
| `error-handling-multipass` | Error propagation, swallowed exceptions |
| `event-driven-multipass` | Event/messaging ordering, idempotency, replay safety |
| `feature-flags-multipass` | Feature flag hygiene, stale flags, retirement paths |
| `frontend-multipass` | Frontend TS/JS/TSX correctness |
| `gitops-multipass` | GitOps manifests (Kustomize, Helm, Flux) |
| `k8s-multipass` | Kubernetes manifests (Deployments, probes, quotas) |
| `llm-safety-multipass` | Prompt injection, agent safety |
| `loop-safety-multipass` | Infinite loops, runaway redrives |
| `mcp-multipass` | MCP server safety |
| `migration-safety-multipass` | Database migrations (lock risk, rollback, expand-contract) |
| `mise-multipass` | mise.toml configuration |
| `model-routing-multipass` | Provider routing, fallbacks |
| `observability-multipass` | Logs, metrics, traces, alerts |
| `outdated-multipass` | Patterns from a different era |
| `performance-multipass` | Latency, throughput, allocations |
| `pii-multipass` | Personal data flows |
| `prompt-multipass` | Prompt engineering quality |
| `redis-multipass` | Redis code, Lua scripts, key schemas |
| `release-multipass` | Release process (versioning, changelogs, rollback) |
| `ruby-multipass` | Ruby/Rails correctness |
| `schema-multipass` | Database schema quality |
| `scraping-resilience-multipass` | Scraper fragility |
| `security-multipass` | Auth, input handling, secrets, exploit paths |
| `state-machine-multipass` | Status transitions, lifecycle |
| `structure-multipass` | Repository layout quality |
| `substrate-multipass` | Canonical layer authority, stranded substrates |
| `test-multipass` | Test confidence quality |
| `type-safety-multipass` | Type discipline, strictness gaps, escape hatches |
| `wide-multipass` | General bugs and regressions |

## Configuration

Per-project settings at `.claude/multipass.local.md` (not committed):

```markdown
---
default_include:
  - security-multipass
  - ci-multipass
always_exclude:
  - gitops-multipass
concurrency_limit: 5
model_overrides:
  security-multipass: opus
severity_threshold: medium
default_scope: branch-diff
---

Project-specific review instructions go here.
```

Use `/multipass-configure` to set up or update settings.

### Settings Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default_include` | list | `[]` | Lenses to always include |
| `always_exclude` | list | `[]` | Lenses to never include |
| `concurrency_limit` | int | `10` | Max parallel agents |
| `model_overrides` | map | `{}` | Per-lens opus-class model pin (`opus`); sonnet/haiku invalid |
| `severity_threshold` | string | `low` | Min severity: `critical`, `high`, `medium`, `low` |
| `default_scope` | string | `working-tree` | Default review scope |

## Adding New Lenses

Use `/new-multipass-lens` to scaffold a new skill + agent pair.

## Architecture

```
multipass/
├── .claude-plugin/plugin.json
├── agents/                    # 51 agent definitions
│   └── <name>-multipass.md
├── skills/                    # 54 skills (51 lenses + 3 utility)
│   ├── run/                   # parallel orchestrator
│   ├── new-multipass-lens/    # scaffold new lenses
│   ├── multipass-configure/   # per-project settings
│   └── <name>-multipass/      # domain skills
│       ├── SKILL.md
│       └── references/        # per-domain reference files
├── scripts/
│   └── opencode-bridge.sh     # bridge skills into OpenCode
└── README.md
```

## OpenCode Bridge

Multipass is authored as a Claude Code plugin. To reuse the skill library with [OpenCode](https://opencode.ai), run the bridge script:

```sh
scripts/opencode-bridge.sh                 # → ~/.config/opencode/skills/
scripts/opencode-bridge.sh -o /other/path  # custom destination
scripts/opencode-bridge.sh -n              # dry run (list skills)
```

The bridge handles three incompatibilities between the two ecosystems:

1. **Description field.** Multipass stores the human-readable summary in `multipass_desc` and ships `description: "-"` as a placeholder. OpenCode reads only `description`. The bridge promotes `multipass_desc` into `description`.
2. **Discovery path.** OpenCode scans `~/.config/opencode/skills/`, `~/.claude/skills/`, and `~/.agents/skills/`. The bridge writes to `~/.config/opencode/skills/` by default.
3. **Name validation.** OpenCode requires `^[a-z0-9]+(-[a-z0-9]+)*$` and rejects unknown frontmatter. The bridge validates each name and records provenance in `metadata.source` / `metadata.bridge`.

The script is idempotent — re-run after every `git pull` to refresh. Auxiliary files (`references/`, scripts) are synced alongside each rewritten `SKILL.md` via `rsync --delete`, so removed files are pruned on the next run.
