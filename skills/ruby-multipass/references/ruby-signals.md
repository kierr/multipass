# Ruby Signals Reference

Deeper analysis of Ruby and Rails anti-patterns, idioms, and correctness signals. Consult this when a finding is ambiguous or when the codebase uses patterns you haven't seen before.

## Table of Contents

1. [Nil Safety](#nil-safety)
2. [ActiveRecord Traps](#activerecord-traps)
3. [Mutability and Frozen State](#mutability-and-frozen-state)
4. [Exception Handling](#exception-handling)
5. [Sorbet Type Safety](#sorbet-type-safety)
6. [Callbacks and Concerns](#callbacks-and-concerns)
7. [Concurrency](#concurrency)
8. [Idiomatic Ruby](#idiomatic-ruby)
9. [Service Object Patterns](#service-object-patterns)
10. [Sidekiq and Job Safety](#sidekiq-and-job-safety)
11. [Gem and Dependency Issues](#gem-and-dependency-issues)

---

## Nil Safety

Ruby returns nil implicitly from methods that fall through, from `find_by` when nothing matches, and from hash lookups with missing keys. This is by design — Ruby trusts the programmer. But chains of method calls on nil produce `NoMethodError` in places far from the root cause.

### High-Risk Patterns

**Unsafe chained calls:**
```ruby
user.account.subscription.plan.name
```
If any link is nil, the error fires at a different line than where the nil originated. Safe navigation (`&.`) prevents the crash but may mask missing data.

**`find_by` without nil check:**
```ruby
user = User.find_by(email: params[:email])
user.send_welcome_email  # NoMethodError if not found
```
`find_by` returns nil when nothing matches — this is different from `find!` which raises `ActiveRecord::RecordNotFound`.

**Implicit nil returns:**
```ruby
def status
  return :active if active?
  return :pending if pending?
  # falls through to nil — is this intentional?
end
```

**Hash default confusion:**
```ruby
hash = {}
hash[:missing]  # nil — fine if expected, crash if chained
hash.fetch(:missing)  # raises KeyError — safer when nil is a bug
hash = Hash.new(0)
hash[:count]  # 0 — but `hash[:missing_key]` also returns 0, which may hide bugs
```

### When Nil Checks Are Overkill

- Guard clauses that exit early (`return if thing.nil?`)
- Safe navigation on optional associations (`user&.profile&.avatar_url`)
- `||=` for memoization where nil is the "not yet computed" signal

---

## ActiveRecord Traps

ActiveRecord's expressiveness hides several categories of bugs that only surface at runtime.

### N+1 Queries

The classic — iterating over a collection and accessing an association on each element. Each access fires a separate query.

```ruby
# N+1: one query per user for their account
users.each { |u| u.account.name }

# Fixed: one query with a JOIN
users.includes(:account).each { |u| u.account.name }
```

**Detection:** Look for `each` or `map` blocks that access associations not in the current scope's `includes`. Also check views that render associations in loops.

**Nuance:** `includes` may choose between a JOIN strategy and a separate-query strategy. `eager_load` forces a JOIN; `preload` forces separate queries. When the association has conditions or ordering, the choice matters.

### Silent Validation Failures

```ruby
user.save  # returns false, doesn't raise — the save failed but execution continues
user.update(name: "Alice")  # same — returns false on validation failure
```

Use `save!` and `update!` when a failed save is a bug rather than an expected condition. Use `save` only when failure is a normal outcome you explicitly handle.

### Skipped Callbacks and Validations

```ruby
User.update_all(status: :active)  # skips validations, callbacks, and updated_at
User.update_columns(name: "Bob")  # skips everything including touched timestamps
user.increment!(:login_count)  # skips validations
user.touch  # triggers only after_touch callback
```

These are appropriate for administrative/batch operations where the data is known-good. They're bugs when used to bypass validations that should be enforced.

### Transaction Gaps

```ruby
# Bug: if order creation fails, user balance was already deducted
user.update!(balance: user.balance - amount)
Order.create!(user: user, amount: amount)

# Fixed: both succeed or both roll back
ActiveRecord::Base.transaction do
  user.update!(balance: user.balance - amount)
  Order.create!(user: user, amount: amount)
end
```

### Counter Cache Drift

Counter caches can drift from actual counts due to race conditions, direct SQL, or callback skips.

```ruby
# Check for drift
User.where.not(posts_count: User.joins(:posts).group(:id).count)
```

---

## Mutability and Frozen State

### Mutable Default Arguments

This is one of Ruby's most documented footguns and it still catches people.

```ruby
def append(item, list = [])
  list << item
end

append("a")  # ["a"]
append("b")  # ["a", "b"] — the same array is reused across calls
```

The fix is `list = []` in the method body, or `nil` as default with `list ||= []`.

### Frozen String Literal

When `# frozen_string_literal: true` is set, string literals are frozen. Mutation methods (`<<`, `gsub!`, `strip!`, `sub!`, `downcase!`) will raise `FrozenError`.

```ruby
# frozen_string_literal: true

name = "Alice"
name << " Smith"  # FrozenError — use name + " Smith" instead
```

**Consistency matters:** Files in the same project should use the pragma consistently. Mixed mode (some files frozen, some not) creates subtle bugs when passing strings between files.

### Unfrozen Constants

```ruby
COLORS = ["red", "green", "blue"]  # mutable array
COLORS << "yellow"  # works, mutates the constant silently

COLORS = ["red", "green", "blue"].freeze  # properly frozen
```

Always freeze constants that hold mutable objects. This includes arrays, hashes, and nested structures.

---

## Exception Handling

### Broad Rescue

```ruby
begin
  do_something
rescue StandardError => e
  # catches everything except SignalException, SystemExit, NoMemoryError
  # this silently swallows:
  # - SyntaxError (should crash)
  # - ScriptError (should crash)
  # - any unexpected bug (hides it)
  nil
end
```

Prefer rescuing specific exception classes. If you must rescue broadly, at minimum log the error with its class, message, and backtrace.

### Swallowed Exceptions

```ruby
rescue => e
  # no logging, no tracking, no re-raise — the error vanishes
end
```

This is sometimes correct (e.g., retrying an idempotent operation where failure is expected). When it's not intentional, it makes debugging impossible.

### Ensure Masking

```ruby
begin
  do_work
rescue SomeError => e
  raise CustomError, "wrapper"
ensure
  cleanup!  # if cleanup! raises, the CustomError from rescue is lost
end
```

Ensure blocks should not raise. If cleanup can fail, catch and log within the ensure block.

### Exception Hierarchy

Custom exceptions should inherit from `StandardError` (for application errors) or a domain-specific subclass, never from `Exception` directly.

```ruby
class PaymentError < StandardError; end        # correct
class PaymentError < Exception; end             # wrong — catches system errors
```

---

## Sorbet Type Safety

### Sigil Accuracy

The `# typed:` comment declares how strict type checking is for that file. When the sigil claims more safety than the file provides, it's misleading.

| Sigil | Meaning | Common mismatch |
|-------|---------|----------------|
| `typed: false` | No checking | Often on files that *do* have `sig` blocks — misleading |
| `typed: true` | Partial checking | With heavy `T.untyped` usage — effectively untyped |
| `typed: strict` | All methods need `sig` | Missing `sig` on private methods — still passes but incomplete |
| `typed: strong` | No `T.untyped` | Almost never actually achieved in Rails codebases |

### T.untyped Overuse

`T.untyped` opts out of type checking. It's appropriate at external boundaries (JSON parsing, third-party APIs, complex generics) but becomes a problem when used for internal logic where types are knowable.

```ruby
sig { returns(T.untyped) }  # what does this return? why don't we know?
def calculate_score(record)
  # ...
end
```

### T.must and T.cast Misuse

```ruby
T.must(might_be_nil)  # "trust me, it's not nil" — are you sure?
T.cast(thing, SomeClass)  # "trust me, it's this type" — verify at runtime?
```

These are escape hatches. They're fine when backed by a genuine invariant (e.g., `T.must(params[:id])` after a presence validation). They're problematic when used to silence warnings without actual knowledge.

### Missing `sig` on Public Methods

Public methods without `sig` are invisible to Sorbet. In `typed: strict` files, this is a hard error. In `typed: true`, it's silently accepted — the method has no type contract.

---

## Callbacks and Concerns

### Ordering Dependencies

```ruby
class User < ApplicationRecord
  before_create :set_uuid        # runs first
  before_create :assign_role     # runs second — does it depend on set_uuid?
  after_create :send_welcome     # runs after create — does it need the role?
end
```

Callbacks that depend on each other's side effects create fragile ordering. When the order matters, document it. When the dependency is complex, extract a service object instead.

### Silent Failures in before_* Callbacks

```ruby
before_destroy :check_outstanding_orders

def check_outstanding_orders
  # returning false or nil does NOT halt the chain in Rails 7+
  # must throw :abort to prevent destruction
end
```

In Rails 7+, `before_*` callbacks must `throw :abort` to halt the action. Returning `false` no longer works.

### Concern Methods Conflicting with Host

```ruby
module Timestampable
  extend ActiveSupport::Concern

  included do
    def created_at_display
      # what if the host class already defines this?
    end
  end
end
```

Concerns that define methods on the host class can silently override existing methods. Prefer `class_methods` blocks and documented method names.

---

## Concurrency

### Shared Mutable State in Jobs

```ruby
class ProcessBatchJob
  @counter = 0  # shared across all job instances in the same process

  def perform(items)
    @counter += items.count  # not thread-safe
  end
end
```

Sidekiq runs multiple threads. Class-level instance variables are shared across all job instances in the same process.

### Non-Atomic Redis Operations

```ruby
count = redis.get("counter").to_i
redis.set("counter", count + 1)
# another thread can read and write between get and set

# Fixed with atomic increment
redis.incr("counter")
```

### Thread-Unsafe Patterns

- `@@class_variables` shared across threads
- `$global_variables` without synchronization
- `Concurrent::Map` used without understanding its memory model
- `Mutex` that's not covering the full critical section

---

## Idiomatic Ruby

### Metaprogramming — When It's Worth It

Metaprogramming (`define_method`, `method_missing`, `class_eval`) is idiomatic Ruby but should earn its place:

- **Worth it:** Reducing boilerplate across many similar definitions (e.g., `define_method` for 10 similar scopes), DSL construction, plugin systems
- **Not worth it:** Avoiding a simple method definition, hiding logic that would be clearer as regular code, making one-off dynamic calls

### method_missing Without respond_to_missing?

```ruby
def method_missing(name, *args)
  # this breaks `respond_to?(:the_method)` — always define respond_to_missing?
end
```

### Enumerable Method Choice

Ruby's Enumerable provides methods that communicate intent. Choosing the right one makes code self-documenting:

| Use | Instead of |
|-----|-----------|
| `any?` | `map { }.any?` or `select { }.any?` |
| `none?` | `!any?` when it reads better |
| `find` | `select { }.first` when you need one |
| `each_with_object` | `reduce` with memo mutation |
| `flat_map` | `map { }.flatten(1)` |
| `count { }` | `select { }.size` |
| `transform_values` | `map { \|k, v\| [k, transform(v)] }.to_h` |

### String Interpolation vs Format

```ruby
"Hello #{name}"           # simpler for 1-2 interpolations
format("Hello %s", name)  # clearer for complex formatting or i18n
```

---

## Service Object Patterns

### ApplicationService Pattern

Rails projects commonly use service objects to encapsulate business logic. The pattern has known failure modes:

**God services** — Services that handle too many responsibilities. If a service has 20+ private methods and multiple conditional branches, it's probably doing too much. Extract collaborators.

**Side effects in constructors** — `initialize` should set up state, not perform work. Call `perform` or `call` explicitly.

**Mutable arguments** — Modifying arguments in-place makes the service's effects invisible to the caller. Return new values or use result objects.

**Exception for control flow** — Raising exceptions for expected business outcomes (e.g., "payment declined") instead of returning a result object. Exceptions are for exceptional conditions; result objects (Success/Failure, ServiceResult) are for expected outcomes.

### Result Object Patterns

```ruby
# Dry::Monads style
Success(user)
Failure(:not_found)

# Custom ServiceResult style
ServiceResult.new(success: true, data: user)
ServiceResult.new(success: false, error: "Not found")
```

Both are valid. Consistency within a project matters more than which pattern is chosen.

---

## Sidekiq and Job Safety

### Job Design

- Jobs should be **idempotent** — running them twice should produce the same result as running once
- Jobs should be **atomic** — either the whole job succeeds or the whole job fails, no partial state
- Jobs should be **small** — one job per unit of work, not a batch job that does everything

### Retry Safety

```ruby
sidekiq_options retry: 5

# Is this job safe to retry?
# - Does it send emails? (duplicate emails)
# - Does it charge credit cards? (double charges)
# - Does it create records? (duplicate records without unique constraints)
```

Jobs that aren't safe to retry need unique constraints, idempotency keys, or deduplication logic.

### Worker State

Sidekiq workers are reused. Instance variables set in one job execution persist to the next if not cleaned up.

```ruby
def perform(data)
  @data = data  # this persists to the next job invocation in the same worker
end

# Instead: use local variables
def perform(data)
  process(data)  # pass data as arguments, not instance variables
end
```

---

## Gem and Dependency Issues

### Version Pin Documentation

When a gem is pinned to a specific version, the reason should be documented:

```ruby
# vite_ruby pinned to 3.9.2 — 3.10.0 is incompatible with Vite npm 8.x (autoBuild SIGABRT)
gem "vite_ruby", "3.9.2"
```

### Vendored Gems

Vendored gems (via `path:` or `git:` sources) don't receive automatic updates. When the upstream releases a security patch, the vendored copy must be updated manually. This is easy to forget.

### Deprecated APIs

Check gem changelogs for deprecated methods still in use. RuboCop extensions (rubocop-rails, rubocop-performance) may catch some, but gem-specific deprecations often fly under the radar.

### Monkey-Patching

Gems that monkey-patch core classes (ActiveSupport, especially) can create surprising behavior. When reviewing code that relies on monkey-patched methods, verify the behavior matches the gem's documentation, not Ruby's standard documentation.
