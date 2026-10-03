# Supabase production settings checklist

`supabase/config.toml` only configures the **local** stack. The hosted project's Auth, rate-limit and backup settings live in the dashboard and are **not** applied by `supabase db push`. Use this checklist to mirror the local hardening in production, and re-check it after any change to `[auth]` in `config.toml`.

Dashboard path prefix: **Project → Authentication** unless stated otherwise.

## Auth — sign-up and sign-in

- [ ] **Sign In / Providers → Allow new users to sign up: OFF.** Staff are provisioned by an admin (`auth.admin.createUser` or the dashboard, see `supabase/FLOWS.md` § 4.2). Service-role user creation keeps working with sign-up off.
- [ ] **Email provider: enabled.** Login is email + password. (Do not confuse it with the sign-up toggle: disabling the provider also disables login.)
- [ ] **Confirm email: ON.** Admin-created users are created with `email_confirm: true`, so this only blocks unverified self-service flows.
- [ ] **Anonymous sign-ins: OFF.**
- [ ] **Manual linking: OFF.**
- [ ] All other providers (phone, OAuth, Web3, SSO) disabled unless explicitly needed.

## Auth — passwords

- [ ] **Minimum password length: 10** (`minimum_password_length = 10`).
- [ ] **Password requirements: lowercase, uppercase letters and digits** (`lower_upper_letters_digits`).
- [ ] **Secure password change: ON** (`secure_password_change = true` — requires a recent login to change a password).
- [ ] **Prevent use of leaked passwords (HaveIBeenPwned): ON** (Pro plan and above; no local equivalent).
- [ ] Existing users with weaker passwords still log in (Supabase reports `weak_password` but does not block). Ask staff to rotate after the policy change.

## Auth — sessions

- [ ] **JWT expiry**: keep at 3600 s (matches local `jwt_expiry`). The apps sign out and show "sesión expirada" on a 401/expired JWT.
- [ ] **Refresh token rotation: ON**, reuse interval 10 s.
- [ ] Optional: **Time-box / inactivity timeout** for sessions (Pro plan) as a server-side complement to the client idle timeout.

## Auth — abuse protection

- [ ] **Bot and abuse protection → CAPTCHA**: enable Turnstile or hCaptcha for sign-in, **only after** the login forms send the captcha token (not implemented yet; enabling it first locks everyone out).
- [ ] **Rate limits** (Authentication → Rate Limits), at least as strict as local:
  - Sign-ups and sign-ins: 30 per 5 min per IP.
  - Token refreshes: 150 per 5 min per IP.
  - Token verifications (OTP / magic link): 30 per 5 min per IP.
  - Emails sent: keep the custom-SMTP default low; Vitalock does not send auth emails in normal operation.
- [ ] **Custom SMTP** configured if password-reset emails are ever enabled (the built-in sender is rate-limited and not meant for production).

## URL configuration

- [ ] **Site URL** and **Redirect URLs** list only the production admin and installer origins (no `localhost`, no wildcards beyond what the deploy needs).

## Database and API

- [ ] **API → Exposed schemas** match `[api] schemas` in `config.toml`; nothing extra.
- [ ] **Database → Advisors → Security**: no `function_search_path_mutable`, `security_definer_view`, or anon-grant findings (covered by pgTAP `test_131` and `test_138` locally; re-check after each `db push`).
- [ ] **SSL enforcement: ON**; **Network restrictions** limited to known IPs if direct DB access is used.

## Backups

- [ ] **Database → Backups**: daily backups enabled (Pro plan).
- [ ] **Point-in-Time Recovery (PITR)** enabled — recommended for production data (paid add-on).
- [ ] Restore procedure tested at least once on a branch/staging project, and the retention window written down.
- [ ] Storage buckets are **not** covered by database backups — decide on a separate export if MDB/attachments must be recoverable.
