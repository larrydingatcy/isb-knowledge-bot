# Privacy and security operations

## Public data boundary

Only reviewed records with `visibility: "public"` and an approved publication state may enter `data/knowledge`. Never commit raw Dragons’ Gate pages, browser profiles, cookies, SSO state, student names, IDs, family contact details, balances, or private schedules.

## Runtime data

- The browser sends the question, language, and optional category to the Vercel API.
- The API validates length and origin before processing, applies distributed rate and budget limits, and sends only retrieved evidence to OpenAI.
- Application code does not log full question text. Operational logging should remain limited to anonymous status, latency, and counter data.
- OpenAI responses use `store: false`; consult the current provider agreement before changing this setting.

## Secret handling

Secrets live only in Vercel environment variables or GitHub Secrets. `.env*` is ignored except for `.env.example`. Inspect built JavaScript before each release for secret-like strings. Rotate a credential immediately if it is printed, committed, or exposed to a browser bundle; remove it from history only after rotation.

## Incident response

1. Disable or roll back the affected deployment.
2. Rotate exposed credentials and invalidate sessions.
3. Withdraw affected knowledge entries.
4. Preserve minimal non-sensitive diagnostics.
5. Document the cause and add a failing regression test before fixing it.
