# Template — Resend Transactional Email

Resend client wrapper with HTML templates and dev fallback. Logs payloads to console when `RESEND_API_KEY` is missing — local dev never sends real emails.

## Files copied

```
lib/email.ts                # Resend wrapper + example templates
```

## After copying

1. **Replace `FROM_ADDRESS`** in `lib/email.ts` with your verified domain.
2. **Replace the example template functions** (`sendWelcomeEmail`, `sendPasswordResetEmail`) with templates your project actually needs. The pattern: pure function returning `{ subject, html }`, with `escapeHtml()` on all interpolated strings.
3. **Add to `.env.example`:**
   ```
   RESEND_API_KEY=
   ```
4. **Follow the recipe** at `~/src/recipes/recipes/resend-email.md` for domain verification and DNS setup.

## Required dependencies

```bash
npm install resend
```
