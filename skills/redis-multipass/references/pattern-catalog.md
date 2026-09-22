# Redis Pattern Catalog

High-signal patterns that indicate Redis-specific risks.

## Lua Script Hazards

| Pattern | Risk | Signal |
|---------|------|--------|
| `redis.call('KEYS', ...)` | O(N) blocking scan | World stops while keys are scanned |
| Unbounded `for` loops in Lua | Event loop hostage | Any loop over keys without limit |
| Large sorted set operations in Lua | Atomic but expensive | ZRANGE with large range inside script |
| `redis.call('SCAN', ...)` in Lua | Complex iteration | SCAN state management is tricky |
| Script without `script load` | Re-parsed every call | eval vs evalsha distinction |

## Key Schema Collision Patterns

| Pattern | Collision Risk |
|---------|---------------|
| `user:{id}:data` and `user:{id}data` | Missing delimiter |
| `env:tenant:key` with similar prefixes | `prod:acme:settings` vs `prod:acme-co:settings` |
| Auto-generated keys without namespace | Two features pick same format |
| Timestamp-based keys without precision | `cache:2024-01-01` collision |
| Hash tags in cluster `{tag}` | Hot partition if tags collide |

## Memory-Unbounded Structures

| Structure | Growth Pattern | Risk Signal |
|-----------|---------------|-------------|
| Lists with `LPUSH`/`RPUSH` only | Append-only forever | No `LTRIM` or bounds check |
| Sets with `SADD` only | Unique values forever | No cardinality limit |
| Sorted sets for leaderboards | Grow with user base | No periodic truncation |
| Streams with `XADD` only | Append-only log | No `XTRIM` or maxlen |
| Hash fields without cleanup | Fields added never removed | Growing field count |

## TTL Hygiene Gaps

| Gap | Signal |
|-----|--------|
| Set operations without EX/PX | `SET key value` without expiration |
| Error paths that create keys | Try/catch where catch creates without TTL |
| Batch jobs with partial TTL | Some keys in batch lack expiration |
| Session keys with infinite TTL | TTL set to very large value |
| Cache-aside with TTL on miss only | TTL set when populating, not on create |

## Connection Pool Sizing

| Mismatch | Symptom |
|----------|---------|
| Pool size = thread count in async runtime | Connection starvation under load |
| Pool much larger than CPU cores | Idle connections burning memory |
| No connection timeout configured | Infinite wait on pool exhaustion |
| Retry without backoff on connection fail | Thundering herd on recovery |
| Single connection for high-throughput | Bottleneck on single socket |

## Probabilistic Structure Misuse

| Structure | Capacity Risk |
|-----------|---------------|
| Bloom filter near capacity | False positive rate spikes |
| Cuckoo filter at capacity | Inserts start failing |
| HyperLogLog for exact counts | Wrong abstraction |
| Count-Min Sketch with wrong width | Over-estimation errors |

## Command-Specific Hazards

| Command | Scale Behavior |
|---------|---------------|
| `KEYS *` | O(N) scan, blocks everything |
| `HGETALL` on large hash | O(N) memory allocation |
| `SMEMBERS` on large set | O(N) memory allocation |
| `ZRANGE 0 -1` on large zset | O(N) memory and network |
| `LRANGE 0 -1` on large list | O(N) memory and network |
| `SORT` without `STORE` | O(N+M log M) CPU and memory |
| `SINTER`/`SUNION` on large sets | O(N*M) complexity |

## Sorted Set Scan Complexity

| Operation | Complexity | Scale Risk |
|-----------|------------|------------|
| `ZRANGE start stop` | O(log N + M) | M matters more than N |
| `ZREVRANGE` on entire set | O(log N + M) | Full-range is expensive |
| `ZRANGEBYSCORE` unbounded | O(log N + M) | M can be entire set |
| `ZSCAN` | O(1) per call | Safe but slow for full scan |
| `ZREMRANGEBYRANK` | O(log N + M) | Good for trimming |

## Pipeline and Transaction Patterns

| Pattern | Risk |
|---------|------|
| Very large pipelines | Memory buffer bloat |
| `WATCH` + long transaction | Contention and retries |
| `MULTI`/`EXEC` without error handling | Silent failures |
| Pipeline without response handling | Lost error information |
