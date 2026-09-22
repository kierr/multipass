# Complexity Signals Reference

Deeper analysis of complexity signals and when they are (or aren't) justified. Consult this when a finding is ambiguous or when reviewing in an unfamiliar language/paradigm.

## When Apparent Complexity Is Justified

Before flagging, check whether the complexity solves one of these concrete problems:

- **Multiple implementations exist** (not "might exist someday") — interfaces, traits, and abstractions earn their place
- **Testing requires it** — test doubles for external services justify interface extraction
- **Framework or language convention requires it** — respect ecosystem norms
- **Architectural boundary** — adapter patterns at framework edges reduce coupling to external dependencies
- **Regulatory or compliance need** — some domains require verbose, auditable code
- **Measured performance need** — caching or denormalization backed by profiling data

If none of these apply and you can describe a simpler alternative, the complexity is likely accidental.

## Signal Deep Dives

### Unnecessary Indirection

**Why it matters:** Each layer of indirection requires the reader to trace through an extra hop to understand what happens. This compounds — three unnecessary layers mean three mental context switches for every reader, forever.

**Manifestations by paradigm:**

| OOP (Java, C#, TS) | Functional (Elixir, Haskell) | Procedural (Go, C) |
|-----|------|------|
| Single-impl interfaces | Behaviours with one callback module | Function pointer tables with one entry |
| Abstract classes with one child | Unnecessary `use` macros wrapping simple logic | Struct-of-function-pointers for one "strategy" |
| Factory/builder for one type | Protocol implementations for one type | Header-file abstractions over one implementation |
| Service classes wrapping one call | Supervisor trees for processes that don't crash | Layers of function calls that just pass args through |

**The test:** Remove the layer mentally. Would the calling code be clearer calling the target directly? If yes, the indirection isn't paying for itself.

### Speculative Generality

**Why it's expensive:** It doesn't just add code — it shapes architecture around predictions. When the real requirement arrives, it rarely matches the predicted shape. The team then faces a choice between forcing the requirement into the wrong abstraction or tearing it out.

**Common patterns:**
- Plugin systems with one plugin (and no external plugin authors)
- Configuration files where every value is hardcoded in practice
- Event/message buses with exactly one producer and one consumer per event
- Abstract "Provider" or "Adapter" wrapping a single backend
- Generic collection processing when the collection always contains one type

**The test:** Search for actual usage. Count implementations, callers, or configuration values. If the answer is "one," the generality is speculative.

### Premature Abstraction — The Rule of Three

The right abstraction emerges from seeing multiple concrete instances. Two instances often share logic by coincidence. The third instance reveals whether the pattern is real.

**Before the third use case:**
- You don't know which parts are stable vs. variable
- You don't know the right parameter boundaries
- You don't know whether future instances will follow the same shape

**After premature extraction:**
- The abstraction is usually wrong in subtle ways
- Future instances get forced into the wrong shape
- Changing the abstraction requires updating all consumers
- The "shared" code becomes a coupling point rather than a simplification

### Deep Nesting — Context Determines Severity

Nesting depth isn't a number to measure — it's cognitive load to assess. Three levels of trivial nil checks differ fundamentally from three levels of business logic branching.

**High-cost nesting:**
- Each level introduces new concepts the reader must hold in memory
- Inner levels reference variables from multiple outer levels
- The happy path is buried inside conditions
- Error handling is scattered across levels

**Low-cost nesting (usually fine):**
- Guard clauses that exit early for simple conditions
- Language-idiomatic patterns (Ruby `if`/`unless`, Go `if err != nil`)
- Pattern matching with flat alternatives (Elixir/Rust `case`/`match`)

**Reduction strategies:**
- Guard clauses and early returns (move errors to the top)
- Extract named functions (when the inner block is semantically distinct)
- Table-driven logic (when nesting represents a lookup)
- Pattern matching (when the language supports it well)

## Named Anti-Patterns

Memorable names for common over-engineering mistakes. Useful when communicating findings.

- **"Netflix Does It"** — Copying infrastructure patterns from companies operating at 1000x your scale. Kafka for 100 events/day. Microservices for a 3-person team. Elasticsearch for 10K records.
- **Resume-Driven Development** — Technology choices made for learning or career signaling rather than project value. The new hotness instead of the boring thing that works.
- **Speculative Scaling** — "We might need to handle millions of users." Building for hypothetical scale adds real complexity today for imaginary requirements tomorrow.
- **Enterprise Cargo Cult** — Applying enterprise patterns (dependency injection frameworks, service meshes, event buses) to small codebases where direct calls, simple imports, and function composition would work.
- **Framework Within a Framework** — Abstracting over an already-capable framework, creating a parallel API that must be learned in addition to the original.
- **Configuration-Driven Everything** — Making things configurable that never change in practice. Every config option is a decision deferred to runtime that could have been a decision made at code time.
- **Gold Plating** — Adding features nobody asked for. Extra endpoints, additional output formats, optional parameters — each one is maintenance surface area.

## The Basal Cost of Complexity

Every piece of code imposes ongoing cost: cognitive load for readers, testing burden, maintenance effort, operational overhead, and resistance to future change. This "basal cost" compounds across the codebase.

Teams consuming 70-80% of their capacity in basal cost (maintaining existing complexity) hit a capacity trap where meaningful new work becomes nearly impossible. Every unnecessary abstraction, unused configuration option, and speculative generalization contributes to this trap.

When evaluating complexity, consider not just "is this hard to read?" but "what is the ongoing tax this imposes on the team?" A small amount of unnecessary complexity is negligible. But many small amounts compound into a codebase where every change is expensive.

## Language-Specific Considerations

These aren't rules — they're context for recognizing what's idiomatic vs. what's unnecessarily complex in each ecosystem.

### Ruby / Rails
- Metaprogramming (`method_missing`, `define_method`, `class_eval`) is idiomatic — examine whether it's necessary, but don't flag it just for being metaprogramming
- Rails conventions: concerns, callbacks, service objects, form objects have well-understood tradeoffs. Flag when they're used against their purpose (e.g., a concern shared by one model)
- `ActiveRecord` scopes and query chains are idiomatic, not complex
- Watch for: STI where composition works, deeply nested `ActiveRecord` includes, service objects that just wrap one model method

### Python
- "Explicit is better than implicit" — the Zen of Python is the project's style guide
- Decorators and metaclasses should earn their place, but aren't automatically suspect
- Watch for: class hierarchies where functions suffice, `**kwargs` hiding interface requirements, abstract base classes with one implementation, over-use of design patterns from other languages

### JavaScript / TypeScript
- Type-level complexity (conditional types, mapped types, template literal types) can obscure intent when simpler types would work
- React: hooks replaced HOC chains and render props for most cases — flag legacy patterns in new code
- Watch for: Redux/global state for local concerns, generic components serving one use case, barrel exports creating circular dependencies, wrapper components that just pass props through

### Go
- Go deliberately avoids inheritance and complex generics — respect that philosophy
- Small interfaces (1-2 methods) are idiomatic; single-method interfaces used once are noise
- Explicit error handling (`if err != nil`) is expected, not complexity
- Watch for: premature goroutine/channel patterns, interface pollution, dependency injection frameworks (Go prefers explicit wiring)

### Rust
- Ownership, lifetimes, and borrowing add inherent complexity justified by safety guarantees — don't flag these
- Trait bounds and generic constraints are often necessary for correctness
- Watch for: trait proliferation beyond what's needed, `Arc<Mutex<>>` when simpler ownership works, complex macro systems when functions would suffice, over-engineering error types

### Elixir / Phoenix
- Pipe chains (`|>`) and pattern matching are core idioms, not complexity
- OTP patterns (GenServer, Supervisor) are justified when you need state or fault tolerance
- Watch for: GenServer when a simple module function works, umbrella apps for small projects, over-use of Behaviours with single implementations, Phoenix contexts that are just passthrough to Ecto

### Java / Kotlin
- Interface-based design is conventional — but single-implementation interfaces without test doubles are still speculative
- Spring/framework annotations are expected in Spring projects
- Watch for: AbstractFactoryBeanProvider patterns, deep inheritance trees, DTO explosion, layers of mapping between near-identical objects

### C / C++
- Manual resource management adds inherent complexity (RAII in C++ mitigates this)
- Template metaprogramming can be justified but has high cognitive cost
- Watch for: over-abstraction via virtual dispatch when static dispatch suffices, complex preprocessor macros when constexpr/templates work, unnecessary smart pointer nesting
