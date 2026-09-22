---
name: api-design-multipass
multipass_desc: "Review API design quality — RESTful conventions, resource naming, pagination, idempotency, error response consistency, versioning strategy, and input/output design patterns."
description: "-"
when_to_use: "When reviewing API design, endpoint structure, request/response patterns, or when the user mentions REST, GraphQL, or API design."
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

1. **Branch diff.** If on a non-default branch (not main/master), diff against the merge base: `git diff $(git merge-base HEAD origin/main)...HEAD`. This captures the full changeset.
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
| `critical` | API design flaw that causes data loss, security exposure, or systemic client breakage | Non-idempotent mutations on retry-unsafe transports, missing auth on sensitive endpoints |
| `high` | Design issue that causes incorrect behavior or significant integration difficulty for consumers | Inconsistent pagination causing data gaps, wrong HTTP method semantics |
| `medium` | Design quality issue that degrades developer experience or maintainability | Inconsistent error response shapes, missing pagination on list endpoints |
| `low` | Minor improvement — naming, documentation, convention adherence | Inconsistent resource naming, missing example in docs |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Convention verification:** Before flagging a non-RESTful pattern, confirm the project actually follows REST conventions. GraphQL, RPC, and event-driven APIs have different design norms. A POST to `/users/search` is not a REST violation — it's a search operation that doesn't map cleanly to GET.

**Impact verification:** Design quality findings must show concrete consumer impact. "This endpoint should use PATCH instead of PUT" is not actionable without explaining what breaks or what integration difficulty it causes. Design preferences are not findings.

**Consistency verification:** When claiming inconsistency (e.g., "pagination style differs across endpoints"), confirm both endpoints serve the same consumer group and that the inconsistency actually causes integration difficulty. Different consumer groups may legitimately use different patterns.

**Idempotency verification:** Before flagging a non-idempotent mutation, confirm the transport is actually retry-prone. Internal RPC over a reliable connection doesn't need idempotency keys the way a public REST API over mobile networks does.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# API Design Quality Review

This lens reviews whether APIs are well-designed, not whether they are backward-compatible. Compatibility (will existing clients break?) is owned by `api-contract-multipass`. Breaking-change risk (should this change be gated?) is owned by `breaking-change-multipass`. This lens asks a different question: is the API well-designed in the first place?

## Scope

- RESTful convention adherence: HTTP method semantics, resource naming, status code usage
- Pagination design: cursor vs offset, hasNext semantics, total count availability
- Error response consistency: structure, machine-readability, actionability
- Idempotency: safe retries on mutable operations, idempotency keys where needed
- Input/output design: field naming, nesting depth, partial responses, field selection
- Versioning strategy: URL path vs header vs query param, version lifecycle
- Filtering, sorting, and search design: composability, consistency, performance implications
- Rate limiting and throttling design: headers, granularity, backoff signaling

## The Silent Killers

**The non-idempotent mutation on a retry-unsafe transport** — A mobile client creates a payment via `POST /payments`. The network is slow. The client retries. Two payments are created. The user is double-charged. The fix is simple — an idempotency key header — but it was never added because "POST creates a resource, that's RESTful." Being RESTful is not enough; being safe for the transport is what matters.

**The offset-pagination time gap** — A paginated list endpoint uses offset-based pagination: `GET /items?offset=100&limit=50`. An item is inserted at position 80 between page fetches. The client sees item 131 twice (it moved from position 131 to 132) and never sees item 80. For feeds and activity streams, this causes duplicate entries and silently dropped records. Cursor-based pagination avoids this.

**The inconsistent error shape** — Endpoint A returns `{ "error": { "code": "NOT_FOUND", "message": "..." } }`. Endpoint B returns `{ "errors": [{ "type": "not_found", "detail": "..." }] }`. Endpoint C returns `{ "status": 404, "reason": "..." }`. All three are 404s. Clients must parse three different error shapes to handle the same status code. This is not a compatibility issue — all three work individually. It's a design quality issue that multiplies integration cost by the number of inconsistency variants.

**The write that reads back differently** — `POST /users` accepts `{ "first_name": "...", "last_name": "..." }` but `GET /users/123` returns `{ "firstName": "...", "lastName": "..." }`. The write schema and read schema use different naming conventions. Clients must maintain two models for the same entity. This is the most common design quality issue and the most frustrating to integrate with.

**The unfiltered list endpoint** — `GET /items` returns all items. There are 2 million items. There's no filtering, no search, no pagination. It works in development with 10 items. It times out in production. List endpoints must support pagination and filtering by design, not as an afterthought.

**The polymorphic response that isn't typed** — An endpoint returns different response shapes depending on the resource type, but the type isn't in the response. Clients must infer the shape from the presence or absence of fields. This is fragile — adding a new type breaks every client that doesn't handle the "unknown" case. Use a discriminator field.

## Workflow

1. Survey all API endpoints: list routes, handlers, and their HTTP methods. Map the API surface.
2. Check HTTP method semantics: does POST create? Does PUT replace? Does PATCH partially update? Are GETs side-effect-free?
3. Review resource naming: plural nouns, consistent casing, hierarchical relationships expressed in paths.
4. Audit pagination: is it present on all list endpoints? Is it cursor or offset? Is the strategy consistent?
5. Check error response consistency: do all error responses share a structure? Is there a machine-readable error code?
6. Verify idempotency: are mutable operations safe to retry? Do they use idempotency keys?
7. Review input/output alignment: do write and read schemas use the same naming and structure?
8. Check versioning: is there a strategy? Is it applied consistently?
9. Assess filtering/sorting: can consumers narrow list results? Is the design composable?

## Guardrails

- This lens reviews design quality, not backward compatibility. `api-contract-multipass` owns compatibility. `breaking-change-multipass` owns release gating.
- Design quality is subjective. Anchor findings in concrete consumer impact: "clients must parse 3 error shapes" beats "error responses should be consistent."
- Not every API must be RESTful. GraphQL, gRPC, RPC, and event-driven APIs have different design norms. Evaluate against the project's chosen paradigm, not an abstract ideal.
- Prefer concrete findings over theoretical concerns. "The write schema uses snake_case and the read schema uses camelCase at line X" beats "schemas should be consistent."
- Pagination style (cursor vs offset) is a design choice, not a correctness issue. Flag inconsistency, not the choice itself. Cursor pagination is better for feeds; offset is acceptable for small, stable collections.

## Useful Checks

```bash
rg -n "routes|router|resources|scope|namespace|controller" --type ruby
rg -n "@router\.(get|post|put|patch|delete|route)" --type go
rg -n "router\.(get|post|put|patch|delete)" --type ts
rg -n "pagination|page|per_page|limit|offset|cursor|next_token|after|before" -i
rg -n "idempoten|Idempotency-Key|idempotency_key" -i
rg -n "render json|render.*status|respond_to|serializ" --type ruby
rg -n "status_code|statusCode|http_status|HttpStatus" -i
rg -n "error_response|ErrorResponse|error_json|ErrorSchema" -i
rg -n "api/v|version|Accept:|X-API-Version" -i
rg -n "filter|sort|search|query_param|q=" -i
```

### Example Findings

**[high] app/controllers/api/v1/orders_controller.rb:45** — payment creation endpoint lacks idempotency key, causing duplicate charges on mobile network retries
- **What:** `POST /api/v1/orders/:id/payments` creates a payment charge each time it is called. There is no idempotency key mechanism. Mobile clients on unreliable networks retry failed requests automatically.
- **Why it matters:** Retries create duplicate payments. The last incident (INC-891) resulted in 47 duplicate charges and $12K in refunds plus chargeback fees.
- **Fix:** Accept an `Idempotency-Key` header. Store the key with the payment record. On duplicate key, return the original payment response instead of creating a new charge.

**[medium] app/controllers/api/v1/items_controller.rb:22** — list endpoint uses offset pagination but serves a real-time feed where items are frequently inserted
- **What:** `GET /api/v1/items?page=2&per_page=50` uses offset-based pagination. Items are inserted continuously. Between page 1 and page 2 fetches, 3 new items were inserted at positions 40-42.
- **Why it matters:** The client sees items 51-53 from page 1 again on page 2, and never sees items 40-42. For a real-time feed, this causes duplicate entries and silently dropped items in every paginated traversal.
- **Fix:** Switch to cursor-based pagination using `created_at` or an opaque cursor: `GET /api/v1/items?after=cursor_token&limit=50`.

**[medium] app/controllers/api/v1/users_controller.rb:15** — write and read schemas use different field naming conventions
- **What:** `POST /api/v1/users` accepts `{ "first_name": "...", "last_name": "..." }` (snake_case). `GET /api/v1/users/:id` returns `{ "firstName": "...", "lastName": "..." }` (camelCase). The serializer transforms the output but the input parser does not.
- **Why it matters:** Clients must maintain two models for the same entity. A client creating a user with `firstName` gets a 422. A client reading the response with `first_name` gets undefined. Integration friction doubles.
- **Fix:** Align both schemas on the same naming convention. If camelCase is the API standard, accept camelCase in the write schema too.

## Output Template

- API surface reviewed:
- HTTP method semantics issues:
- Resource naming inconsistencies:
- Pagination design gaps:
- Error response inconsistencies:
- Idempotency gaps:
- Input/output alignment issues:
- Versioning strategy assessment:
- Filtering/sorting gaps:
- Not reviewed:
