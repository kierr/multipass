# Test Review Signals

Detailed reference material for test-review. Load when needed, not by default.

## Test Layer Heuristics

- Unit tests should cover business logic, branching, data shaping, and error handling without network, filesystem, clock, or scheduler dependence unless those dependencies are explicitly controlled.
- Integration tests should exercise real collaboration between in-process modules and controlled local dependencies such as a test database, queue emulator, or local filesystem, while replacing consumed external services with stable test doubles.
- Contract tests should verify the request or event shape expected by consumed services and the parsing or validation of their responses without relying on broad end-to-end flows.
- System, smoke, or end-to-end tests may touch real external systems, but only for a narrow set of high-value paths with explicit tagging, ownership, and operational limits.
- If a test touches a live external dependency, review whether it belongs in a quarantined or separately scheduled suite instead of the main integration lane.

## Risk Coverage Prompts

- Check whether meaningful validation, error handling, timeout, and retry paths are covered at the right layer.
- Look for missing coverage around auth, permissions, boundary values, null or malformed input, and partial failure recovery.
- For async or distributed flows, check idempotency, duplicate events, replay handling, ordering, and eventual consistency behavior.
- For list or query surfaces, check pagination, sorting, and filtering behavior when those outcomes matter to users or downstream systems.
- For migrations or compatibility-sensitive changes, check backward-compatibility, parsing of old shapes, and rollout safety where relevant.

## Confidence Signals

- Important behaviors are covered at the cheapest layer that still verifies the risk
- Test layers have distinct responsibilities instead of repeating the same behavior through slower stacks
- Assertions validate externally meaningful outcomes, not incidental internals
- Negative paths and edge cases are covered where the risk justifies them
- Test names and structure make the scenario and expected outcome obvious on a quick scan
- Fixtures are minimal, realistic, and stable
- Helpers or shared setup reduce noise without hiding the decisive behavior under test
- Tests isolate side effects and clean up state
- Integration tests keep consumed third-party services behind mocks, stubs, fakes, or local simulators
- API-dependent tests control or limit parallelism when shared state, quotas, callbacks, or eventual consistency could race
- Live external coverage is sparse, intentional, and clearly separated from the main fast-feedback suite
- Coverage gates reinforce the intended behavior instead of merely inflating percentages
- Failure output explains what broke and where

## Common Risks

- High line coverage but weak protection for critical behaviors or failure paths
- Unit tests that over-mock boundaries and miss wiring failures
- Integration tests that hit live third-party, SaaS, or shared staging services and fail on rate limits, latency, data drift, or credentials
- Missing integration or system coverage for cross-boundary flows that matter
- Slow or brittle system tests covering logic that should live in faster unit or integration tests
- Integration tests that mock internal collaborators instead of isolating only the true external boundary
- Coverage thresholds that can pass through broad excludes, generated-file filters, or loopholes in untouched hotspots
- Pre-commit or pre-push hooks that are disabled, bypassed, or too slow to stay enabled
- Snapshot-only, truthy-only, or implementation-coupled assertions for complex behavior
- Missing assertions after setup and action steps
- Time, randomness, network, or concurrency dependence without control
- Helper stacks, giant fixtures, or opaque parametrization that make it hard to see what behavior is actually being proven
- Parallel tests racing on shared tenants, queues, callbacks, webhook sinks, or globally seeded data
- API tests depending on retry loops, sleeps, or unordered async completion instead of explicit synchronization
- Flaky retries masking real nondeterminism
- Large shared fixtures causing accidental coupling
- New source files without corresponding test files (check the project's test-file naming convention)
- Deleted tests where the tested code still exists
- Coverage enforcement suppressions (`rubocop:disable RequireTestForNewFiles`, `istanbul ignore`, `# noqa`) masking missing coverage
- Test files importing removed modules or referencing deleted methods, classes, or endpoints
