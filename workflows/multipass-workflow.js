// Multipass CC dynamic-workflow — per-slice multi-lens review with self-challenge, fix, and verify.
//
// RELOCATED 2026-08-23 from ~/.claude/workflows/multipass-workflow.js (untracked home-dir
// artifact) into this repo, with its LENSES table regenerated from the live lens skills
// (skills/*-multipass/SKILL.md multipass_desc; hand-tuned selection signals preserved where
// they existed). Source of truth for lenses is the skills/ tree — regenerate the table when
// lenses change; do not hand-maintain entries here.
//
// Lifecycle note: pi-harness's /review:multipass fix pass (commands/review-multipass) is the
// maintained fix substrate; this workflow remains the Claude Code side's per-slice
// review+fix+verify complement.
// Symlink from ~/.claude/workflows/multipass-workflow.js keeps it loadable as a CC named workflow.

export const meta = {
  name: 'multipass-workflow',
  description: 'Per-slice multi-lens code review with self-challenge, fix, and verification. One agent per slice owns the full lifecycle.',
  whenToUse: 'Run when you need a comprehensive code review. Supports scope (file, PR, branch, everything), lens selection, and optional auto-fix.',
  phases: [
    { title: 'Scope', detail: 'Detect changed files, select relevant lenses, compute slices' },
    { title: 'Review + Fix', detail: 'Per-slice: multi-lens review, self-challenge, fix, local verify' },
    { title: 'Consolidate', detail: 'Merge findings into report, deduplicate' },
    { title: 'Verify', detail: 'Final cross-slice verification' },
  ],
}

var OUTPUT_DIR = (args && args.output_dir) || '.claude/reports/multipass'

// ─── Lenses (compact — focus + risks only) ─────────────────────

var LENSES = {
  'access-control': { focus: 'Review authorization models — RBAC, ABAC, IDOR, tenant isolation, privilege escalation paths, object-level vs function-level checks, and permission matrix completeness', signals: ['authorize', 'pundit', 'policy', 'permission', 'ability', 'tenant', 'role', 'admin'] },
  'agents-md': { focus: 'Audit and improve AGENTS.md/CLAUDE.md instruction files', signals: ['AGENTS.md', 'CLAUDE.md', '.cursorrules', 'instructions'] },
  'api-contract': { focus: 'Validate externally consumed API contracts (HTTP, RPC, GraphQL, events) for compatibility and drift across handlers, schemas, tests, SDKs', signals: ['swagger', 'openapi', 'protobuf', 'graphql', 'schema', 'contract'] },
  'api-design': { focus: 'Review API design quality — RESTful conventions, resource naming, pagination, idempotency, error response consistency, versioning strategy, and input/output design patterns', signals: ['routes', 'router', 'controller', 'api', 'endpoint'] },
  auth: { focus: 'Review authentication flows — OAuth/OIDC, JWT validation, session management, credential handling, token lifecycle, and MFA correctness', signals: ['authenticate', 'login', 'session', 'oauth', 'jwt', 'devise'] },
  'breaking-change': { focus: 'Gate diffs, releases, and migrations for backward-compatibility risk across APIs, CLI flags, config keys, data formats, events, and automation', signals: ['migration', 'deprecated', 'compat', 'v1', 'v2'] },
  'caching-correctness': { focus: 'Review caching correctness — invalidation logic, TTL consistency, stale reads, stampede protection, key collisions, serialization drift across HTTP, CDN, ORM, and application-level caches', signals: ['cache', 'Cache', 'invalidate', 'stale'] },
  'ci-cost': { focus: 'Review CI/CD pipelines for cost waste — runner tier mismatches, redundant builds, low success rates, cascade failures, and trigger volume burning quota', signals: ['ci.yml', 'workflow', 'pipeline'] },
  ci: { focus: 'Review CI/CD pipelines for safety — workflow permissions, secret exposure, script injection, action pinning, cache integrity, release gates', signals: ['ci.yml', 'workflow', 'actions', '.github'] },
  complexity: { focus: 'Review code for unnecessary complexity — over-abstraction, duplication, oversized files, speculative generality, misleading indirection', signals: [] },
  concurrency: { focus: 'Review concurrent/async code for race, deadlock, cancellation, backpressure, lifecycle, and shutdown correctness risks', signals: ['mutex', 'lock', 'thread', 'async', 'queue', 'channel', 'worker', 'pool'] },
  'config-safety': { focus: 'Review configuration behavior changes — defaults, env vars, flags, precedence, validation, reload semantics, deprecation, migration compatibility', signals: ['config', 'settings', 'env', 'dotenv', 'mise.toml'] },
  'context-debt': { focus: 'Measure and reduce context debt — the accumulating per-turn cost of always-loaded agent context: instruction files, memory indexes, skill descriptions, embedded system prompts', signals: [] },
  'data-contract': { focus: 'Review data contracts for consistency across config files, JSON/YAML schemas, seed data, enums, and application code — scale mismatches, type drift, stale definitions, and divergent canonical sources', signals: ['schema', 'seed', 'fixture', 'factory', 'enum'] },
  'data-pipeline': { focus: 'Review multi-stage data flows where failure at stage N+1 can orphan successful work at stage N. Catches cascading partial-failure bugs', signals: ['pipeline', 'stage', 'etl', 'transform', 'ingest', 'batch', 'consume'] },
  'data-quality': { focus: 'Review counter_cache, confidence scores, normalization, enrichment pipelines, denormalized fields, search index sync, and source attribution drift', signals: ['counter_cache', 'denormalize', 'search_index', 'enrich', 'sync'] },
  'debt-inventory': { focus: 'Review suppression surfaces that accrue hidden debt — linter Exclude/Enabled:false ledgers, inline-disable accumulations, count-ratchet tests that drift upward, and baseline files (rubocop_todo, sorbet/rbi, eslint, ruff) parked outside their regenerating mechanism or missing a freshness gate', signals: [] },
  debt: { focus: 'Audit for actionable technical debt — dead abstractions, stale workarounds, abandoned experiments, recurring maintenance drag, refactor priorities', signals: ['TODO', 'FIXME', 'HACK', 'XXX', 'DEPRECATED'] },
  deduplication: { focus: 'Review code for structural duplication — copy-paste blocks that have diverged or will diverge, near-duplicate classes, repeated validation logic, and divergent config files', signals: [] },
  dependency: { focus: 'Review dependency health — outdated, unmaintained, CVE-affected packages', signals: ['package.json', 'Gemfile', 'requirements.txt', 'go.mod', 'pyproject.toml'] },
  dockerfile: { focus: 'Review Dockerfiles for multi-stage efficiency, pushed-but-unconsumed images, base stage duplication, layer waste, and build matrix alignment', signals: ['Dockerfile', 'docker-compose', '.dockerignore'] },
  'docs-drift': { focus: 'Verify that READMEs, docs, examples, runbooks, and inline comments still match current code, config, tests, schemas, and runtime behavior', signals: ['README', 'CHANGELOG', 'CONTRIBUTING', 'docs/'] },
  'error-handling': { focus: 'Review how failures travel — swallowed exceptions, inconsistent error shapes, missing retry classification, opaque error messages', signals: ['error', 'exception', 'rescue', 'catch'] },
  'event-driven': { focus: 'Review event-driven and messaging systems for ordering, idempotency, DLQ handling, replay safety, schema evolution, and distributed delivery guarantees', signals: ['kafka', 'rabbitmq', 'sqs', 'event', 'message', 'consumer', 'producer'] },
  'feature-flags': { focus: 'Review feature flag hygiene — stale flags, flag coupling, missing removal paths, untested branches, evaluation side effects, and migration planning for flag retirement', signals: ['feature_flag', 'flipper', 'launchdarkly', 'unleash'] },
  frontend: { focus: 'Review frontend TS/JS/TSX UI changes for correctness, UX regressions, accessibility, state-flow issues, and checklist-based risks', signals: ['tsx', 'jsx', 'vue', 'svelte', 'css', 'component'] },
  gitops: { focus: 'Review GitOps manifests — Kustomize overlays, HelmReleases, Flux Kustomizations, OCI sources — for overlay correctness, dependency order, and secret refs', signals: ['kustomization', 'helmrelease', 'flux'] },
  k8s: { focus: 'Review Kubernetes resource manifests — Deployments, Services, Ingress, PodDisruptionBudgets, probes, resource quotas, and SecurityContext — for correctness, resilience, and operational safety', signals: ['deployment', 'service', 'ingress', 'k8s', 'kubernetes'] },
  'llm-safety': { focus: 'Review LLM and agent systems for prompt-injection, data-exposure, and agent-safety risks across prompts, tools, RAG, memory, and model integrations', signals: ['prompt', 'tool_use', 'rag', 'memory', 'llm', 'agent'] },
  'loop-safety': { focus: 'Review jobs, workers, agents, schedulers for infinite loops, runaway redrives, unchanged-input reprocessing, and missing cost/time/attempt budgets', signals: ['retry', 'backoff', 'redrive', 'schedule', 'poll', 'loop'] },
  mcp: { focus: 'Review MCP servers, tools, prompts, schemas, permissions, and protocol behavior for contract and safety issues', signals: ['mcp', 'MCP', 'tool_schema'] },
  'migration-safety': { focus: 'Review database migration execution strategy — zero-downtime compatibility, lock risk on large tables, rollback plans, expand-contract correctness, and data migration safety', signals: ['migration', 'migrate', 'db/', 'schema.rb'] },
  mise: { focus: 'Review mise.toml configuration for correctness, task hygiene, tool pinning, source/output tracking, environment handling, and adherence to mise best practices', signals: ['mise.toml', '.tool-versions'] },
  'model-routing': { focus: 'Review provider routing, model selection, fallbacks, capability mismatches, quota handling, and cost/reliability tradeoffs', signals: ['router', 'model', 'provider', 'fallback'] },
  observability: { focus: 'Review logs, metrics, traces, dashboards, and alerts for production detection and diagnosis signal quality without high-noise instrumentation', signals: ['logger', 'metric', 'trace', 'dashboard', 'alert'] },
  outdated: { focus: 'Review code for outdated patterns — deprecated APIs, superseded tooling, EOL dependencies, dead links, and vintage methodology the industry has moved on from', signals: ['deprecated', 'legacy', 'polyfill', 'shim'] },
  performance: { focus: 'Review performance — latency, throughput, CPU, memory, allocations, streaming overhead, hot-path inefficiencies', signals: ['benchmark', 'profile', 'perf', 'n+1'] },
  pii: { focus: 'Review personal data flows — collection minimization, storage encryption, logging balance, retention policies, right-to-erasure paths', signals: ['encrypt', 'pii', 'gdpr', 'privacy', 'consent'] },
  prompt: { focus: 'Review prompts, system prompts, AGENTS.md, and SKILL.md files for prompt engineering quality — structure, anti-patterns, thinking config, tool use', signals: ['SKILL.md', 'AGENTS.md', 'system_prompt'] },
  redis: { focus: 'Review Redis code, Lua scripts, key schemas, config', signals: ['redis', 'Redis', 'sidekiq'] },
  release: { focus: 'Review release processes — versioning consistency, changelog quality, deployment strategy, rollback capability, artifact signing, and tag hygiene', signals: ['release', 'changelog', 'version', 'tag', 'deploy'] },
  ruby: { focus: 'Ruby/Rails correctness review covering ActiveRecord misuse, Sorbet type safety, Sidekiq jobs, mutability footguns, exception anti-patterns, and Rails ecosystem traps', signals: ['.rb', 'Gemfile', 'app/', 'lib/'] },
  schema: { focus: 'Review database schema for index coverage, FK integrity, column types, normalization quality, and migration safety', signals: ['migration', 'schema.rb', 'structure.sql', 'db/'] },
  'scraping-resilience': { focus: 'Review scrapers, crawlers, bots for fragility — site changes, anti-bot defenses, proxy exhaustion, session decay, and degradation posture', signals: ['scrape', 'crawl', 'spider', 'bot', 'selector', 'nokogiri'] },
  security: { focus: 'Review security posture across trust boundaries — authn/authz, input handling, secret management, dependency exposure, and exploit paths', signals: ['params', 'request', 'eval', 'authorize', 'pundit', 'send_file'] },
  'state-machine': { focus: 'Review status fields, enum transitions, lifecycle callbacks', signals: ['aasm', 'statesman', 'workflow', 'state_machine', 'transition', 'status'] },
  structure: { focus: 'Review repository layout quality — file/directory organization, ownership boundaries, module placement, root clutter, and mixed production/test artifacts', signals: [] },
  substrate: { focus: 'Review canonical substrate/layer authority and convergence — duplicate substrates bypassing the canonical layer, stranded substrates with zero production callers, raw vendor types leaking upstream of the typed boundary, direct vendor-primitive bypasses, the inverse pattern where the canonical boundary is itself stranded while raw-vendor code is live, parallel namespaces for one concern, cop-Exclude whitelists that have accreted into a debt inventory, and self-authored RATIONALEs invalidated by caller-count', signals: [] },
  test: { focus: 'Review tests for confidence quality — test-layer hygiene, external dependency isolation, concurrency risks, coverage metrics, and CI gates', signals: ['_test.', '_spec.', '.test.', '.spec.'] },
  'type-safety': { focus: 'Review type discipline across TypeScript, Python, Ruby, Go, and other typed languages — strictness gaps, unsound casts, missing narrowing, escape hatches, and type-system defeats that let runtime bugs through', signals: ['.ts', '.tsx', 'sorbet', 'types', 'typed:'] },
  wide: { focus: 'Review diff, working tree, or full repo for actionable bugs and regressions', signals: [] },
}

// ─── Helpers ────────────────────────────────────────────────

function selectLenses(files) {
  if (args && args.lenses) return args.lenses
  var selected = new Set(['wide'])
  for (var name in LENSES) {
    var lens = LENSES[name]
    if (!lens.signals || lens.signals.length === 0) continue
    for (var i = 0; i < files.length; i++) {
      var f = files[i].toLowerCase()
      for (var j = 0; j < lens.signals.length; j++) {
        if (f.indexOf(lens.signals[j].toLowerCase()) >= 0) {
          selected.add(name)
          break
        }
      }
      if (selected.has(name)) break
    }
  }
  // Breadth guarantees
  for (var i = 0; i < files.length; i++) {
    if (/controller|handler|endpoint|api|params|request/i.test(files[i])) selected.add('security')
    if (/\.(tsx?|jsx?|vue|svelte|css)$/i.test(files[i])) selected.add('frontend')
    if (/\.(rb|py|ts|tsx|js|go|ex|java)$/i.test(files[i]) && !/[_-](test|spec)\./i.test(files[i])) selected.add('test')
  }
  return Array.from(selected)
}

// ─── Phase 1: Scope ────────────────────────────────────────

phase('Scope')

var scopeOverride = (args && args.scope) || ''
var scopeResult = await agent(
  'Detect the review scope for a multipass code review.\n' +
  (scopeOverride ? 'User-specified scope: ' + scopeOverride + '\n' : '') +
  'If scope is a file path, use that file.\n' +
  'If scope is "PR", detect the current PR via gh and get its diff.\n' +
  'If scope is a branch name, diff against that branch.\n' +
  'If scope is "everything", list all source files in the repo.\n' +
  'If no scope specified, use this hierarchy:\n' +
  '1. If on a non-default branch: git diff $(git merge-base HEAD origin/main)...HEAD\n' +
  '2. If working tree has changes: git diff HEAD plus git ls-files --others --exclude-standard\n' +
  '3. If on default branch with clean tree: last 5 commits\n' +
  'Return the file list as JSON: {"files":["path1","path2"], "scope_source":"branch_diff", "diff_summary":"brief summary"}',
  { label: 'scope', phase: 'Scope' }
)

// Parse scope
var files = []
var scopeDesc = ''
try {
  var start = scopeResult.indexOf('{')
  var end = scopeResult.lastIndexOf('}')
  if (start !== -1 && end > start) {
    var parsed = JSON.parse(scopeResult.substring(start, end + 1))
    files = parsed.files || []
    scopeDesc = parsed.diff_summary || ''
  }
} catch (e) {}

if (files.length === 0) {
  // Fallback: try parsing as newline-separated list
  files = (scopeResult || '').split('\n').filter(function (l) { return l.trim().length > 0 && !l.startsWith('{') && l.includes('/') })
}

var selectedLenses = selectLenses(files)
log('Scope: ' + files.length + ' files, ' + selectedLenses.length + ' lenses: ' + selectedLenses.join(', '))

if (files.length === 0) {
  log('No files to review.')
  return { files_reviewed: 0, lenses_run: 0, total_findings: 0 }

}

// ─── Phase 2: Per-slice Review + Self-Challenge + Fix + Verify ──

phase('Review + Fix')

// Build lens descriptions for the prompt
var lensDescriptions = selectedLenses.map(function (name) {
  var l = LENSES[name]
  return '- **' + name + '**: ' + l.focus
}).join('\n')

// Slice files into groups of ~8-12 for per-slice agents
var SLICE_SIZE = 12
var fileSlices = []
for (var i = 0; i < files.length; i += SLICE_SIZE) {
  fileSlices.push(files.slice(i, i + SLICE_SIZE))
}

var sliceResults = await parallel(fileSlices.map(function (slice, idx) {
  return function () {
    return agent(
      'MULTIPASS REVIEW — FULL LIFECYCLE FOR YOUR SLICE\n' +
      '\nYou own the complete lifecycle: review → self-challenge → fix → verify.\n' +
      '\n## Scope\n' +
      'Files:\n' + slice.map(function (f) { return '- ' + f }).join('\n') +
      '\n\n## Lenses to Apply\n' + lensDescriptions +
      '\n\n## Step 1: Multi-Lens Review\n' +
      'Apply EVERY lens above to your files. For each lens, search for its signal patterns and evaluate against its focus area.\n' +
      'RULES:\n' +
      '- Work from repo truth. Separate confirmed findings from assumptions.\n' +
      '- Report every confirmed finding regardless of severity.\n' +
      '- Trace full execution path before reporting bugs.\n' +
      '- After review, write any overturned findings or project conventions discovered to the project memory directory.\n\n' +
      '## Step 2: Self-Challenge\n' +
      'For EACH finding, challenge yourself:\n' +
      '- Is this a real issue or a stylistic preference?\n' +
      '- Would the fix introduce new problems?\n' +
      '- Is this accurate or does the code behave differently?\n' +
      '- DISMISS findings that don\'t survive. Only keep confirmed issues.\n\n' +
      '## Step 3: Fix (if enabled)\n' +
      (args && args.no_fix ? '- SKIP (no_fix mode)\n' : '- For every CONFIRMED finding, apply the fix directly.\n' +
        '- Fix must preserve behavior. Do not change what code does — only how.\n' +
        '- If fix requires multiple files, change all of them.\n' +
        '- If genuinely unfixable, skip and note why.\n') +
      '\n## Step 4: Local Verify\n' +
      'After all fixes, run linters on modified files to catch regressions.\n\n' +
      '## Output Format\n' +
      'For each finding (confirmed or dismissed):\n' +
      'FINDING|<id>|<severity>|<lens>|<title>|<file>|<line>|<verdict:fixed-or-dismissed-or-unfixable>|<description>|<fix>\n' +
      'POSITIVE|<observation>\n' +
      'SUMMARY|<total>|<fixed>|<dismissed>|<unfixable>|<one-line summary>',
      { label: 'slice-' + (idx + 1), phase: 'Review + Fix' }
    )
  }
}))

// Parse results
var allFindings = []
var positives = []
var totalFixed = 0
var totalDismissed = 0
var totalUnfixable = 0

sliceResults.forEach(function (result) {
  if (!result) return
  result.split('\n').forEach(function (line) {
    if (line.startsWith('FINDING|')) {
      var parts = line.split('|')
      if (parts.length >= 8) {
        allFindings.push({
          id: parts[1], severity: parts[2], lens: parts[3], title: parts[4],
          file: parts[5], line: parseInt(parts[6]) || 0, verdict: parts[7],
          description: parts[8] || '', fix: parts[9] || ''
        })
        if (parts[7] === 'fixed') totalFixed++
        else if (parts[7] === 'dismissed') totalDismissed++
        else if (parts[7] === 'unfixable') totalUnfixable++
      }
    } else if (line.startsWith('POSITIVE|')) {
      positives.push(line.substring('POSITIVE|'.length))
    }
  })
})

log('Review: ' + allFindings.length + ' findings (' + totalFixed + ' fixed, ' + totalDismissed + ' dismissed, ' + totalUnfixable + ' unfixable)')

// ─── Phase 3: Consolidate ──────────────────────────────────

phase('Consolidate')

await agent(
  'Consolidate these review findings into a single markdown report at ' + OUTPUT_DIR + '/multipass-report.md.\n' +
  'Root-cause cluster: group findings referencing the same files, resources, or behavioral gap.\n' +
  'Severity rank: CRITICAL first, then HIGH, MEDIUM, LOW.\n' +
  'Identify cross-cutting themes (patterns spanning 2+ findings).\n\n' +
  'Findings:\n' + JSON.stringify(allFindings, null, 2) + '\n\n' +
  'Positive observations:\n' + JSON.stringify(positives, null, 2) + '\n\n' +
  'Include sections: Scope, Findings Table, Finding Details, Cross-Cutting Themes, Positive Observations, Triage.\n' +
  'Table: | # | Sev | Lens | Finding | File(s) | Verdict |',
  { label: 'consolidate', phase: 'Consolidate' }
)

// ─── Phase 4: Final Verify ─────────────────────────────────

phase('Verify')

if (totalFixed > 0) {
  var verifyResult = await agent(
    'Run the project\'s verification checks.\n' +
    '1. Run: bin/rubocop --format offenses 2>&1 | tail -10\n' +
    '2. Run: srb tc 2>&1 | tail -5 (if available)\n' +
    'Report pass/fail for each check with key metrics.',
    { label: 'final-verify', phase: 'Verify' }
  )
  log('Final verify: ' + (verifyResult || '').substring(0, 200))
} else {
  log('No fixes applied — skipping final verify.')
}

log('Multipass complete: ' + allFindings.length + ' findings, ' + totalFixed + ' fixed')
log('Agents: ' + (fileSlices.length + 2) + ' (1 scope + ' + fileSlices.length + ' slices + 1 consolidate)')

return {
  files_reviewed: files.length,
  lenses_run: selectedLenses.length,
  total_findings: allFindings.length,
  fixed: totalFixed,
  dismissed: totalDismissed,
  unfixable: totalUnfixable,
  report: OUTPUT_DIR + '/multipass-report.md',
}
