# security/ (B11)

Two-factor authentication.

- **Authenticator app (TOTP):** Supabase Auth MFA on the client (`mfa.enroll`, `mfa.challenge`,
  `mfa.verify`). Nothing to build here except enforcement.
- **Email codes:** ours. The API emails a 6-digit code through `MailPort`, stores only its HMAC,
  verifies it, and records the session in `mfa_sessions`.

`mfa_satisfied()` in the database gates RLS and realtime; `core/auth.guard.ts` applies the same
rule to API routes and answers 401 `{ code: "mfa_required" }`.

| File | Role |
|---|---|
| `otp.ts` (built) | Pure: generate a code, HMAC it with `OTP_SECRET`, constant-time compare, expiry and attempt rules |
| `mfa.ts` (built) | Pure: `mfaPassed()`, the same rule as `mfa_satisfied()` in the database |
| `two-factor.service.ts` (built) | Send (rate limited 5/h), verify; purposes `login`, `enable`, `disable`; writes `email_otp_codes`, `user_security`, `mfa_sessions` |
| `two-factor.controller.ts` (built) | `GET /me/2fa`, `POST /me/2fa/email/send`, `POST /me/2fa/email/verify` |

Built (B11 done). Supabase Auth v2.197 offers `totp`, `phone`, `webauthn` and `recovery_code`
factors natively, but not email, so email codes stay ours. The guard reads the facts with the
`mfa_facts()` RPC on every request (about 2-3 ms).

Schema: `supabase/migrations/20261017171345_security_2fa.sql`. Mail: `src/mail`.
Plan: `docs/PLANS_DEVB.md` Task 17. First step: check whether Supabase Auth now offers email as
a native MFA factor; if it does, use it and drop our email tables in a new migration.
