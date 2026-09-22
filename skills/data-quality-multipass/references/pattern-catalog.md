# Data Quality Signals

High-signal patterns that indicate entity data quality drift.

## Counter Cache Drift

| Signal | Root Cause |
|--------|------------|
| `comments_count != COUNT(comments WHERE post_id=?)` | Counter bypassed via direct SQL, soft-delete, or batch import |
| Counter decremented but never incremented | Race condition in creation hook |
| Counter incremented but never decremented | Delete bypassed model callbacks |
| Negative counter values | Deletion without existence check |
| Counter unchanged after bulk operation | Bulk import skipped callbacks |
| Counter updated in wrong direction | `counter_cache` set on wrong association side |

**Common bypass paths:**
- `update_all`, `delete_all` in Rails
- Raw SQL via `connection.execute`
- Bulk import tools (activerecord-import, upsert gems)
- Soft-delete gems that override destroy
- Background jobs that update associated records

## Confidence Score Issues

| Signal | Root Cause |
|--------|------------|
| Score decreases on re-evaluation with same input | Non-monotonic scoring logic |
| Score above 1.0 or below 0.0 | Missing bounds check |
| Identical inputs produce different scores | Non-deterministic ensemble or timing-dependent logic |
| Scores cluster at extremes (0.0 or 1.0) | Threshold hardcoded for different data scale |
| High confidence on low-evidence entities | Calibration drift from training data distribution shift |
| Confidence doesn't correlate with accuracy | Score is proxy for "seen before" not actual certainty |

**Monotonicity violation patterns:**
- Scores that average in new evidence without weighting
- Ensembles that can be swayed by a single low-quality signal
- Time-decay that reduces score even with no contradictory evidence

## Normalization Failures

| Signal | Root Cause |
|--------|------------|
| `normalize(x) != normalize(normalize(x))` | Non-idempotent transformation |
| Same entity with multiple normalized forms | Locale-dependent case folding |
| `foo ` and `foo` coexist | Inconsistent whitespace trimming |
| Visual duplicates survive deduplication | Unicode normalization form mismatch |
| Search misses obvious matches | Index and query use different normalizers |
| Normalized form longer than input | Unicode expansion (NFD) without re-composition |

**Idempotency check pattern:**
```python
def is_idempotent(normalize_fn, value):
    once = normalize_fn(value)
    twice = normalize_fn(once)
    return once == twice
```

**Common non-idempotent operations:**
- Regex replacements that can match their own output
- Trimming that only removes from one end
- Case folding that's locale-dependent (Turkish `I`/`i`)
- Unicode normalization without specifying form

## Source Attribution Gaps

| Signal | Root Cause |
|--------|------------|
| `source_id` references non-existent external system | Source decommissioned without migration |
| Provenance chain ends at internal job with no input | Backfill overwrote original provenance |
| `created_by` references deleted user | User deletion cascade |
| Enrichment overwrites `source` field | Job doesn't preserve original attribution |
| Multiple entities with same external ID, different sources | ID collision across systems |

**Dead-end patterns:**
- `source: 'manual_entry'` for bulk-imported data
- `source: 'api_v1'` for data imported after v1 deprecation
- `source_id` as free-text field without validation

## Stale Enrichment

| Signal | Root Cause |
|--------|------------|
| `enriched_at` older than `updated_at` | Entity updated without re-enrichment |
| Enrichment fields are null for recent records | Job failing silently |
| External API lookups return 404s | External service deprecated endpoint |
| Computed fields based on outdated assumptions | Business logic changed, historical data not recomputed |
| Denormalized field inconsistent with source | Partial update succeeded in one table, failed in another |

**Enrichment job failure modes:**
- Network timeouts treated as "no data available"
- Rate limiting that causes partial processing
- Silent failures in background workers
- Schema drift between job expectations and reality

## Index vs Database Drift

| Signal | Root Cause |
|--------|------------|
| Search returns deleted records | Delete not propagated to index |
| Search misses recent records | Create/update not propagated to index |
| Search results have stale data | Update not propagated to index |
| Count differs between DB and index | Background sync queue backed up |
| Facet counts don't match reality | Index not refreshed after bulk change |

**Sync failure patterns:**
- Callback that queues job, but job silently fails
- Index update in transaction that later rolls back
- Network partition between app and search service
- Index mapping change without reindex
