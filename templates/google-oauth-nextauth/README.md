# Template — Google OAuth via NextAuth

NextAuth v4 config with Credentials (email + password) and optional Google OAuth provider, gated by the `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` flag.

## Files copied

```
lib/auth.ts        # NextAuth options — Credentials + Google + JWT callbacks
```

## After copying

1. **Customize the JWT/session callbacks** — this template loads `id` and `role` onto the session. Add anything else your app needs (tenant id, plan, etc.).
2. **Implement `provisionUser`** — the Google `signIn` callback calls a `provisionUser({ email, name, image })` helper that creates or finds a User and returns `{ userId, role }`. CUSTOMIZE: write that helper based on your User model.
3. **Augment NextAuth types** in `types/next-auth.d.ts`:
   ```ts
   import 'next-auth'
   declare module 'next-auth' {
     interface Session { user: { id: string; role: string; email?: string | null; name?: string | null; image?: string | null } }
     interface User { id: string; role: string }
   }
   declare module 'next-auth/jwt' {
     interface JWT { id: string; role: string }
   }
   ```
4. **Add to `.env.example`:**
   ```
   AUTH_SECRET=
   NEXTAUTH_URL=
   NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   ```
5. **Follow the recipe** at `~/src/recipes/recipes/google-oauth-nextauth.md` for Google Cloud Console OAuth client setup and redirect-URI configuration.

## Required dependencies

```bash
npm install next-auth bcryptjs
npm install -D @types/bcryptjs
```
