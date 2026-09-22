---
name: data-contract-multipass
multipass_desc: "Review data contracts for consistency across config files, JSON/YAML schemas, seed data, enums, and application code — scale mismatches, type drift, stale definitions, and divergent canonical sources."
description: "-"
when_to_use: "When reviewing data contracts, schema consistency across config files, JSON/YAML schemas, seed data, enums, or when the user mentions data contracts, schema drift, or type consistency."
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
| `critical` | Data corruption, silent wrong values in production | Scale mismatch causing wrong diagnoses, enum values silently mapped to wrong codes |
| `high` | Likely contract violation affecting correctness under normal usage | YAML template allows 0-1 but schema validates 0-100, string vs object type mismatch |
| `medium` | Quality issue that could cause problems under specific conditions | Stale seed data not matching current schema, overlapping field definitions with no canonical source |
| `low` | Minor improvement — naming, organization, documentation | Inconsistent field naming across sources, missing comments on non-obvious constraints |
| `unverified` | Plausible but not confirmed against primary source | Spec-dependent claims where the authority source was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Scale verification:** When claiming a scale mismatch, confirm both sides actually constrain the same dimension. A YAML template with `min: 0, max: 1` and a JSON Schema with `minimum: 0, maximum: 100` is only a mismatch if they represent the same field with the same semantic range. Verify the field names, paths, and contexts match before reporting.

**Type verification:** When claiming a type mismatch, confirm both definitions are active at the same time. A field that was `string` in v1 and `object` in v2 is intentional migration, not a bug. Check whether versioning or migration code reconciles the difference.

**Canonical source verification:** When claiming overlapping definitions, confirm there isn't a documented single source of truth. `gender` vs `genderIdentity` may be intentionally distinct fields. Check documentation, comments, and usage before claiming they should be merged.

**Staleness verification:** When claiming seed data is stale, confirm the schema change that invalidated it. Seed data that doesn't exercise new fields isn't necessarily stale — it may simply predate those fields. Only flag when seed data contradicts the current schema (wrong types, missing required fields, values outside allowed ranges).

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy input | Create a GitHub issue |

# Data Contract Review

Data contracts are the agreements between definition, validation, storage, and display. When these sources diverge, the system silently accepts wrong data, rejects valid data, or displays nonsense — and tests rarely catch it because each source is typically tested in isolation. This lens reviews consistency across all representations of the same data: config files, JSON/YAML schemas, database columns, seed data, enums, form validations, and serialization code.

`schema-multipass` owns DDL structure and query efficiency. `api-contract-multipass` owns external API compatibility. This lens owns the consistency between data *definitions* across file formats and application layers — the space between "the schema says integer" and "the YAML template sends a decimal."

## Scope

- Enum and constant consistency: codes, labels, and display strings defined in multiple places
- Schema cross-validation: JSON Schema vs YAML templates vs ORM validations vs form validations
- Scale and range mismatches: one source allows 0-1, another allows 0-100, a third allows any float
- Type drift: field defined as string in one place, object in another, integer in a third
- Seed and fixture data freshness: do seed files match the current schema constraints?
- Canonical source identification: when the same concept is defined in multiple places, which is authoritative?
- Config-to-code alignment: application code consuming config values that have drifted from the config format

## The Silent Killers

**The scale trap** — A YAML template defines a slider from 0.0 to 1.0 (normalized score). The JSON Schema validates the same field as `minimum: 0, maximum: 100` (percentage). The database column is `integer`. The form sends a decimal. Each layer validates correctly against its own definition — but the user's 0.7 becomes 0 (truncated integer) in the database, which the JSON Schema accepts (0 is within 0-100), and the display layer shows 0% instead of 70%. Nobody catches it because each layer's validation passes in isolation.

**The enum with three sources of truth** — The `status` field is defined as an enum in the database migration, as a Ruby constant hash in the model, and as a dropdown in a YAML config. Someone adds a new status to the model but forgets the YAML config. The form can't produce the new status. Someone else adds a different status to the YAML but the database enum rejects it. Tests pass because they use the model constant directly, never exercising the YAML config path.

**The stale seed file** — A migration adds a required `category` column with a NOT NULL constraint. The seed file still inserts records without `category`. Local development works because the seed ran before the migration. New developer setup fails silently — seeds insert NULL, the constraint catches it, but the error is swallowed by a rescue block. Production is fine because seeds don't run there. The gap survives until someone tries to set up a fresh environment.

**The overlapping field** — `gender` is defined in the user profile YAML as a free-text field. `genderIdentity` is defined in the patient intake schema as a coded enum. Both feed the same database column. The form accepts free text, the API validates against the enum, and records that pass the form are rejected by the API. There's no documented canonical source.

**The renamed field that wasn't** — A JSON Schema renames `patient_dob` to `date_of_birth`. The YAML template still uses `patient_dob`. The application code looks for `date_of_birth`. On the write path, the form sends `patient_dob`, the app expects `date_of_birth`, and the field is silently nil. On the read path, the stored data has the old key name but the API response uses the new one.

## Workflow

1. **Inventory data sources.** Find all files that define or constrain the same data shapes: JSON Schemas, YAML templates, config files, seed/fixture files, model validations, database enums, form definitions, and serialization code.
2. **Build a field map.** For each data shape, list every field and its definition in each source: type, range/enum, required/optional, default value, and naming.
3. **Cross-validate types.** For each field present in multiple sources, verify the type is compatible. String vs integer, float vs decimal, object vs string — flag any mismatch where the same logical field has incompatible type constraints.
4. **Cross-validate ranges and enums.** For each field with bounded values, verify the bounds match across all sources. Different ranges for the same field are the most dangerous contract violation because each source validates correctly in isolation.
5. **Identify canonical sources.** For fields defined in multiple places, determine which source is authoritative. Flag cases where no canonical source is documented or where two sources contradict each other with no documented precedence.
6. **Check seed data freshness.** For each seed/fixture file, verify its records satisfy the current schema constraints. Stale seed data is a setup-time bomb.
7. **Trace field name consistency.** For fields that flow across file formats (YAML → JSON → DB), verify the field name is consistent or the mapping is explicit and tested.

## Guardrails

- This lens reviews consistency between data definitions, not schema structure (owned by `schema-multipass`) or API compatibility (owned by `api-contract-multipass`).
- Versioned schema differences are expected. A v1 schema allowing strings and a v2 schema requiring objects is migration, not drift — unless both are active simultaneously.
- Not every duplicate definition is a problem. Constants repeated in code and config are fine when one is clearly derived from the other with documentation. Flag when derivation is undocumented or has drifted.
- Seed data that doesn't exercise every field is not necessarily stale. Only flag when seed data violates current constraints.
- Focus on fields that flow across format boundaries (YAML → JSON → DB → API). Fields defined and consumed entirely within one file format are lower risk.

## Useful Checks

```bash
rg -n "enum|ENUM|status:|type:|minimum:|maximum:|min:|max:|pattern:" --type yaml --type json
rg -n "validates|validation|inclusion|exclusion|numericality|format" -i
rg -n "seed|fixture|factory|fabrication" -i --type ruby --type js --type ts
rg -n "JSONSchema|json.schema|ajv|dry.validation|joi|zod|yup" -i
rg -n "enum|status_map|STATUS_|STATUS_ENUM|code_map|label_map" -i
find . -name "*.schema.json" -o -name "*.schema.yaml" -o -name "*_schema.*" -o -name "*seed*" -o -name "*fixtures*"
```

### Example Findings

**[critical] config/templates/assessment.yml:23** — scale 0.0–1.0 contradicts JSON Schema maximum of 100
- **What:** The YAML template defines `severity_score` as a slider with `min: 0.0, max: 1.0`. The JSON Schema at `schemas/assessment.json` validates the same field as `minimum: 0, maximum: 100, type: integer`. The database column is `integer`.
- **Why it matters:** A user enters 0.7 on the form (YAML template). The application truncates to 0 (integer cast). The JSON Schema accepts 0 (within 0-100). The stored value is 0 instead of 70. Display layer shows 0%. Clinical decisions are made on a severity score of 0 when the user intended 70%.
- **Fix:** Decide on a single scale (recommend 0-100 integer). Update the YAML template to `min: 0, max: 100, step: 1`. Verify the JSON Schema matches. Document the canonical scale in the field's comment.

**[high] app/models/patient.rb:15** — `gender` and `genderIdentity` both map to the same DB column with different validation rules
- **What:** The patient model defines `gender` as a free-text string validated only for presence. The intake form defines `genderIdentity` as a coded enum with 7 values. Both write to `patients.gender_identity` via different code paths. The model's `gender` setter stores any string; the intake form's `genderIdentity` setter validates against the enum.
- **Why it matters:** Records created through the patient model bypass the enum validation. Records created through intake reject values not in the enum. A patient with `gender: "non-binary"` (free text) and another with `genderIdentity: "NON_BINARY"` (coded) coexist in the same column with no consistent query semantics.
- **Fix:** Consolidate to a single field name and validation source. Define the canonical enum in one place (recommend the model) and have both code paths use it. Document which source is authoritative.

**[medium] db/seeds/assessment_types.yml:8** — seed data missing required `category` field added in migration 20240315
- **What:** Migration `20240315_add_category_to_assessment_types.rb` added `category` as NOT NULL with no default. The seed file `assessment_types.yml` still inserts records without `category`.
- **Why it matters:** Fresh environment setup (`db:setup`) fails with a NOT NULL constraint violation. Existing environments are unaffected because the seed only runs on fresh setup. The error is a poor first experience for new developers and blocks automated test environment provisioning.
- **Fix:** Add the `category` field to each entry in the seed file with appropriate values.

## Output Template

- Scope:
- Type mismatches (same field, incompatible types across sources):
- Range/enum mismatches (same field, different bounds across sources):
- Canonical source conflicts (overlapping definitions with no documented authority):
- Stale seed/fixture data:
- Field name inconsistencies across format boundaries:
- Not reviewed:
