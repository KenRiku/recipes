# Templates — Copy-Paste Integration Wrappers

Pre-baked code for the integrations documented in `recipes/`. Each template is a small directory tree that mirrors where the files should land in a target project. Copy them in, then follow the matching recipe in `recipes/recipes/<service>.md` for env vars and account setup.

## Layout

```
templates/
├── stripe-billing/         # Stripe subscriptions + paywall + webhook + customer portal
├── resend-email/           # Resend wrapper with HTML templates and dev fallback
├── dropbox-sign/           # Dropbox Sign wrapper + webhook
├── google-oauth-nextauth/  # NextAuth Credentials + Google provider, JWT sessions
├── linear-feedback/        # Linear-backed feedback intake API
├── vercel-cron/            # Cron route skeleton + vercel.json fragment
└── bin/
    └── copy-integration.sh # Helper script to copy a template into a target project
```

## Assumptions

These templates assume the target project is:
- **Next.js 14** with App Router
- **Prisma** + **PostgreSQL** (Neon recommended)
- **NextAuth v4** with JWT sessions
- TypeScript

For projects using a different stack, the templates are still useful as reference — just adapt the framework specifics.

## How to use

### Option 1 — Copy script (preferred)

```bash
bash ~/src/recipes/templates/bin/copy-integration.sh stripe-billing ~/src/my-new-project
```

The script copies the template's directory tree into the target, preserving paths (`lib/foo.ts` → `<target>/lib/foo.ts`). It refuses to overwrite existing files unless you pass `--force`.

### Option 2 — Manual copy

```bash
cp -r ~/src/recipes/templates/stripe-billing/lib/* ~/src/my-new-project/lib/
cp -r ~/src/recipes/templates/stripe-billing/app/* ~/src/my-new-project/app/
```

### After copying

1. Search for `// CUSTOMIZE:` comments in the copied files and adapt them.
2. Add the template's required env vars to `.env.example` (each README lists them).
3. Follow the matching recipe in `recipes/recipes/<service>.md` for account setup + go-live.
4. Commit. **Do not** edit the source template — if you find an improvement, port it back to `~/src/recipes/templates/` so the next project benefits.

## Compounding rules

- **Update the template, not just the copy.** When you discover a real improvement while integrating into a new project, port it back to `templates/` before merging your project's PR.
- **Keep templates framework-tolerant.** Avoid baking project-specific business logic. Use `// CUSTOMIZE:` markers for things that vary.
- **Don't over-engineer.** Templates are starting points, not frameworks. Each project is allowed to diverge.
