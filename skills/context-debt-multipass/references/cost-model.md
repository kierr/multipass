# Context Debt Cost Model

The measured and doctrinal ground for every context-debt check. Cite these sections in findings; never assert causal performance claims. Verified 2026-08-23 by adversarial multi-source review (24/25 claims confirmed 3-0).

## §1. Measured mechanisms — volume and position cost, independent of correctness

- **Lost in the middle** (arXiv 2307.03172): retrieval and reasoning performance varies significantly with the *position* of relevant information — a U-curve where mid-context content is worst attended.
- **RULER** (arXiv 2404.06654): models scoring near-perfect on needle-in-a-haystack degrade sharply on reasoning at a fraction of their claimed window — effective length ≪ advertised length.
- **Same Task, More Tokens** (arXiv 2402.14848): reasoning degrades as input grows *even when the added tokens are irrelevant padding*. Context volume is not free at any window size — the core ground for the budget check.
- **Context Rot** (Chroma, research.trychroma.com/context-rot; vendor research, methodology public): even a single irrelevant distractor reduces performance vs baseline; degradation is worst when the needed information is semantically distant from the query — the ground for the semantic-distance check.

## §2. Instruction density

- **IFScale** (arXiv 2507.11538): across 20 frontier models from 7 providers, the best reach ~68% instruction-following accuracy at 500 simultaneous instructions, with monotonic decay as density grows. Caveats: keyword-inclusion instructions in a single business-report task; mid-2025 cohort. Transfer to instruction files is an inference from this measurement, not a measurement of instruction files.

## §3. Doctrine anchors — tool-vendor guidance, verified live 2026-08-23

Anthropic (code.claude.com/docs/en/memory, /best-practices):
- "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"
- < 200-line target for instruction files: "Longer files consume more context and reduce adherence."
- Per-line causal test: "Would removing this cause Claude to make mistakes? If not, cut it."
- Enforcement medium: "Claude treats them as context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook instead."
- Progressive disclosure: "If an entry is a multi-step procedure or only matters for one part of the codebase, move it to a skill or a path-scoped rule instead"; auto memory "skips anything it can derive from the codebase, such as architecture, file paths, or debugging fixes."

HumanLayer (humanlayer.com/blog):
- "Long-context models degrade at all context lengths, not just long ones."
- "More context isn't more capability — the instruction budget doesn't scale with the context window."
- "The longer your file gets, the more Claude seems to treat individual sections as optional."

AGENTS.md spec (agents.md, Linux Foundation): open-ended scope — "anything you'd tell a new teammate belongs here too" — with no size or brevity limits at the spec level. The spec institutionalizes inclusion; this lens is the countervailing measurement.

## §4. Caveats — why findings cite measurements + anchors, never causal claims

- Benchmarks span 2023–2025 model cohorts; effect magnitudes have shrunk on frontier models.
- Chroma's study is non-peer-reviewed vendor research (vector-DB incentive), though methodology and data are public.
- IFScale is one task type; the density → instruction-file transfer is inferential.
- No controlled study of documentation volume vs agent coding performance exists; the 2026-08-23 synthesis was medium-confidence. Doctrine anchors are vendor guidance, not measurements — cite them as anchors, not as proof of a specific degradation.
