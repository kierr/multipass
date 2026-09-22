---
name: substrate-multipass
multipass_desc: "Review canonical substrate/layer authority and convergence — duplicate substrates bypassing the canonical layer, stranded substrates with zero production callers, raw vendor types leaking upstream of the typed boundary, direct vendor-primitive bypasses, the inverse pattern where the canonical boundary is itself stranded while raw-vendor code is live, parallel namespaces for one concern, cop-Exclude whitelists that have accreted into a debt inventory, and self-authored RATIONALEs invalidated by caller-count. Centers reference-graph caller-count verification and canonical-authority resolution (ADRs, typed boundaries) to distinguish a deletable strand from a live duplicate that needs migration. Use when reviewing for SSOT violations, canonical-layer convergence, vendor lock-in leakage, stranded adapters or wrapper classes, second implementations of a lib/ layer, or when the user mentions substrate, canonical layer, convergence, bypass, stranded classes, vendor leakage, or single source of truth."
description: "-"
when_to_use: "When reviewing for duplicate or stranded substrates, canonical-layer convergence, vendor-type leakage, or when the user mentions SSOT, canonical layer, substrate bypass, stranded classes, vendor leakage, convergence, or single source of truth."
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

This lens often benefits from a wider scope than a single diff: substrates span the whole tree, and a duplicate of `app/lib/foo/` may live in `app/models/` or `app/services/`. When the user points at one substrate (`"review the HTTP substrate"`), expand to all roots that touch the same concern, not just the named directory.

**Untracked files are always included in working-tree scope.**

**Argument interpretation:** `$ARGUMENTS` may contain a natural language description of what to review — anything from a file path to a focus area to a longer prompt. If arguments contain paths or name a substrate (`http`, `cache`, `search`, `email`), narrow to that concern's roots. If arguments describe a pattern ("find stranded adapters"), prioritize that surface. If arguments are empty or absent, use the default scope above and survey all canonical substrates.

### Review Mode

Review-only. No mutations, no fix waves, no loops. This lens recommends convergence actions (delete / migrate / close-gap / design-issue); it does not perform them.

### Core Rules

- Work from repo truth first. Separate confirmed findings from assumptions and unverified areas.
- Report every confirmed finding regardless of severity. Do not pad with unverified speculation, but do not dismiss confirmed findings because they are minor.
- Respect explicit preservation annotations in code (`DO NOT REMOVE`, `DO NOT DELETE`, `KEEP THIS`). Never recommend removal or modification of annotated-to-keep code.
- **Stranded code is not dead code.** Before flagging a class as deletable, count its production callers via the reference graph and check for `STATUS:` markers, integration plans, and framework-reflection invocation (consumer/job registration, autoloader conventions, `const_get`, string-eval, config ILIKEs). Only "obsolete" (confirmed zero production callers, no integration path, and a canonical alternative exists) is a deletion finding. The caller-count is the load-bearing evidence — state it explicitly in every stranded finding.
- **A bypass is not always a defect.** A raw-vendor call that uses a feature the canonical substrate does not expose (streaming `on_body`, libcurl timing fields, low-level socket options) is a substrate gap, not a violation. Track the gap; do not recommend deleting the bypass without closing the gap in the substrate.
- When another review skill is clearly needed, use only the smallest relevant set of available review lenses. Diverged-logic copies are `deduplication-multipass`'s domain; dead code with no canonical framing is `debt-multipass`'s domain; over-abstraction is `complexity-multipass`'s domain; cyclic coupling is `dependency-multipass`'s domain; pure directory placement is `structure-multipass`'s domain. Findings touching those are still reported here with the sibling lens noted in the triage entry — do not defer or hand them off.
- **Low-severity findings default to actionable.** "It's just a nitpick" is not a valid reason to downgrade or omit.
- **Out-of-scope findings are reported with a suggested action** (fix/TODO/issue) in the triage table. Never silently drop a finding.

### Finding Severity

| Level | Meaning | When to use |
|---|---|---|
| `critical` | Diverged duplicate substrate producing different behavior in production, or vendor-type leakage on a security/correctness-sensitive path | Two parallel substrates for one concern that have drifted — a fix applied to the canonical does not reach the duplicate (and vice versa); raw vendor credentials/tokens/PII flowing upstream untyped |
| `high` | Stranded substrate with confirmed zero production callers and a canonical alternative (clean deletion); or active vendor-type leakage reaching many upstream sites | `PooledElasticsearchClient`/`HybridCache` shape — orphaned, canonical `Search::Client`/cache layer supersedes; raw `VendorResponse` read in N consumers |
| `medium` | Direct vendor bypass with a genuine substrate feature gap (track the gap, close it in the canonical); parallel-namespace sprawl for one concern across roots | Raw vendor calls for streaming/timing the substrate doesn't expose; one concern rooted in `lib/` + `models/` + `services/` simultaneously |
| `low` | Single-site raw-vendor use the canonical substrate already covers; mechanical convergence | One consumer constructing `Vendor::Request.new` when `Canonical.batch` does the same; one raw-type cast that the canonical return type makes unnecessary |
| `unverified` | Zero-caller claim not yet confirmed against the reference graph (framework-reflection invocation possible); canonical authority not yet established | Class that looks unused but may be invoked via Karafka/Sidekiq/Rails registration; "canonical" layer asserted but no ADR or typed boundary found |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the pattern (name the canonical, the duplicate/bypass, and the vendor type if leakage)
- **Caller-count:** production refs vs test refs (from the reference graph) — mandatory for stranded/duplicate findings
- **Why it matters:** impact if unfixed (divergence risk, coupling cost, contract violation)
- **Convergence:** one of **delete** / **migrate** / **close-gap** / **design-issue**, with the specific target

### Self-Challenge Protocol

Before reporting findings, verify your own analysis. This lens's verification is stricter than most because its central claims (stranded, duplicate, canonical) are easily false-positive.

**Canonical-authority verification.** Before calling something a "duplicate" or "stranded," name the canonical layer and its authority: the ADR that established it, its typed return boundary, its module doc, or its caller count relative to the candidate. If you cannot point to the canonical and say why it is canonical, you do not have a substrate finding — you have two parallel implementations with no established SSOT. Downgrade or drop. Two implementations of a concern with no designated canonical is a design-decision issue, not a substrate violation.

**Caller-count verification.** For every "stranded," "dead," "unused," or "orphaned" claim, count production callers via the reference graph (LSP references, `find_constant_references`, or `rg` with prod-vs-test directory separation). State the count in the finding: "12 references — 0 in `app/`, 12 in `test/`." A class invoked through framework reflection has non-obvious callers: Karafka consumer registration, Sidekiq `perform_async`, Rails autoloader conventions, initializer `const_get`, string `Object.const_get`, or ILIKE matches in config YAML. Resolve all of these before claiming zero production callers. Engaging with a class's self-authored `RATIONALE` ("needs raw vendor for X") is worthless if caller-count is zero — the justification is moot when nothing calls it. *The structural evidence beats the narrative.*

**Substrate-gap verification.** For every "direct bypass" finding, confirm whether the bypass uses a vendor feature the canonical substrate exposes. Read the substrate's option-surface and return type. If the bypass relies on streaming callbacks, timing metadata, or low-level options the substrate does not pass through, the finding is "track the substrate gap (and close it in the canonical)," not "delete the bypass." Blessing the bypass with a `RATIONALE` without recording the gap leaves the debt invisible.

**Inverse-pattern verification.** When the canonical typed boundary appears stranded (zero production callers) while a raw-vendor implementation is the live path, do not recommend deleting the canonical. Deleting it entrenches the raw-vendor leak and removes the typed boundary the convergence wants. Flag as **design-issue**: the canonical and the live raw path need a head-to-head (extract the live path's behavior into the canonical, or converge the live path onto the canonical), and that is a plan, not a fix.

**Intentional-divergence verification.** Confirm the second implementation isn't deliberate. Check git history, ADRs, and comments for an explicit "parallel implementation during migration" or "feature-flagged replacement" rationale. A migration in progress (canonical being adopted, old substrate being retired) is expected divergence, not debt — but record the migration state so the finding is actionable when it completes.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If caller-count cannot be confirmed, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Stranded substrate, confirmed zero prod callers, canonical exists — a clean deletion; or a single-site mechanical convergence | Apply in a separate turn |
| **TODO** | Direct bypass justified by a substrate feature gap; parallel-namespace sprawl pending a naming decision | Add `TODO:` / `RATIONALE` with the gap or decision and the overturning condition |
| **Issue** | Inverse pattern (canonical stranded, raw live); diverged duplicate substrate needing a migration plan; multi-root namespace merge | Create a plan/issue for the head-to-head or migration |

# Canonical Substrate Review

Review whether a codebase's layered substrates hold their authority: that every concern has one canonical boundary (a typed wrapper, an adapter, a lib/ layer), that upstream code routes through it, and that nothing parallel, stranded, or leaky has accreted around it. The distinctive methodology is **caller-count verification** plus **canonical-authority resolution** — these two resolve findings that the adjacent lenses (diverged logic, dead code, over-abstraction) do not surface.

## Scope

- Canonical substrates: typed wrappers and adapter boundaries in `lib/` (e.g., `lib/http/`, `lib/search/`, a Redis adapter, an IMAP client), each with an established authority (ADR, typed return, contract doc).
- Duplicate substrates: second, parallel implementations of the same concern elsewhere (`models/`, `services/`, vendor-named namespaces) that bypass the canonical.
- Stranded substrates: classes with zero production callers (test-only), superseded by a canonical alternative.
- Vendor-type leakage: raw vendor types (`Vendor::Response`, `Net::IMAP::FetchData`, `Ethon::Easy`) reaching upstream of the substrate's typed boundary.
- Direct bypasses: vendor primitives constructed outside the substrate (`Vendor::Request.new`, `Vendor::Hydra.new`, `Net::IMAP.new`).
- The inverse: the canonical typed boundary itself stranded while raw-vendor code is the live path.
- Parallel namespaces for one concern: a domain rooted in `lib/` + `models/` + `services/` simultaneously with no clear split.
- Cop/lint debt inventory: a direct-use ban cop whose `Exclude`/`Ignore` whitelist has accreted every escape hatch, and whose message may redirect to a misnomer.

## The Patterns

**Duplicate substrate** — `app/models/billing/http_batch.rb` re-implements the concurrency concern that `app/lib/http/batch_builder.rb` (canonical, ADR-established) already owns. It bypasses `::Http`, returns raw `Vendor::Response`, and adds only per-request proxy allocation — three lines that callers could compose themselves. Two mechanisms for one concern means a fix to the canonical (retries, metrics, typed response) does not reach the duplicate. The strongest signal: the canonical and the duplicate have diverged, each accumulating bug fixes the other lacks.

**Stranded substrate** — `app/lib/legacy_cache.rb` has 117 test references and zero production callers. The canonical cache layer (Redis + Memcached) superseded it. Every test exercises a substrate nothing in `app/` uses. The deletion is safe — but only because caller-count confirms zero. This pattern carries the highest false-positive risk: framework reflection, registration, and migration-in-progress all produce "looks unused" classes that are live. The caller-count and the canonical alternative are both mandatory before recommending deletion.

**Vendor-type leakage** — `app/consumers/site_consumer.rb:80` does `resp = T.cast(raw, Vendor::Response)` inside a batch callback, then reads `resp.body` / `resp.success?`. The canonical batch callback delivers a typed `Http::Response`; the cast leaks the vendor implementation the substrate exists to hide. Upstream code is now coupled to the vendor's response shape. Often a sign that the callback was written before the substrate's typed return landed, and never updated.

**Direct bypass (with and without justification)** — `app/services/site/scraper.rb` constructs `Vendor::Hydra.new` + `Vendor::Request.new` directly instead of routing through `Canonical.batch`. *Two sub-cases:* (a) the substrate already does everything the bypass does — a defect; (b) the bypass uses a vendor feature the substrate doesn't expose (streaming `on_body` for large downloads, libcurl `connect_time`/`total_time` for latency probes) — a **substrate gap**. Case (a) converges (migrate to canonical); case (b) tracks the gap and closes it in the substrate, then migrates. Misclassifying (b) as (a) produces a broken migration.

**The inverse** — `app/lib/email/mail_client.rb` is the typed canonical boundary (returns `FetchedMessage`), but it has zero production callers. The live path is `app/services/retrieval/strategy/imap.rb`, which uses `Net::IMAP` directly and leaks raw `FetchData`/`Envelope`. The canonical is stranded and the raw-vendor code is alive — the opposite of the usual pattern. Deleting the canonical entrenches the leak; deleting the raw path strands the callers. This needs a head-to-head plan, not a deletion.

**Parallel namespaces for one concern** — the HTTP concern is rooted in `app/lib/http/` (canonical), `app/models/browser_ops/http/` (a facade + a duplicate), and `app/services/typhoeus/` (vendor wrap) — three roots for one concern. `usa_official/` and `usa_official_com/` split one source across two namespaces. This is a shape signal: the sprawl usually hides one of the patterns above. Map the roots, then check each class against the canonical.

**Cop Exclude as debt inventory** — a RuboCop cop `NoDirectVendorUse` bans raw vendor primitives, but its `Exclude` list has grown to whitelist every escape hatch (`app/services/vendor/**`, `app/services/legacy/**`, three specific files). The whitelist *is* the refactor backlog: each entry is a bypass the team accepted rather than fixed. Its `MSG` ("Use BrowserOps::Http") may redirect to a misnomer facade. Read the Exclude list as a todo list, and check whether convergence work has shrunk it.

**Self-authored RATIONALE invalidated by caller-count** — `app/services/web/request_service.rb:13` carries a `RATIONALE: needs raw vendor for DNS/TLS timing metadata`. The reasoning is plausible and a reviewer reading it will engage with it. But `find_constant_references` shows 18 references — all in `test/`, zero in production. The class is stranded; the justification is moot because nothing calls it. Metadata (including self-authored `RATIONALE`) is a claim, not authority. Verify every bypass-justifying `RATIONALE` against the reference graph before accepting it.

## Workflow

1. **Map canonical substrates.** Enumerate the typed wrappers and adapter boundaries (`ls app/lib/`, ADR grep, typed-return boundaries). For each, record its authority — the ADR, the typed return type, the contract doc, and its production caller count. This is the reference frame for every later finding.
2. **Find parallels.** For each canonical substrate, search for second implementations: vendor-named namespaces in `models/`/`services/`, alternative `*Client`/`*Session`/`*Manager`/`*Builder` classes, facades in unexpected roots. Use the namespace map (which roots each concern occupies) to target the search.
3. **Caller-count each candidate.** Run the reference graph. Separate production (`app/`) from test (`test/`/`spec/`). Resolve framework-reflection invocation (consumer/job registration, autoloader, `const_get`, config ILIKEs) before claiming zero. *This is the load-bearing step.* State the count in every finding.
4. **Classify each finding.** Duplicate-substrate (parallel impl, bypasses canonical) / stranded (zero prod, canonical exists) / inverse (canonical itself zero-prod) / namespace-sprawl (shape) / vendor-leak (upstream raw types) / gap-bypass (uses unsupported feature). The classification determines the action.
5. **Resolve canonical authority and substrate-gap** before recommending an action. Name the canonical and its authority. For bypasses, confirm whether the substrate exposes the used feature.
6. **Report with a convergence action** per finding: **delete** (stranded, zero callers, canonical exists) / **migrate** (duplicate or bypass with live callers, substrate covers the feature) / **close-gap** (bypass uses an unsupported feature — track the substrate gap, then migrate) / **design-issue** (inverse pattern, or diverged duplicate needing a migration plan).

## Guardrails

- **Diverged logic is `deduplication-multipass`'s domain.** That lens owns copy-paste *algorithms* that have drifted (same logic, N copies). This lens owns diverged *substrates/boundaries* (two implementations of a layer, one canonical). If two classes share 80% of their method bodies, that is deduplication; if one class re-implements a concern an `app/lib/` layer already owns, that is substrate.
- **Dead code with no canonical framing is `debt-multipass`'s domain.** This lens requires naming the canonical that supersedes. A class with zero callers and no canonical replacement is plain dead code; a class with zero callers where `app/lib/foo/` already does the job is a stranded substrate.
- **Over-abstraction (speculative generality, one abstraction serving too many purposes) is `complexity-multipass`'s domain.** This lens's concern is the opposite failure mode: too many implementations of one concern, no clear canonical.
- **Cyclic coupling is `dependency-multipass`'s domain and pure directory placement is `structure-multipass`'s.** This lens covers boundary *authority and convergence*, not where files sit or whether dependencies cycle.
- **Stranded ≠ dead.** Inherited from the shared contract, reinforced: caller-count plus canonical-alternative-plus-no-integration-path is the deletion bar. The inverse pattern (canonical stranded) is explicitly *not* a deletion.
- **A bypass is not always a defect.** Substrate feature gaps (streaming, timing, low-level options) are tracked gaps, not violations. Recording the gap with a `RATIONALE` and an overturning condition ("would need `Http::Client#on_body`") is correct; deleting the bypass blind is not.
- **Metadata is claims, not authority.** A `RATIONALE` justifying a bypass is cross-checked against caller-count and the substrate's option-surface, never accepted on its own. A commit message or class name asserting "canonical" does not make it canonical — the ADR and typed boundary do.
- Prefer concrete, caller-counted findings over theoretical boundary purity. "This class has zero production callers; `Search::Client` is the canonical with 30 callers; delete" beats "this looks like a second implementation of the search concern."

## Useful Checks

```bash
# Map canonical substrates — typed wrappers and adapter boundaries
ls app/lib/
rg -l "ADR-0" app/lib/ docs/adr/  # authority references
rg -n "# typed return|returns .*::Response|sig { params" app/lib/ | head -30

# Vendor-type leakage — raw vendor types upstream of the substrate
# (exclude the substrate itself, which is allowed to use the vendor)
rg -n "Vendor::Response|Net::IMAP::(FetchData|Envelope)|Ethon::Easy" app/ -g '!app/lib/<substrate>/'
rg -n "T\.(cast|let|unsafe).*Vendor::" app/ -g '!app/lib/'
rg -n "is_a\?\(Vendor::|\.body.*Vendor" app/ -g '!app/lib/'

# Direct bypass — vendor primitives constructed outside the substrate
rg -n "Vendor\.(get|post|head|put|delete)\b" app/ -g '!app/lib/'
rg -n "Vendor::(Request|Hydra|Easy|Session)\.new" app/ -g '!app/lib/'
rg -n "Net::(IMAP|SMTP|HTTP)\.new|Net::IMAP\." app/ -g '!app/lib/'

# Caller-count (generic) — production vs test separation
rg -n "ClassName" app/ | wc -l   # production refs
rg -n "ClassName" test/ | wc -l  # test refs
# Mind framework reflection before claiming zero:
rg -n "ClassName" config/ app/initializers/ 2>/dev/null
rg -n "consumer_class:|job_class:|perform_async|const_get" config/ app/

# Parallel namespaces for one concern — which roots each domain occupies
find app -type d -name '<domain>' -o -type d -name '<domain>*'
ls -d app/lib/<domain>* app/models/<domain>* app/services/<domain>* 2>/dev/null

# Cop Exclude as debt inventory — the direct-use ban's whitelist
rg -n "Exclude:|Ignore:" -A 30 .rubocop.yml | rg -A 30 "NoDirect|DirectVendor|RawVendor"

# Substrate option-surface (for gap verification — does the substrate expose the feature?)
rg -n "on_body|on_headers|connect_time|total_time|ssl_verify|http_version" app/lib/<substrate>/
```

For Ruby, prefer the RubyDex / LSP reference graph (`find_constant_references`) over `rg` for caller-count — it resolves symbols, where `rg` matches strings and comments. `rg` is correct for literal vendor-type text and for non-Ruby languages.

### Example Findings

**[high] app/lib/pooled_elasticsearch_client.rb:1** — stranded duplicate substrate; canonical `Search::Client` supersedes
- **What:** `PooledElasticsearchClient` re-implements an Elasticsearch connection wrapper. The canonical `Search::Client` (`app/lib/search/client.rb`, ADR-established singleton with retry loop) covers the same surface with ~30 production callers.
- **Caller-count:** 0 production references; 1 integration-test file. Not even tests reference the constant directly.
- **Why it matters:** Any fix to the canonical (retry policy, typed search response) does not reach this class. It is pure maintenance weight with no caller to justify it.
- **Convergence: delete** `pooled_elasticsearch_client.rb` + its integration test.

**[high] app/consumers/web/site_consumer.rb:80** — vendor-type leakage in batch callback; canonical delivers typed `Http::Response`
- **What:** The `on_complete` callback casts the response back to raw `Vendor::Response` and reads `.body`/`.success?` off it. The canonical `Http.batch` callback already delivers a typed `Http::Response` (see the sibling `profile_enrichment_consumer.rb:46-55` for the correct shape).
- **Caller-count:** live — 1 production caller. Not stranded; a convergence migration, not a deletion.
- **Why it matters:** The consumer is coupled to the vendor's response shape, defeating the typed boundary the substrate exists to provide. A substrate-level change (e.g., normalized response body) breaks this consumer silently.
- **Convergence: migrate** — drop the cast, read `Http::Response#body`/`#success?` directly. Same-class defect: check sibling services in the same lane for the identical cast.

**[medium] app/services/site/large_download_service.rb:108** — direct vendor bypass justified by a substrate feature gap (streaming)
- **What:** Constructs `Vendor::Request.new` with an `on_body` streaming callback for 660MB+ zip downloads; reads `request.response.code` as raw `Vendor::Response`. Bypasses `Http::Client`.
- **Caller-count:** live — 1 production caller.
- **Why it matters:** The bypass is not gratuitous — `Http::Client` does not currently expose `on_body` streaming. Migrating blindly would break the large-download path. But the bypass is undocumented, so the gap is invisible.
- **Convergence: close-gap then migrate** — record a `RATIONALE: streaming download — Http::Client exposes no on_body. Would need Http::Client#on_body support to reconsider.` Track the substrate gap; when the substrate exposes streaming, migrate this site and delete the `RATIONALE`.

**[medium] app/lib/email/mail_client.rb:1** — inverse pattern: canonical typed boundary stranded while raw-vendor path is live
- **What:** `Email::MailClient` is the typed canonical boundary (returns `FetchedMessage`), but its sole caller `Email::ImapService` has zero production callers. The live path is `Retrieval::Strategy::Imap`, which uses `Net::IMAP` directly and leaks raw `FetchData`/`Envelope`.
- **Caller-count:** `MailClient` 0 prod (1 stranded caller); `Retrieval::Strategy::Imap` live (consumer + source_config).
- **Why it matters:** The canonical boundary is dead and the raw-vendor leak is alive — the opposite of the intended architecture. Deleting the canonical entrenches the leak; deleting the raw path strands the consumers.
- **Convergence: design-issue** — needs a head-to-head plan: extract the live strategy's behavior into `MailClient` and migrate consumers, or converge the strategy onto `MailClient`. Not a deletion; not a single-turn fix.

**[low] app/services/proxy/pinger.rb:26** — direct vendor construction the canonical substrate already covers
- **What:** Builds `Vendor::Hydra.new` + `Vendor::Request.new` for concurrent pings. `Http.batch` exposes `hydra`/`queue` and per-request callbacks for exactly this.
- **Caller-count:** live — 1 production caller (`Proxy::Pinger`).
- **Why it matters:** Minor — the substrate covers the feature; this is a maintenance hazard, not a correctness bug. Latency-timing fields read off the raw response may need a substrate passthrough (verify the gap before migrating).
- **Convergence: migrate** to `Http.batch` (verify timing-field passthrough first; if missing, treat as close-gap).

## Output Template

- Canonical substrates reviewed (with authority — ADR / typed boundary / caller count):
- Duplicate substrates (parallel impls bypassing the canonical):
- Stranded substrates (zero prod callers, canonical exists) — deletable:
- Inverse patterns (canonical itself stranded, raw-vendor live) — needs design decision:
- Vendor-type leakage sites (raw vendor types upstream of the typed boundary):
- Direct bypasses (vendor primitives constructed outside the substrate):
  - Of which justified by a substrate feature gap (track gap, do not delete):
- Parallel-namespace sprawl (one concern across multiple roots):
- Cop-Exclude / lint-whitelist debt inventory (entries that are live escape hatches):
- Self-authored RATIONALEs invalidated by caller-count:
- Convergence recommendations (delete / migrate / close-gap / design-issue):
- Cross-cutting findings (reported here; sibling lens noted in triage):
- Not reviewed:

State the caller-count in every stranded/duplicate finding. Name the canonical and its authority before recommending deletion.
