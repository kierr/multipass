---
name: type-safety-multipass
multipass_desc: "Review type discipline across TypeScript, Python, Ruby, Go, and other typed languages — strictness gaps, unsound casts, missing narrowing, escape hatches, and type-system defeats that let runtime bugs through."
description: "-"
when_to_use: "When reviewing type safety, type annotations, generics, union types, or when the user mentions types, type safety, or type checking."
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
| `critical` | Type defeat causing data loss, security bypass, or production breakage | `any` on auth payload, unsound cast on financial data |
| `high` | Type-system escape hatch likely to cause runtime errors under normal usage | Unchecked `as` cast, missing null guard on typed optional |
| `medium` | Type discipline gap that could cause problems under specific conditions | Missing generic parameter, over-broad union type, incomplete type narrowing |
| `low` | Minor improvement — stricter types, better inference, dead type annotations | Unused type parameter, unnecessarily broad type |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Soundness verification:** Trace the full type flow from source to sink. Construct a concrete runtime scenario where the type gap produces incorrect behavior. Verify the type system cannot catch it at compile/check time. Check whether runtime guards exist that compensate for the type gap.

**Strictness verification:** Verify the issue is a real type-safety gap, not just "could be stricter." A finding requires a concrete path from type defeat to runtime failure, not just "this could use a narrower type." Check whether the current type, while broad, correctly describes the actual runtime values.

**Framework verification:** When a finding depends on how a type system or checker behaves (TypeScript strict mode, Sorbet strictness levels, mypy strict), verify the claimed behavior against the tool's documentation. "TypeScript allows X" is not a finding until verified against the TypeScript handbook or compiler source. If you cannot verify, flag as `[unverified]`.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Type Safety Review

Review type discipline to catch type-system defeats that let runtime bugs through. Type safety is the property that no well-typed program "goes wrong" at runtime — every escape hatch (cast, any, unchecked union) is a potential gap where the type system's guarantees break down.

## Scope

- Identify typed languages in the repo (TypeScript, Python with type hints, Ruby with Sorbet, Go, Rust, Java, Kotlin, Elixir with dialyzer).
- Identify the type-checking configuration and strictness level (tsconfig strict mode, mypy strictness, Sorbet strictness levels).
- Identify type-system escape hatches: casts, `any`/`dynamic`, type assertions, unchecked unions, `@ts-ignore`, `# type: ignore`, `T.untyped`.
- Identify boundary crossings where typed code meets untyped data (API responses, parsed JSON, database results, user input).

## Workflow

1. Map type-checking configuration and strictness levels.
2. Identify escape hatches and measure their density (casts per file, `any` usage, ignore directives).
3. Trace boundary crossings where typed code consumes untyped data.
4. Verify type narrowing completeness (does every union access narrow before use?).
5. Verify generic usage (are generic parameters preserved or erased?).
6. Verify error-handling types (are error types modeled or caught as `unknown`/`any`?).
7. Classify findings by distance from type defeat to runtime failure.

## The Silent Killers

**The `any` on the auth payload** — `const user = response.data as any` at the API boundary. The type system assumes `any` from here on. A field rename in the API response silently produces `undefined` downstream — no compile error, no runtime error until the null hits a division operation in the billing calculation. The type system was supposed to catch this. The `any` let it through.

**The unsound cast on financial data** — `order.total as number` asserts the type without validation. The API returns a string `"42.50"` from a legacy endpoint. The cast silences the compiler. `order.total * taxRate` concatenates strings instead of multiplying numbers. The financial report is wrong. The type system said it was safe.

**The ignored union branch** — A discriminated union has three variants: `Success`, `Pending`, `Error`. The code handles `Success` and `Error` but not `Pending`. In TypeScript without `noUncheckedDiscriminatedUnion`, the compiler doesn't flag this. In production, a pending payment is silently treated as success — the user's order ships before payment clears.

**The escape hatch that became permanent** — `// @ts-expect-error` added during a migration six months ago. The migration completed but the suppression stayed. It now hides a real type error introduced by a dependency upgrade. Every developer who reads the code assumes the suppression is intentional. The type system is defeated by a comment.

## Language-Specific Surfaces

### TypeScript

- `any` usage (explicit or implicit via missing annotations)
- Type assertions (`as X`) without runtime validation
- Non-null assertions (`!`) on potentially null values
- Unchecked definite assignment (`!` on class properties)
- `@ts-ignore` / `@ts-expect-error` suppressing real type errors
- Missing `strictNullChecks` — all `undefined`/`null` values untracked
- Generic parameters inferred as `any` when type context is insufficient
- `noUncheckedIndexedAccess` — array/object indexing returns `T | undefined` only when enabled
- Enum safety: numeric enums are bidirectional and allow any number; const enums have their own pitfalls
- Type predicates (`x is T`) that lie — the function body doesn't actually validate the predicate
- `satisfies` vs type annotation — `satisfies` validates without widening, annotation widens

### Python

- `Any` usage (explicit or implicit via missing annotations in strict mode)
- `typing.cast()` without runtime validation (pure type-level assertion)
- `# type: ignore` suppressing real mypy/pyright errors
- `Optional[X]` accessed without None check — `AttributeError` at runtime
- `Union` types where one branch is never handled
- Missing return type annotations causing inference to fall back to `Any`
- `**kwargs: Any` — untyped keyword arguments are escape hatches
- Pydantic/dataclass validators that cast without rejecting invalid data
- Generic classes where type parameters are erased at runtime (no runtime check on `isinstance`)
- `typing.overload` signatures where the implementation doesn't match

### Ruby / Sorbet

- `T.untyped` usage — the Sorbet equivalent of `any`
- `T.must()` on values that can actually be nil — runtime crash if wrong
- `T.cast()` without runtime verification (soft cast in `typed: strict`)
- `T.unsafe()` bypassing the type system entirely
- `typed: false` or `typed: true` files in a `typed: strict` repo — inconsistency
- Missing override annotations (`extend T::Sig`, `extend T::Helpers`)
- `.sig` blocks with overly broad types (`T.any(...)` with too many alternatives)
- Struct/const missing type annotations
- RBI shims that declare types not matching the implementation

### Go

- Interface assertions (`v.(T)`) without comma-ok check — panics on mismatch
- `any` (alias for `interface{}`) losing type information
- Nil interface vs nil concrete value confusion — a nil `*T` assigned to interface `T` is non-nil
- Missing error type narrowing — handling `error` without type assertion or `errors.As`
- Unchecked type switches with no default or catch-all
- Slice/map access without existence check
- Pointer receivers on nil — methods can be called on nil receivers, causing panics if unchecked
- `reflect` package usage bypassing compile-time type checking

### Rust (if present — usually strong, but watch for)

- `unsafe` blocks bypassing borrow checker
- `unwrap()` / `expect()` on potentially None/Err — panic on failure
- `transmute` — reinterpreting memory, unsound if sizes don't match
- Raw pointer dereferencing without safety invariants documented

### Java / Kotlin

- Raw types (`List` without type parameter) — legacy escape hatch
- Unchecked casts (`(List<String>) obj`) suppressed with `@SuppressWarnings`
- Kotlin platform types from Java interop — nullability unknown
- Kotlin `!!` operator on potentially null values
- Generic erasure — `instanceof List<String>` doesn't compile, runtime checks lose type parameter

## Common Type Safety Risks

- **Type assertion without validation:** `as` / `cast` that assumes a shape without checking. The type system trusts the developer, but the developer is wrong.
- **Unvalidated boundary data:** JSON.parse, API response, database row consumed as typed without runtime validation. The type says `User` but the data is `unknown`.
- **Narrowing gap:** Union type accessed without discriminating first. `value.foo` where `value` could be `A | B`.
- **Escape hatch accumulation:** `any` / `untyped` / `ignore` that was supposed to be temporary but became permanent. Each one is a hole in the type system.
- **Type predicate lies:** A type guard function that claims `x is T` but doesn't actually verify. The compiler trusts it and narrows, but the narrowing is unsound.
- **Generic erasure:** Generic type parameter lost at boundary (API, serialization, deserialization). `List<String>` arrives as `List<any>`.
- **Nullable without check:** `Optional<T>` / `T | null` / `T.nilable` accessed without None/null guard. The type system caught it; the code ignored it.

## Guardrails

- Evaluate type safety against the project's configured strictness level, not an idealized maximum. A `typed: true` Sorbet repo should not be flagged for not being `typed: strict`. Report gaps relative to the configured level.
- Require a concrete runtime failure path before labeling a type gap as high or critical. "This could be stricter" is low. "This `any` lets a null through to a division operation" is high.
- Distinguish between intentional escape hatches (documented, bounded, with runtime guards) and accidental ones (added to suppress a warning, no runtime protection). The former may be acceptable; the latter is a bug waiting to happen.
- Recognize that some escape hatches are ecosystem-standard patterns (Go's `if err != nil`, Python's `typing.cast`). Report these only when they create actual unsoundness, not merely because they exist.
- Separate strictness advocacy from correctness bugs. "Enable strictNullChecks" is a configuration recommendation, not a finding. "This variable is typed as non-null but can be null at runtime" is a finding.

## Useful Checks

```bash
# TypeScript escape hatches
rg -n ": any\b|as any" --type ts
rg -n "@ts-ignore|@ts-expect-error" --type ts
rg -n "!\." --type ts  # non-null assertions
rg -n "as [A-Z]" --type ts  # type assertions

# Python escape hatches
rg -n "Any\b" --type py
rg -n "# type: ignore" --type py
rg -n "typing\.cast" --type py
rg -n "Optional\[" --type py  # check for missing None guards

# Ruby / Sorbet escape hatches
rg -n "T\.untyped|T\.unsafe|T\.cast" --type ruby
rg -n "T\.must\(" --type ruby
rg -n "# typed:" --type ruby  # check strictness levels

# Go escape hatches
rg -n "\.\(\w+\)" --type go  # interface assertions
rg -n "\bany\b" --type go

# Configuration strictness
rg -n "strictNullChecks|noImplicitAny|strict" tsconfig.json
rg -n "strictness|typed:" --type yaml --type ruby
```

### Example Findings

**[high] src/api/handlers/users.ts:34** — API response consumed as `User` without runtime validation
- **What:** `const user = response.data as User` asserts the type without validating the shape. If the API returns unexpected fields or missing fields, downstream code accesses `user.email` on `undefined`.
- **Why it matters:** Type assertion bypasses both the type system and runtime validation. An API contract change or network error produces `undefined` access in production with no compile-time warning.
- **Fix:** Use a runtime validator (zod, io-ts, or manual check): `const user = UserSchema.parse(response.data)`.

**[medium] lib/models/order.py:78** — `Optional[Decimal]` accessed without None check before arithmetic
- **What:** `total = order.subtotal + order.tax` where both are typed `Optional[Decimal]`. If either is None, this raises `TypeError: unsupported operand type(s)`.
- **Why it matters:** The type checker flags this in strict mode, but the repo runs mypy with `--no-strict-optional`. The type system knows it's dangerous; the configuration suppresses the warning.
- **Fix:** Add explicit None guard: `if order.subtotal is None or order.tax is None: raise ValueError(...)`. Then configure `strict_optional = True` in mypy.ini.

**[low] app/services/parser.rb:12** — `T.cast(data, T::Hash[String, T.untyped])` — inner type is untyped
- **What:** The cast validates the outer structure (Hash with String keys) but the values remain `T.untyped`. Any value passes through without type checking.
- **Why it matters:** Narrow escape hatch — the outer shape is verified but inner values lose type safety. Downstream code assumes typed values but gets untyped data.
- **Fix:** Define a typed struct for the inner values and cast to `T::Hash[String, MyStruct]`.

## Output Template

- Type-checking configuration and strictness level:
- Escape hatches found (by category and density):
- Boundary crossings without validation:
- Narrowing gaps (unhandled union branches):
- Confirmed type-soundness bugs:
- Strictness recommendations (configuration, not code):
- Recommended minimal fixes:

Prioritize findings where type defeats produce runtime failures, not merely where types could be stricter.
