# Error Handling Signal Patterns

High-signal patterns that indicate error handling design issues.

## Swallowed Signal Patterns

| Pattern | Why It Matters |
|---------|---------------|
| `catch` / `rescue` with no re-raise or log | Error black hole - failure disappears |
| `catch (Exception e) {}` | Broad catch, no action - classic swallowing |
| `rescue => e; end` (Ruby) | Bare rescue, no handling |
| `try { ... } catch { }` | Empty catch block - nothing preserved |
| `.catch(() => {})` | Promise rejection silently dropped |
| `onerror = () => {}` | Global error handler that does nothing |
| `rescue StandardError` on internal logic | Masks NoMethodError, TypeError, NameError — programming bugs hidden |
| `catch (Exception e)` wrapping business logic | Catches NullPointerException, ClassCastException alongside operational errors |
| `except Exception:` on non-IO code (Python) | Hides AttributeError, TypeError, NameError, KeyError |

## Context Erasure Patterns

| Pattern | What's Lost |
|---------|-------------|
| `catch(e) { throw new Error("Failed") }` | Original message and stack trace |
| `rescue => e; raise "Something went wrong"` | Exception type and backtrace |
| `.catch(e => Promise.reject("Error"))` | Original error object |
| `return { error: "unknown" }` | All context about what failed |
| `console.log(e); return null` | Error logged but caller gets no signal |

## Shape Drift Patterns

| Inconsistency | Impact |
|---------------|--------|
| Module A throws, Module B returns `null`, Module C returns `{error: ...}` | Callers cannot handle uniformly |
| `{success, data}` vs `{error, message}` vs `Result<T, E>` | No contract for error state |
| HTTP: sometimes 500, sometimes 200 with error body | Clients cannot parse consistently |
| `return false` on error with no error info | Caller cannot report what went wrong |
| Mixed promise rejection and error return | Async error handling fragmentation |

## Retry Blindness Patterns

| Pattern | The Problem |
|---------|-------------|
| Retry on all exceptions | Permanent errors retried forever |
| No max retry count | Infinite loops on persistent failures |
| Fixed delay without jitter | Thundering herd on recovery |
| Retry configuration missing error types | Thrown errors never match retry list |
| No distinction: network error vs validation error | Wasted retries on user errors |

### Error Classification Reference

| Category | Examples | Action |
|----------|----------|--------|
| **Retryable** | Network timeout, rate limit, service unavailable | Retry with backoff |
| **Fatal** | Database connection lost, out of memory | Fail fast, alert |
| **User Error** | Validation failure, auth error, not found | Surface immediately |
| **Transient** | Lock contention, temporary resource exhaustion | Brief retry, then fail |

## User-Facing Opacity Patterns

| Pattern | Better Alternative |
|---------|-------------------|
| `"An error occurred"` | `"Could not save document: disk full"` |
| `"Operation failed"` | `"Payment declined: card expired"` |
| `"Something went wrong"` | `"Could not connect to email server"` |
| `"Error: undefined"` | Specific error with context |
| `"500 Internal Server Error"` (to user) | `"Service temporarily unavailable, try again in 30s"` |

## Language-Specific Anti-Patterns

### Ruby
```ruby
# BAD: Swallowing
begin
  risky_operation
rescue
  # nothing
end

# BAD: Context loss
rescue => e
  raise "Operation failed"  # loses e
end

# GOOD: Preserve and classify
rescue NetworkError => e
  retry if retries < 3
  raise OperationFailedError.new("Network error: #{e.message}", cause: e)
end
```

### JavaScript/TypeScript
```javascript
// BAD: Swallowed rejection
somePromise.catch(() => {});

// BAD: Shape inconsistency
if (error) return null;  // sometimes throws, sometimes null

// GOOD: Classified and preserved
catch (e) {
  if (e instanceof RetryableError) {
    return retry(fn, e);
  }
  throw new ServiceError("Failed to process", { cause: e });
}
```

### Python
```python
# BAD: Bare except
try:
    risky()
except:
    pass

# BAD: Re-raise without context
except Exception:
    raise RuntimeError("Failed")  # loses original

# GOOD: Preserve chain
except SpecificError as e:
    raise ServiceError("Processing failed") from e
```

### Go
```go
// BAD: Ignored error
doSomething()

// BAD: Lost context
if err != nil {
    return errors.New("failed")  // lost err
}

// GOOD: Wrap with context
if err != nil {
    return fmt.Errorf("failed to process: %w", err)
}
```

## Broad Rescue Classification

| Language | Pattern | Programming errors it hides |
|----------|---------|-----------------------------|
| Ruby | `rescue StandardError` or bare `rescue` | NoMethodError, TypeError, NameError, ArgumentError |
| Java/TS/C# | `catch (Exception e)` | NullPointerException, ClassCastException, ArrayIndexOutOfBounds |
| Python | `except Exception:` or bare `except:` | AttributeError, TypeError, NameError, KeyError |
| Go | `recover()` in deferred func | Nil pointer dereference, index out of range, slice bounds |

## Observability Integration Points

| Surface | What to Include |
|---------|----------------|
| Error logs | Error type, message, stack trace, request context, correlation ID |
| Error responses | Error code, user-facing message, correlation ID (not stack traces) |
| Metrics | Error count by type, retry count by category, error rate |
| Traces | Error as span event, error type as attribute |

## Retry Policy Checklist

A proper retry policy should define:
- [ ] Which error types are retryable
- [ ] Maximum retry count
- [ ] Backoff strategy (fixed, exponential, jittered)
- [ ] Circuit breaker thresholds
- [ ] Timeout per attempt
- [ ] Fallback action when retries exhausted
