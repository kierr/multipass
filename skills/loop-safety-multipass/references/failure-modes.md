# Failure Modes

## Common runaway patterns

- Inner loop has a cap, outer scheduler recreates it forever.
- Retry counter only covers failures, while clean exits still redrive unchanged work.
- Poller uses "still active" as a continuation signal without requiring fresh input.
- Queue lease expires or claim is released before the item is meaningfully progressed.
- Human approval or hold state exists, but another code path resumes automatically.
- Expensive model or API calls have no money, token, or session budget.
- Logs mention repeated attempts, but no code path halts on repeated non-progress.

## Review questions

1. What exact event makes the next iteration legitimate?
2. What exact event makes future redispatch illegitimate?
3. Which counters are hard stops, and which are just metadata?
4. Can the same unchanged input be selected again after a clean exit?
5. What stops the system after repeated non-progress at 2 a.m. with no human present?
