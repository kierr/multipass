# Data Pipeline Review: Pattern Catalog

Concrete signal patterns for data pipeline review. Use these as recognition heuristics, not exhaustive checklists.

## Partial Pipeline Success

### Orphaned Commit
```ruby
# Producer commits to DB, then enqueues job. If enqueue fails, DB state is orphaned.
UserRecord.create!(user_params)
# Crash here: user exists but welcome email never sends
WelcomeEmailJob.perform_async(user.id)
```

### Missing Transaction Boundary
```ruby
# DB write and Kafka produce are not atomic. Either can fail independently.
UserRecord.create!(user_params)
# Crash here: DB has user, Kafka never receives event
kafka_producer.produce(user_event, topic: "users")
```

### Offset Commit Before Processing
```ruby
# Consumer commits offset before processing completes. Crash = message lost.
consumer.each_message do |message|
  consumer.commit # Too early!
  process(message) # Crash here = message never retried
end
```

### Process-Then-Ack Gap
```ruby
# Processing succeeds, ack fails. Message will be redelivered = duplicate processing.
result = transform(message)
write_to_db(result)
# Crash here = message redelivered, transform runs again
channel.ack(message.delivery_tag)
```

## Stage Contract Drift

### Schema Assumption Mismatch
```ruby
# Producer adds optional field. Consumer requires it.
# Producer (v2):
event = { user_id: 123, email: "a@b.c", tier: "premium" } # tier added

# Consumer (v1):
def process(event)
  raise "missing tier" unless event[:tier] # Explodes on old events
end
```

### Header Convention Divergence
```ruby
# Producer uses camelCase headers, consumer expects snake_case
producer.publish(event, headers: { correlationId: "123" })

consumer.subscribe do |message|
  trace_id = message.headers["correlation_id"] # nil - wrong convention
end
```

### Partition Key Inconsistency
```ruby
# Order depends on partition key. Producer and consumer disagree on key.
producer.produce(event, partition_key: event[:user_id]) # user_id
# Consumer assumes ordering by event[:order_id] within partition
```

## DLQ and Retry Chain Risks

### DLQ Without Consumer
```ruby
# Messages go to DLQ but nothing reads from it. Silent accumulation.
queue_with_dlq = Queue.new(dlq: "failed-jobs")
# No consumer subscribed to "failed-jobs"
```

### DLQ Retry Loop
```ruby
# DLQ consumer re-enqueues to original queue. Poison message loops forever.
dlq_consumer.subscribe do |message|
  OriginalQueue.push(message) # Same message, same failure, forever
end
```

### Retry Logic Divergence
```ruby
# Original path validates, retry path does not.
def process(message)
  validate!(message) # Skipped in retry path?
  transform(message)
end

def retry_from_dlq(message)
  transform(message) # Validation skipped on retry!
end
```

## Dedup and Idempotency Gaps

### Missing Dedup Key
```ruby
# No idempotency key on operations that could be retried.
def process_payment(message)
  Payment.charge(message[:amount]) # Duplicate charges on redelivery
end

# Should be:
def process_payment(message)
  return if Payment.exists?(idempotency_key: message[:idempotency_key])
  Payment.charge(message[:amount], idempotency_key: message[:idempotency_key])
end
```

### Dedup Key Collision
```ruby
# Dedup key uses mutable field that changes on retry.
def idempotency_key(event)
  "#{event[:user_id]}-#{event[:timestamp]}" # Timestamp changes on retry!
end

# Should use stable identifier:
def idempotency_key(event)
  event[:message_id] || event[:correlation_id]
end
```

### Race in Idempotency Check
```ruby
# Check-then-act race condition.
unless ProcessedMessage.exists?(message_id)
  # Concurrent request passes same check
  process(message)
  ProcessedMessage.create!(message_id: message[:id])
end
```

## Header and Metadata Propagation

### Correlation ID Loss
```ruby
# Correlation ID dropped at stage boundary.
def stage_one(message)
  result = transform(message)
  { data: result } # Original headers lost
end

# Should preserve:
def stage_one(message)
  result = transform(message)
  { data: result, **message.slice(:correlation_id, :trace_id, :source) }
end
```

### Schema Version Drop
```ruby
# Consumer cannot detect schema version because producer doesn't include it.
producer.produce(event) # No schema version

consumer.subscribe do |message|
  # How does consumer know which schema to use?
  deserialize(message)
end
```

## Dead Letter Accumulation

### Unbounded DLQ Growth
```ruby
# DLQ has no size limit or consumer. Messages accumulate forever.
queue = Queue.new(
  dlq: "failed-jobs",
  max_size: 1000,
  # DLQ has no max_size
)
```

### DLQ Consumer Lag
```ruby
# DLQ consumer is slower than failure rate. Backlog grows.
# Original queue: 1000 msg/s
# Failure rate: 1% = 10 msg/s to DLQ
# DLQ consumer: 1 msg/s
# Result: 9 msg/s accumulation
```

## Exactly-Once Theater

### Claim Without Implementation
```ruby
# Documentation claims exactly-once, but implementation is at-least-once.
# "This processor guarantees exactly-once semantics"
def process(message)
  write_to_db(message) # Can be called multiple times on retry
end
```

### Idempotency Gap in Transaction
```ruby
# Transaction includes idempotency check, but check is not part of atomic operation.
return if processed?(message.id) # Check outside transaction

DB.transaction do
  write_to_db(message)
  mark_processed(message.id) # Crash before this = duplicate on retry
end
```

## Ordering Violations

### Partition Collision
```ruby
# Multiple entity types share partition key, violating per-entity ordering.
producer.produce(user_event, partition_key: "tenant-#{tenant_id}")
producer.produce(order_event, partition_key: "tenant-#{tenant_id}")
# User events and order events interleaved - order-dependent logic breaks
```

### Retry Reordering
```ruby
# Message 1 fails, message 2 succeeds. Message 1 retries after message 2.
# If processing order matters, retry breaks the invariant.
messages = [msg1, msg2] # msg1 fails, msg2 succeeds
# Later: msg1 retries and processes after msg2
```
