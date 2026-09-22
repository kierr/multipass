# Schema Review Pattern Catalog

Concrete signal patterns that indicate schema-level concerns.

## Index Coverage

### FK columns without indexes
```sql
-- FK exists but no index on child.parent_id
ALTER TABLE child ADD CONSTRAINT fk_parent FOREIGN KEY (parent_id) REFERENCES parent(id);
-- Missing: CREATE INDEX idx_child_parent_id ON child(parent_id);
```

**Signal:** Look for `FOREIGN KEY` constraints without corresponding `INDEX` on the referencing column.

### Tables with no indexes beyond PK
```sql
-- Table with only primary key, no supporting indexes
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,  -- queried, not indexed
  created_at TIMESTAMP       -- filtered/sorted, not indexed
);
```

**Signal:** Check `pg_stat_user_indexes` or equivalent for tables with `idx_scan = 0` on non-PK columns that appear in queries.

### Join tables missing composite indexes
```sql
-- Many-to-many with only single-column indexes
CREATE TABLE user_roles (
  user_id INTEGER REFERENCES users(id),
  role_id INTEGER REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);
-- Missing: CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
--          for queries starting from role side
```

**Signal:** Composite PKs where only the first column is useful for lookups from the "other side."

### JSONB columns queried without GIN indexes
```sql
-- JSONB column with frequent ->> queries
SELECT * FROM documents WHERE metadata->>'status' = 'active';
-- Missing: CREATE INDEX idx_documents_metadata ON documents USING GIN (metadata);
--          or GIN (metadata jsonb_path_ops) for containment queries
```

**Signal:** `->>` or `->` operators in WHERE clauses against JSONB columns without GIN index support.

## Constraint Coverage

### Phantom FKs (columns that should reference but don't)
```ruby
# Rails example: looks like FK, acts like FK, no FK constraint
belongs_to :organization  # organization_id column has no FK to organizations
```

**Signal:** `belongs_to` associations or `*_id` naming without corresponding `FOREIGN KEY` constraint.

### Cascade rules that risk data loss
```sql
-- Silent cascade delete
ALTER TABLE posts ADD CONSTRAINT fk_author
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
-- Deleting a user silently destroys all their posts
```

**Signal:** `ON DELETE CASCADE` on tables where data should be preserved or explicitly handled.

### Missing NOT NULL on required columns
```sql
-- Column is required in code but nullable in schema
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,  -- application requires this, but schema allows NULL
  status TEXT       -- validated in model, nullable in DB
);
```

**Signal:** Model validations or application logic that imply required fields without corresponding `NOT NULL` constraints.

### Unique constraints only in code
```ruby
# Rails: uniqueness validation without database constraint
validates :email, uniqueness: true
# Missing: add_index :users, :email, unique: true
```

**Signal:** Uniqueness validations in ORM models without corresponding unique index or constraint.

## Type and Normalization

### Wrong type for the data
```sql
-- Storing structured data as text
CREATE TABLE configs (
  settings TEXT  -- actually holds JSON, should be JSONB
);

-- Using string for numeric codes
CREATE TABLE products (
  sku TEXT  -- actually numeric codes, should be INTEGER or BIGINT
);
```

**Signal:** Text/varchar columns holding JSON, numeric data, or enum-like values that should use appropriate types.

### Timestamp without timezone
```sql
-- Timestamp that should be timezone-aware
CREATE TABLE events (
  occurred_at TIMESTAMP  -- should be TIMESTAMPTZ for global systems
);
```

**Signal:** `TIMESTAMP` without `WITH TIME ZONE` for applications with global users or cross-timezone requirements.

### Meaningless varchar limits
```sql
-- Arbitrary limits that don't match the data
CREATE TABLE users (
  name VARCHAR(255),   -- or VARCHAR(100), or VARCHAR(50) — why?
  email VARCHAR(255)   -- too short for some valid emails
);
```

**Signal:** `VARCHAR(n)` where `n` has no business meaning; consider `TEXT` or `VARCHAR` without limit.

### Over-normalization or under-normalization
```sql
-- Over: separate table for single optional field
CREATE TABLE user_bios (user_id INTEGER PRIMARY KEY, bio TEXT);

-- Under: repeated data that should be normalized
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT,   -- repeated, should reference customers
  customer_email TEXT   -- repeated, should reference customers
);
```

**Signal:** Tables with one non-PK column (over) or repeated non-key data across rows (under).

## Denormalization and Counters

### Counter cache drift
```ruby
# Rails counter cache that can get out of sync
belongs_to :category, counter_cache: true
# If increments happen outside normal callbacks, counts drift
```

**Signal:** Counter cache columns without reconciliation jobs or audit queries.

### Race conditions in denormalized values
```sql
-- Non-atomic counter update
UPDATE categories SET post_count = post_count + 1 WHERE id = 123;
-- Concurrent updates can lose counts without proper locking
```

**Signal:** Increment/decrement operations on denormalized columns without transaction isolation or optimistic locking.

### Stale precomputed values
```sql
-- Precomputed value that isn't updated when source changes
CREATE TABLE users (
  posts_count INTEGER,  -- updated by callbacks, can drift
  last_post_at TIMESTAMP  -- should update when posts are added/removed
);
```

**Signal:** Denormalized fields that depend on callbacks or triggers which can be bypassed.

## Migration Safety

### Locking table changes
```sql
-- Dangerous in production: locks the table
ALTER TABLE large_table ADD COLUMN new_column TEXT NOT NULL DEFAULT 'value';
-- Safe approach: add nullable, backfill, add constraint, add default
```

**Signal:** `ADD COLUMN ... NOT NULL ... DEFAULT` on large tables; operations that require full table rewrite.

### Irreversible migrations
```ruby
# Rails migration without down method
class RemoveLegacyColumns < ActiveRecord::Migration[7.0]
  def change
    remove_column :users, :legacy_field  # irreversible without explicit down
  end
end
```

**Signal:** `change` method with operations that `irreversible?` or migrations without `down` / `reversible` blocks.

### Adding constraints to existing data
```sql
-- Fails if existing rows violate constraint
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);
-- Safe approach: add NOT VALID, then VALIDATE in batches
```

**Signal:** Constraint additions without `NOT VALID` + `VALIDATE` pattern for large tables.

### Index creation without CONCURRENTLY
```sql
-- Blocks writes during index build
CREATE INDEX idx_users_email ON users(email);
-- Safe approach for production
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

**Signal:** Index creation in migrations without `CONCURRENTLY` (PostgreSQL) or equivalent non-blocking pattern.

## Audit and Compliance

### Missing change tracking
```ruby
# High-value table without PaperTrail
class FinancialTransaction < ApplicationRecord
  # No has_paper_trail — changes are not tracked
end
```

**Signal:** Tables with compliance sensitivity (financial, PII, permissions) without audit/versioning.

### Encryption gaps
```sql
-- Sensitive data stored in plaintext
CREATE TABLE users (
  ssn TEXT,           -- should be encrypted
  api_key TEXT,       -- should be encrypted
  credit_card TEXT    -- should be encrypted or tokenized
);
```

**Signal:** Columns holding secrets, credentials, PII, or regulated data without encryption at rest.

### Missing soft delete for audit trails
```sql
-- Hard delete removes audit evidence
DELETE FROM audit_logs WHERE created_at < '2023-01-01';
-- Consider: paranoia/discard, archive tables, or retention policies
```

**Signal:** Hard deletes on tables where removal should be reversible or auditable.

## Query Path Signals

### Queries that will scan
```sql
-- Query that can't use available indexes
SELECT * FROM events WHERE DATE(created_at) = '2024-01-15';
-- Function on column prevents index use
-- Safer: created_at >= '2024-01-15' AND created_at < '2024-01-16'
```

**Signal:** Functions applied to indexed columns in WHERE clauses, preventing index usage.

### Implicit type coercion in queries
```sql
-- String comparison on integer column
SELECT * FROM products WHERE sku = '12345';  -- sku is INTEGER
-- Planner may not use index due to type mismatch
```

**Signal:** Query parameters with types that don't match column types, causing implicit coercion.

### Select N+1 enabled by schema
```ruby
# Schema doesn't support efficient batching
posts.each { |p| p.author.name }  # N queries
# Missing: consider includes/preload or denormalized author_name
```

**Signal:** Association traversal patterns in code that would benefit from schema-level batching support.
