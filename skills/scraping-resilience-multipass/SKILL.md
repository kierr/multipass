---
name: scraping-resilience-multipass
multipass_desc: "Review scrapers, crawlers, bots for fragility — site changes, anti-bot defenses, proxy exhaustion, session decay, and degradation posture."
description: "-"
when_to_use: "When reviewing scrapers, crawlers, bots for resilience, or when the user mentions scraping, crawling, or anti-bot."
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

# Scraping Resilience Review

Review whether a scraper can survive the adversarial web. Target sites change, anti-bot systems evolve, proxies get banned, and accounts burn. The question: when things go wrong, does the system degrade gracefully or cascade into failure?

## Scope

- Review any code that fetches, parses, or extracts data from external web targets: scrapers, crawlers, bots, headless browsers, API clients masquerading as browsers.
- Include supporting infrastructure: proxy managers, account pools, captcha solvers, session handlers, rate limiters, fingerprint generators.
- Focus on resilience — correctness under ideal conditions is assumed. The review is about what happens when conditions are not ideal.

## Fragility Surfaces

**Selector brittleness** — CSS selectors and XPath expressions that are only valid for one specific DOM shape. Hardcoded class names, position-dependent paths, generated attribute values, deeply nested structures that assume a specific layout hierarchy. The target sneezes, selectors break.

**Fingerprint inconsistency** — browser fingerprints that don't hold together across a session or across parallel workers. User-agent strings that don't match TLS client hello, screen dimensions that change mid-session, headers that contradict each other, timing signatures that scream automation.

**Proxy pool exhaustion** — rotation strategies that assume infinite fresh IPs, no detection of proxy bans, no backoff when all proxies are burned, cascading failures when the pool runs dry without fallback or circuit-breaking.

**Account claim races** — pools of accounts or sessions where claim and release aren't atomic, where crashes leave orphaned claims, where the same account ends up in concurrent requests, where exhaustion is detected too late.

**Captcha blind spots** — code that assumes captcha will never appear, or that detection and solving are afterthoughts. Missing coverage for different captcha types, no detection before solving, no escalation path when solving fails repeatedly.

**Session lifecycle leaks** — cookies or tokens that expire mid-operation, sessions that aren't refreshed proactively, auth state that drifts between workers, cleanup that doesn't actually clean up.

**Graceful degradation** — all-or-nothing extraction that fails hard when one element is missing, no partial results when the page partially loads, retries that don't distinguish between transient and permanent failures.

## Workflow

1. Map the scraping surface: targets, methods, authentication, proxying, parsing, output.
2. For each surface, ask: What happens when the target changes? What happens when the target resists?
3. Check selector stability: Are selectors anchored to stable attributes? Is there fallback parsing? How deep is the coupling to current DOM structure?
4. Check fingerprint coherence: Does the browser persona hold together under scrutiny? Are all signals consistent?
5. Check proxy and account pool health: Is there visibility into pool state? Are bans detected? Is there recovery or replacement?
6. Check captcha coverage: Is detection in place before solving? Are there fallbacks for failed solves?
7. Check graceful degradation: Can the system produce partial results? Are failures isolated or do they cascade?
8. Report findings with suggested fixes for each confirmed fragility.

## Guardrails

- Plan for target change as a constant, because web properties update layouts, classes, and anti-bot measures continuously.
- Assume anti-bot systems are sophisticated, because they improve with every evasion technique they encounter.
- Distinguish between code that works on a good day and code that survives a bad week.
- Rate each selector's fuse length (how long before a typical site change breaks it) instead of just checking if it works now.
- Treat proxy bans as routine operational reality and design for pool exhaustion, because ban rates increase under load.
- Apply distributed-systems rigor to account and session state, because claim races and orphaned locks cause the same class of bugs as database concurrency issues.

### Example Findings

**[high] lib/scraper/product_parser.rb:12** — single CSS selector chain with no fallback, breaks on any layout change
- **What:** The parser uses `doc.css('div.product-info span.price').first.text` as the sole price extraction path. No alternative selectors, no data validation, no graceful degradation.
- **Why it matters:** Any site redesign moves or renames the element, and the scraper returns `nil` or raises `NoMethodError` on every product. There is no detection mechanism — failures are silent until the downstream pipeline shows empty data.
- **Fix:** Add fallback selector chains with priority, validate extracted values (numeric, within expected range), and emit a metric when extraction rate drops below threshold.

**[medium] lib/scraper/session_pool.rb:45** — proxy rotation leaks sessions: failed proxy removed without releasing its cookies
- **What:** When a proxy fails the health check, it's removed from the pool but its authenticated session cookies are not cleared. The replacement proxy starts without cookies, triggering re-authentication that looks like suspicious behavior to the target.
- **Why it matters:** Proxy churn under rate-limiting causes cascading authentication failures. Each rotation creates a new unauthenticated session that the target site flags as bot behavior.
- **Fix:** On proxy removal, either transfer the session to the replacement or mark it for cleanup. Track session age and authenticate new proxies before adding them to the active pool.

## Output Template

- Scope:
- Confirmed fragility (selectors, fingerprints, detection gaps):
- Infrastructure pool risks (proxies, accounts, sessions):
- Degradation posture (partial results, isolation, cascades):
- Not reviewed:
