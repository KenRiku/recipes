# Integration — Google OAuth via NextAuth

> **Status:** Stub. Reference implementation: `pieceful/lib/auth.ts` + `.env.example`.

---

## What you need

### Accounts
- **Google Cloud Console** — https://console.cloud.google.com

### Env vars
| Var | Source | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Cloud Console → OAuth client | Required when flag is on |
| `GOOGLE_CLIENT_SECRET` | Cloud Console → OAuth client | Required when flag is on |
| `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` | Manual | `true` to show the button; gating the env vars themselves |

### Code surface
- `lib/auth.ts` — `authOptions.providers` includes `GoogleProvider({ clientId, clientSecret })` conditionally on the flag.
- `(auth)/login/page.tsx` — "Sign in with Google" button shown when flag is on.

---

## Setup

1. Cloud Console → APIs & Services → **OAuth consent screen** → set up app (External / Internal as appropriate).
2. **Credentials → Create Credentials → OAuth client ID** → Application type: Web application.
3. Authorized redirect URI: `{NEXTAUTH_URL}/api/auth/callback/google`
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Prod: `https://<prod-domain>/api/auth/callback/google`
4. Copy Client ID + Client Secret.
5. Set all 3 env vars (`NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

## Test the flow
- Visit `/login` → "Sign in with Google" → Google consent → redirect back → JWT session.

---

## Gotchas

- **Redirect URI must match exactly** — including http/https and trailing slash. Easiest debug: check the URL in the browser when Google rejects.
- **Boot-time crash if flag is on but vars missing.** Code intentionally crashes loudly instead of silently disabling — prevents shipping a half-configured deployment.
- **Account linking with Credentials provider:** if a user already exists with the email in the credentials table, NextAuth needs explicit linking logic. Default is "different providers, different users" — surprising.
- **Cloud Console OAuth consent screen → Publishing status:** if "Testing", only listed test users can sign in. Move to "In production" before launch.

---

## Go-Live Checklist

- [ ] OAuth consent screen status: **In production** (not Testing)
- [ ] Production redirect URI added in Cloud Console
- [ ] All 3 env vars set on Vercel Production
- [ ] Account linking strategy decided (auto-link by email vs separate accounts)
- [ ] Privacy policy + ToS URLs in OAuth consent screen point to live pages
