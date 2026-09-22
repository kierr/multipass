# Scraping Resilience Patterns

High-signal patterns for detecting scraper fragility and resilience gaps.

## Selector Brittleness Signals

| Pattern | Fragility Level |
|---------|-----------------|
| `div > div:nth-child(3) > span` | Extreme — position-dependent |
| `.x7r02dp` | Extreme — likely generated class |
| `[data-testid="price"]` | Low — semantic attribute |
| `//div[@class="product"]/span[2]` | High — position + class combo |
| `h1.product-title` | Medium — assumes hierarchy |
| Multiple fallback selectors | Low — defensive parsing |

### Warning Signs
- Single selector per target element
- No fallback parsing strategy
- Selectors more than 3 levels deep
- Reliance on generated or obfuscated class names
- Hardcoded text content matching
- Position-based indexing (`nth-child`, `[2]`)

## Fingerprint Inconsistency Signals

| Inconsistency | Detection Risk |
|---------------|----------------|
| User-Agent differs from TLS Client Hello | High — easy to detect |
| Screen size changes between requests | Medium — session correlation |
| Missing headers normal browsers send | Medium — header fingerprinting |
| Canvas/WebGL fingerprint varies | High — canvas fingerprinting |
| Timing patterns too regular | Medium — behavioral analysis |
| Navigator properties inconsistent | High — property cross-check |

### Warning Signs
- User-Agent rotation without matching TLS fingerprints
- Different workers sharing the same fingerprint
- Missing Accept-Language, Accept-Encoding, or other standard headers
- Perfect timing intervals between requests
- Headless browser flags exposed (`navigator.webdriver`)

## Proxy Pool Signals

| Pattern | Risk |
|---------|------|
| Round-robin without ban detection | Pool burns fast |
| No proxy health checking | Failures cascade |
| Fixed pool size, no elasticity | Exhaustion is inevitable |
| No backoff when pool depletes | Retry storms |
| Sticky sessions on dying proxies | Cascading failures |

### Warning Signs
- No visibility into current pool health
- Bans detected only by failure, not proactively
- All proxies treated equally regardless of quality
- No distinction between residential, datacenter, mobile
- No geographic targeting awareness

## Account/Session Lifecycle Signals

| Pattern | Risk |
|---------|------|
| Claim without timeout | Orphaned accounts |
| Release on error path missing | Pool leaks |
| Same session across workers | Concurrency corruption |
| No refresh before expiry | Mid-operation failures |
| Crash recovery missing | State drift |

### Warning Signs
- In-memory claim tracking only
- No atomicity between claim and use
- Session cookies with no refresh logic
- Auth tokens with hard expiry and no proactive refresh
- Distributed workers with shared account state but no coordination

## Captcha Coverage Signals

| Pattern | Risk |
|---------|------|
| No captcha detection | Total blind spot |
| Detection but no solving | Dead end |
| Single solver, no fallback | Single point of failure |
| Solve failures treated as fatal | No escalation path |
| Rate-limited solver, no queue | Backpressure ignored |

### Warning Signs
- Code assumes captcha will not appear
- Captcha handling is afterthought or commented out
- No distinction between different captcha types
- No budget or rate limit awareness for solving services
- Solving failures don't trigger proxy rotation or session change

## Graceful Degradation Signals

| Pattern | Resilience |
|---------|------------|
| Fail-fast on any missing field | Fragile |
| Partial extraction with warnings | Resilient |
| Retry distinguishes transient vs permanent | Smart |
| Circuit breaker on repeated failures | Adaptive |
| Fallback to alternative endpoints | Redundant |

### Warning Signs
- Single `try` block wrapping entire extraction
- No distinction between connection errors and parsing errors
- All failures trigger identical retry behavior
- No partial result output option
- Missing fields cause complete extraction failure
- No backoff strategy on repeated target errors

## Review Questions

1. If the target changes their DOM structure tomorrow, how much breaks?
2. If the target deploys anti-bot tomorrow, how long before detection?
3. If all current proxies are banned, what happens?
4. If a worker crashes mid-operation, is state recovered or leaked?
5. If captcha appears unexpectedly, is it detected or does extraction fail mysteriously?
6. Can the system produce useful partial results when pieces are missing?
