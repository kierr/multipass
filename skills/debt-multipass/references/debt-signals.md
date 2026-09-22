# Debt Signals

Use these signals to decide whether something is real debt, what kind of debt it is, and whether it is worth paying down now.

## Strong Signals

- **Recurring change friction**: one logical change routinely requires edits in three or more places, or the same hotspot absorbs unrelated changes week after week.
- **Migration leftovers**: dual reads or writes, deprecated formats, temporary adapters, compatibility shims, or flags with no visible removal path.
- **Boundary drift**: the same business rule or concept is re-encoded across layers, forcing glue code and brittle invariants.
- **Dead or orphaned structure**: wrappers, extensions, config keys, branches, or workflows that no longer have a credible caller or owner.
- **Operational drag**: manual setup, release, or recovery work that repeatedly burns developer time or increases change risk.
- **Suppression debt**: persistent `eslint-disable`, `@ts-ignore`, `type: ignore`, or similar comments that hide fixable issues.

## Prioritize Now

Favor debt that already has visible interest:

- It slows common changes or causes shotgun surgery.
- It contributes to incidents, regressions, or fragile deploys.
- It blocks planned work or forces teams into risky workarounds.
- It enables meaningful deletion or simplification once fixed.

## Usually Defer

Avoid reporting debt just because something is older or imperfect:

- Stable low-churn code that is rarely touched
- Temporary code with an owner and credible removal path
- One-off duplication kept for isolation or reduced coupling
- Version freshness or ecosystem modernization without present-day drag

## Paydown Style

Prefer incremental repair over rewrite:

- delete one stale bridge
- consolidate one duplicated rule
- remove one deprecated path
- isolate one unstable boundary

Only recommend a rewrite when incremental options have been inspected and shown to be impractical.
