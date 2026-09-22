---
name: auth-multipass
multipass_desc: "Review authentication flows — OAuth/OIDC, JWT validation, session management, credential handling, token lifecycle, and MFA correctness."
description: "-"
when_to_use: "When reviewing authentication and authorization flows, session management, token handling, or when the user mentions auth, login, or identity."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - LSP
---

## Review Contract

### Scope & Targeting

**When the user specifies scope** (file path, "the PR", a commit hash, "everything", a branch name), use that scope directly.

**Default scope** when the user provides no explicit scope — use the first match:

1. **Branch diff.** If on a non-default branch (not main/master), diff against the merge base: `git diff $(git merge-base HEAD origin/main)...HEAD`. This captures the full changeset.
2. **Working tree.** `git diff HEAD` plus untracked files (`git ls-files --others --exclude-standard`). If non-empty, use these changes.
3. **Recent commits.** If on the default branch with a clean working tree, review the last 5 commits (`git log --oneline -5`).

**Scope overrides:**
- "review the PR" / "pr review" → `gh pr view` to get the PR, then `git diff <base>...HEAD`
- "full review" / "review everything" → all source files in the repo
- Named file or directory → that path only

**Untracked files are always included in working-tree scope.**

**Argument interpretation:** `$ARGUMENTS` may contain a natural language description of what to review — anything from a file path to a focus area to a longer prompt. If arguments contain paths, narrow your search accordingly. If they describe a focus area, prioritize that surface. If arguments are empty or absent, use the default scope above.

### Review Mode

Review-only. No mutations, no fix waves, no loops.

### Core Rules

- Work from repo truth first. Separate confirmed findings from assumptions and unverified areas.
- Report every confirmed finding regardless of severity. Do not pad with unverified speculation, but do not dismiss confirmed findings because they are minor.
- Respect explicit preservation annotations in code (`DO NOT REMOVE`, `DO NOT DELETE`, `KEEP THIS`). Never recommend removal or modification of annotated-to-keep code.
- **Stranded code is not dead code.** Before flagging "dead code" or "unused code," check for `STATUS:` markers, related issues, and integration plans. Only "obsolete" (confirmed dead with no integration path) is removable.
- When another review skill is clearly needed, use only the smallest relevant set of available review lenses.
- **Low-severity findings default to actionable.** "It's just a nitpick" is not a valid reason to downgrade or omit.
- **Out-of-scope findings are reported with a suggested action** (fix/TODO/issue) in the triage table. Never silently drop a finding.

### Finding Severity

| Level | Meaning | When to use |
|---|---|---|
| `critical` | Exploitable auth bypass, credential leak, or session takeover | Authentication skipped on a protected endpoint, JWT accepted without signature verification |
| `high` | Likely auth bug exploitable under normal usage | Missing token expiry check, session fixation, OAuth redirect URI not validated |
| `medium` | Auth weakness requiring specific conditions | Missing CSRF token on login, cookie flags misconfigured, token rotation gap |
| `low` | Minor hardening improvement | Verbose error messages on auth failure, inconsistent token format, missing rate limiting hint |
| `unverified` | Plausible but not confirmed against primary source | Protocol-dependent claims where the RFC or spec was not checked |

**`unverified` is an epistemic status, not a severity level.** Report as `[unverified]` with authority needed and confidence.

### Finding Format

**[SEVERITY] file_path:line_number** — one-line summary
- **What:** concrete description of the issue
- **Why it matters:** impact if unfixed
- **Fix:** specific suggestion or code snippet

### Self-Challenge Protocol

Before reporting findings, verify your own analysis:

**Protocol verification:** Trace the full authentication flow from credential submission to session/token issuance to protected resource access. Construct a concrete attack scenario showing which step fails and what an attacker gains. Verify the vulnerability is not gated by a compensating control elsewhere in the flow.

**Spec-dependent verification:** Auth findings frequently depend on protocol specifics (OAuth 2.0 RFC 6749, OIDC Core, JWT RFC 7519, Session RFC 6265). Verify claimed behavior against the authoritative RFC or spec. "OAuth requires PKCE" is not a finding until confirmed for the specific grant type and client type per RFC 7636. Flag unverified spec claims as `[unverified]`.

**Compensating control check:** Before reporting an auth weakness, verify no upstream or downstream control already mitigates it. A missing CSRF token on login is less critical if the login endpoint is already rate-limited and uses same-site cookies.

For all tracks: if verification shows the finding is wrong, discard it. If real but minor, report at appropriate severity. If spec-dependent verification cannot confirm, flag as unverified. When a finding is overturned during verification, record it in your project-scoped memory so future reviews in this project benefit from the correction.

### Finding Triage

Every confirmed finding includes a suggested action:

| Action | When | What happens |
|--------|------|-------------|
| **Fix** | Well-understood, local, safe to apply | Apply in a separate turn |
| **TODO** | Needs design decisions, or acceptable with documented limit | Add `TODO:` comment with finding context |
| **Issue** | Large, cross-cutting, or needs human policy/product input | Create a GitHub issue |

# Authentication Review

Review authentication mechanisms for protocol correctness, credential handling, and session integrity — not just "is auth present?" but "is auth implemented correctly?"

## Scope

- Identify all authentication entry points: login forms, API key validation, OAuth/OIDC flows, SAML assertions, token endpoints, password reset flows.
- Identify credential stores and formats: password hashes, API keys, JWTs, session tokens, refresh tokens.
- Identify session/token lifecycle: creation, validation, renewal, revocation, expiry, cleanup.
- Include middleware, guards, and before-action filters that enforce authentication.
- Focus on protocol correctness and implementation bugs, not policy decisions (password length requirements are policy; accepting any JWT signature algorithm is a bug).

## Workflow

1. Map all authentication endpoints and the credential types they accept.
2. Trace credential validation: hashing, signature verification, claims checking, expiry enforcement.
3. Review session/token lifecycle: creation entropy, storage security, rotation on privilege change, revocation paths, expiry enforcement.
4. Verify OAuth/OIDC flows: redirect URI validation, state parameter, PKCE usage, authorization code binding, token exchange security.
5. Check credential storage and transmission: password hashing algorithm and work factor, token storage on client and server, credential exposure in logs and errors.
6. Review MFA implementation: bypass paths, fallback mechanisms, recovery flow security.
7. Classify risks by exploitability and impact.

## Common Risk Areas

### OAuth / OIDC

- **Redirect URI validation:** open redirects allowing authorization code theft, partial matching that accepts attacker-controlled subdomains
- **State parameter:** missing or not verified, enabling CSRF on authorization callback
- **PKCE:** missing for public clients (SPAs, mobile), weak code_verifier entropy, code_challenge_method not `S256`
- **Authorization code reuse:** code exchanged more than once, code not invalidated after first use
- **Token endpoint authentication:** client_secret exposed in public clients, missing client authentication for confidential clients
- **ID token validation:** signature not verified, `aud` claim not checked, `iss` not validated, `nonce` missing or not verified

### JWT

- **Algorithm confusion:** accepting `alg: none` or symmetric algorithm when asymmetric was intended (CVE-2016-10555 class)
- **Signature bypass:** signature not verified at all, or verified after claims are already trusted
- **Missing claims enforcement:** no `exp` check, `nbf` ignored, `aud` not validated, `iss` not checked
- **Key management:** signing key rotated but old keys still accepted without `kid` disambiguation, shared secret used across services allowing cross-service token forgery
- **Token storage:** tokens in localStorage (XSS-extractable), tokens in unencrypted cookies, refresh tokens without rotation

### Session Management

- **Session fixation:** session ID not regenerated after login, session ID accepted from URL parameters
- **Session storage:** sessions in server memory without TTL, session store not encrypted at rest, session data containing credentials
- **Cookie security:** missing `Secure`, `HttpOnly`, or `SameSite` flags, session cookie name revealing framework
- **Concurrent sessions:** no limit on active sessions per user, old sessions not invalidated on password change
- **Session termination:** logout does not invalidate server-side session, only clears client cookie

### Password / Credential Handling

- **Hashing:** plain text, MD5/SHA without salt, bcrypt with work factor < 10, missing pepper when required by policy
- **Password reset:** predictable or time-based tokens, tokens that never expire, tokens reusable after password change, reset token sent via insecure channel
- **Credential rotation:** service credentials never rotated, API keys without expiry, long-lived tokens without revocation mechanism
- **Error messages:** "user not found" vs "wrong password" enabling user enumeration, timing attacks on login revealing account existence

### Multi-Factor Authentication

- **Bypass paths:** endpoints that accept password-only when MFA is enrolled, MFA verification skipped after social login
- **Recovery:** recovery codes generated with insufficient entropy, recovery flow bypasses MFA entirely, recovery codes not rate-limited
- **Implementation:** TOTP with loose time window (> ±2 drift), SMS as sole factor without rate limiting, push notification without user confirmation context

## Guardrails

- Report findings with a concrete attack scenario, not theoretical weaknesses. "The redirect URI is not validated" is a finding; "OAuth could be more secure" is not.
- Separate authentication (who are you?) from authorization (what can you do?). Authorization gaps belong in an access-control review, not here. Only flag authorization issues that are direct consequences of authentication failures (e.g., authentication bypass leading to privilege escalation).
- Protocol-specific findings must cite the relevant RFC or spec section. "JWT should validate `aud`" cites RFC 7519 §4.1.3.
- Distinguish between implementation bugs and hardening suggestions. A missing `Secure` flag on a session cookie that is only served over HTTPS is a hardening suggestion (medium). Accepting unsigned JWTs is an implementation bug (critical).
- Framework-level auth configuration (configuration precedence, reload semantics — not auth protocol correctness) is `config-safety-multipass`'s domain.
- Broad security posture (trust boundaries, attack surface mapping — not specific auth flow correctness) is `security-multipass`'s domain.
- Findings that touch a sibling lens's domain (access control, config semantics, broad security posture) are still reported here, with the sibling lens noted in the triage entry — do not defer or hand them off. Running another lens is the human's routing decision.

## Useful Checks

Look for authentication endpoints, token handling, and session management:

```bash
# Auth endpoints and middleware
rg -n "authenticate|login|sign_in|session\[:|current_user|warden|devise"
rg -n "before_action.*auth|middleware.*auth|AuthMiddleware|AuthenticateHandler"

# OAuth/OIDC
rg -n "oauth|openid|client_id|redirect_uri|authorization_code|access_token|id_token"
rg -n "PKCE|code_verifier|code_challenge|state.*param"

# JWT
rg -n "jwt|JWT\.|decode|verify|alg|HS256|RS256|jwk|kid"
rg -n "exp.*claim|nbf|aud|iss|sub.*claim"

# Session/cookie
rg -n "session_store|cookie_store|session\[|cookies\.secure|httponly|same_site"
rg -n "session_id|session_regenerate|reset_session|expire_after"

# Password/credential handling
rg -n "bcrypt|scrypt|argon2|has_secure_password|password_digest|digest"
rg -n "password_reset|reset_token|recovery_code|one_time_password"
rg -n "BCrypt::Password|Password\.create|Password\.verify"

# MFA
rg -n "totp|hotp|otp_secret|two_factor|mfa|multifactor|rotp|authy"
rg -n "recovery_codes|backup_codes|verification_code"

# Token/credential exposure
rg -n "secret.*log|token.*log|password.*log|logger.*secret"
git diff --name-only
```

Run auth-specific test suites where available. Check for test coverage of auth failure paths (wrong password, expired token, invalid signature).

### Example Findings

**[critical] app/controllers/api/auth_controller.rb:28** — JWT accepted without signature verification
- **What:** `JWT.decode(token, nil, false)` disables signature verification, accepting any JWT with valid JSON structure.
- **Why it matters:** An attacker crafts a JWT with arbitrary `sub` and `admin: true` claims. The application trusts all claims without verifying the signer, granting full access to any account including admin.
- **Fix:** Specify the algorithm and provide the verification key: `JWT.decode(token, hmac_secret, true, { algorithm: 'HS256', verify_aud: true, aud: 'my-api' })`. Per RFC 7519 §6, the receiver MUST validate the signature.

**[high] app/controllers/oauth/callback_controller.rb:15** — OAuth redirect URI not validated
- **What:** `redirect_to(params[:redirect_uri])` passes the user-supplied redirect_uri directly without checking it against a registered allowlist.
- **Why it matters:** An attacker constructs a malicious authorization link with `redirect_uri=https://evil.com`. After the user authenticates, the authorization code is sent to the attacker's server. Per RFC 6749 §10.15, the redirect URI MUST be compared against pre-registered values.
- **Fix:** Store registered redirect URIs per client_id. On callback, compare `params[:redirect_uri]` against the registered value using exact string match: `redirect_uri = params[:redirect_uri]; registered = Client.find(params[:client_id]).redirect_uris; raise Unauthorized unless registered.include?(redirect_uri)`.

**[medium] config/initializers/session_store.rb:8** — session fixation risk — session ID not rotated on login
- **What:** The login action sets `session[:user_id]` without calling `reset_session` first. The pre-login session ID persists into the authenticated session.
- **Why it matters:** An attacker who knows or sets the victim's session ID before login (via session fixation) retains access after the victim authenticates. The attacker's known session ID now carries full authentication.
- **Fix:** Call `reset_session` before setting the authenticated user: `reset_session; session[:user_id] = user.id`. This regenerates the session ID.

## Output Template

- Authentication surfaces reviewed:
- Credential validation findings:
- Session/token lifecycle findings:
- OAuth/OIDC flow findings:
- MFA implementation findings:
- Required fixes before release:
- Residual risk and assumptions:

Prioritize the smallest fix that reliably prevents authentication bypass.
