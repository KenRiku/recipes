# Adapting the stripe-billing template to a custom JWT auth project

The `templates/stripe-billing/` template assumes a NextAuth project. When a project uses a custom JWT cookie + `requireUser()` helper instead, the swap is small but worth documenting.

## What needs to change in the copied files

| Template line | Replace with | Why |
|---|---|---|
| `import { getServerSession } from "next-auth"` | (delete) | NextAuth not in use. |
| `import { authOptions } from "@/lib/auth"` | (delete) | No `authOptions` exists. |
| `const session = await getServerSession(authOptions); if (!session?.user?.id) return 401` | `const user = await requireUser()` | `requireUser()` already redirects/401s; no manual check needed. |
| `session.user.id` / `session.user.email` / `session.user.name` | `user.id` / `user.email` / `user.name` | `requireUser()` returns the user record directly. |

That's it for the route handlers. `lib/stripe.ts`, `lib/plan.ts`, and `lib/paywall-error.ts` are auth-agnostic and copy in unchanged.

## What you can skip from the template README

- "Wire `getUserPlan` into your session callback." There is no session callback. Just call `await getUserPlan(user.id)` directly inside any server component or route that needs the plan.
- "Augment NextAuth session types in `types/next-auth.d.ts`." No NextAuth.

## What to add instead

Many gates need the plan inside server components (e.g. an upgrade page that shows the current tier). Pattern:

```ts
// app/upgrade/page.tsx
const user = await requireUser()
const plan = await getUserPlan(user.id) // direct call, no session bag
```

Cheap — one indexed lookup on `Subscription`. Don't try to cache it in the JWT cookie; subscription state can change between requests (webhook updates) and you don't want to log everyone out to refresh the cookie.

## Verified in

- `fully-baked-vibe-security` (2026-04-28). Custom JWT via `jose` + bcryptjs cookie. The whole stripe-billing template + the credits add-on copied cleanly with the swaps above.
