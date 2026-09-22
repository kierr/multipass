# PII Signal Patterns

High-signal patterns for identifying PII handling issues across the data lifecycle.

## Collection Minimization

| Signal | Concern |
|--------|---------|
| Form fields with no business use | Over-collection, compliance risk |
| `optional: false` on non-essential fields | Forced collection, user friction |
| Storing full SSN when last 4 suffices | Over-collection |
| Collecting DOB when age range works | Over-collection |
| Full address when country/region suffices | Over-collection |
| Asking for phone when email works | Over-collection |
| Storing raw input vs validated/normalized | Unnecessary data retention |

## Storage Encryption

| Signal | Status |
|--------|--------|
| Plaintext `email` column | Requires justification |
| Plaintext `phone` column | Requires justification |
| Plaintext `ssn` / `tax_id` | Critical - should be encrypted |
| Plaintext `date_of_birth` | Sensitive - consider encryption |
| Plaintext credit card numbers | Critical - PCI violation |
| Encrypted columns with key in same DB | False security |
| No encryption key rotation strategy | Key compromise = total breach |
| Backups without encryption parity | Protected in DB, exposed in backup |

## Database Patterns

| Pattern | Signal |
|---------|--------|
| `t.string :ssn` | Unencrypted sensitive field |
| `t.binary :encrypted_ssn` | Good - encrypted storage |
| `t.string :email, index: true` | Standard, often unencrypted |
| `t.string :email_ciphertext` | Encrypted email storage |
| No `deleted_at` or soft delete | Hard deletes may miss cascades |
| Polymorphic relations without FKs | Cascade delete risk |
| Denormalized PII in multiple tables | Erasure complexity |

## Logging Posture

### Under-Filtering Signals

| Pattern | Leak Risk |
|---------|-----------|
| `logger.info(user.to_json)` | Full user object in logs |
| `Rails.logger.debug(params)` | Raw params including secrets |
| `console.log(req.body)` | Request body with PII |
| Logging email in auth failures | Credential enumeration + leak |
| Logging phone in SMS errors | Phone number exposure |
| Stack traces with user input | Injection payloads in traces |
| Error notifications with context | PII in alerting systems |

### Over-Filtering Signals

| Pattern | Diagnosability Impact |
|---------|----------------------|
| `[FILTERED]` on all user fields | Cannot trace user issues |
| No user reference in request logs | Cannot correlate requests |
| No session identifier in logs | Cannot trace sessions |
| All IDs filtered | Cannot debug relationships |
| Timestamp-only logs | No context at all |

### Balanced Patterns

| Pattern | Why It Works |
|---------|--------------|
| `user_id: 12345` in logs | Traceable without exposing PII |
| `request_id: abc123` | Correlation without identity |
| `email_domain: example.com` | Domain patterns without full email |
| `country: US` | Geographic patterns without address |
| `user_type: premium` | Segmentation without identity |

## Parameter Filtering

### Rails `filter_parameters`

```ruby
# Common patterns
config.filter_parameters += [
  :password,
  :password_confirmation,
  :token,
  :api_key,
  :secret,
  :ssn,
  :credit_card,
  :cvv,
  :phone,        # Consider if needed for debugging
  :email,        # Often over-filtering - evaluate per context
]
```

| Filter | Status |
|--------|--------|
| `:password` | Required |
| `:token, :api_key` | Required |
| `:ssn, :credit_card` | Required |
| `:email` | Context-dependent - may over-filter |
| `:phone` | Context-dependent |
| `:first_name, :last_name` | Usually over-filtering |

## API Response Exposure

| Pattern | Concern |
|---------|---------|
| Returning full user object | Over-exposure, use serialization |
| `render json: @user` | Uncontrolled serialization |
| Including PII in nested associations | Indirect exposure |
| Pagination with total PII count | Metadata leak |
| Error messages with user input | Injection + exposure |
| `X-User-Email` headers | Email in transit logs |

## Message Queue Patterns

| Pattern | Concern |
|---------|---------|
| Full user in Kafka payload | PII in message logs |
| No message retention policy | PII persists indefinitely |
| Consumer logging full messages | Log exposure |
| Cross-region replication | Data residency issues |
| Schema without PII classification | Accidental inclusion |

### Kafka Signal Patterns

```json
// Bad - full PII in message
{ "user": { "email": "user@example.com", "phone": "+1..." } }

// Better - minimal identifier
{ "user_id": 12345, "event": "signup" }

// If PII needed - classify in schema
{ "user_id": 12345, "pii_ref": "encrypted-payload-abc" }
```

## Audit Trail Coverage

| Signal | Status |
|--------|--------|
| No PaperTrail / audit gem | Missing change history |
| PaperTrail on User model | Good - tracks PII changes |
| PaperTrail disabled on sensitive models | Gap in audit |
| `whodunnit` not populated | Missing actor attribution |
| No login/logout audit | Access pattern gaps |
| No export/download audit | Data exfiltration blind spot |
| Admin actions not logged | Privilege abuse blind spot |

## Retention & Cleanup

| Signal | Concern |
|--------|---------|
| No `dependent: :destroy` on PII associations | Orphaned PII |
| No background cleanup jobs | Zombie data accumulation |
| Soft delete without purge policy | Indefinite retention |
| Sessions without expiration | Perpetual access |
| Audit logs without retention limit | Compliance risk or ignored |
| Backups without expiration | Indefinite PII retention |

### Cascade Delete Verification

```ruby
# Check these for right-to-erasure completeness
has_many :addresses, dependent: :destroy      # Good
has_many :orders # No dependent - PII in orders?  # Risk
has_many :audit_logs # No dependent - kept?      # Intentional?
has_one :profile, dependent: :destroy        # Good
```

## Third-Party Data Flows

| Pattern | Concern |
|---------|---------|
| Webhooks with user email | PII leaving system |
| Analytics with PII fields | Third-party exposure |
| Support tool integrations | Access without audit |
| Payment processor payloads | PCI scope |
| Email service full user objects | Over-sharing |
| CRM sync with all fields | Over-sharing |

## Error Message Leaks

| Pattern | Leak Risk |
|---------|-----------|
| `User not found: user@example.com` | Email exposure in error |
| `Invalid phone: +1...` | Phone in error output |
| `SSN already exists: 123-...` | Critical PII leak |
| `ActiveRecord::RecordInvalid` with full object | PII in exception |
| Validation errors with input values | Reflection of sensitive input |
| `puts` debugging with user data | Console/file exposure |

## Quick Heuristics

| Question | If Yes... |
|----------|-----------|
| Can I identify a person from logs? | Under-filtering |
| Can I debug a user issue from logs? | Good balance (if yes to above, still under-filtering) |
| Are there plaintext PII columns? | Verify intentional |
| Is there a data deletion flow? | Verify cascade completeness |
| Are third parties receiving PII? | Verify minimization + consent |
| Is there audit on PII access? | Compliance + security |
| Do errors include user input? | Sanitization needed |
