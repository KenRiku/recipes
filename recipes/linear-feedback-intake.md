# Integration — Linear Feedback Intake

> **Status:** Two working variants. Authenticated widget: `pieceful/app/api/feedback/route.ts` + `@metis-ai-research/feedback` package. Public contact form (hand-rolled, no package): `arotaro.ai/api/feedback.js`.

---

## What you need

### Accounts
- **Linear workspace** — https://linear.app

### Env vars
| Var | Required | Notes |
|---|---|---|
| `LINEAR_API_KEY` | yes | Personal API key from Linear settings |
| `LINEAR_TEAM_ID` | yes | UUID of the team to file issues in |
| `LINEAR_PROJECT_ID` | optional | Pin all submissions to a single project |
| `LINEAR_LABEL_BUG` / `LINEAR_LABEL_FEEDBACK` / `LINEAR_LABEL_FEATURE` | optional | Per-type label IDs |

### Code surface
- `app/api/feedback/route.ts` — accepts widget POSTs, calls Linear GraphQL `issueCreate`. Follows [`dev-fallback-pattern`](../standards/dev-fallback-pattern.md): when env vars missing, returns 503 with friendly copy instead of dropping silently.
- `components/feedback-widget` — the user-facing component (or an npm package, e.g. `@metis-ai-research/feedback`).

---

## Setup

1. Linear → Settings → API → **Create personal API key**. Copy.
2. Find team UUID: open any issue in that team, inspect URL, or run a `teams { id name }` GraphQL query against `api.linear.app/graphql`.
3. (Optional) Find project UUID similarly. Pin a "Customer Feedback" project for all submissions.
4. (Optional) Find label UUIDs in Linear settings or via `team(id) { labels { nodes { id name } } }`.
5. Set all required env vars in `.env.local` (and Vercel Production for live).
6. Wire the widget into `(app)/layout.tsx` so it floats over every authenticated page.

## Test the flow
- Click feedback button → submit → check Linear team for new issue.
- Dev fallback (no `LINEAR_API_KEY`): widget shows "feedback not enabled in this environment" toast; nothing leaks.

---

## Variant: public contact form → Linear (no package, no auth)

Reference: `arotaro.ai/api/feedback.js` (plain CommonJS Vercel function; shipped 2026-07). Use when a static/public site needs a contact form filing into Linear and the `@metis-ai-research/feedback` package doesn't fit (non-Next.js host, need non-image attachments, want zero deps).

- **Hand-roll the GraphQL call** — `issueCreate` is one small mutation; no SDK needed. Prefix env vars per tenant (`LINEAR_TEAM_ID_<TENANT>`, `LINEAR_LABEL_*_<TENANT>`) so multiple apps can share a workspace key without collisions.
- **Same-origin beats CORS**: host the function next to the frontend (`/api/feedback` on Vercel) instead of a cross-origin endpoint — the whole CORS/OPTIONS wrapper problem disappears.
- **Spam defense for a public route**: hidden honeypot field (accept-and-drop with 200 so bots learn nothing) + best-effort per-warm-instance in-memory rate limit. Fine for contact-form threat model; don't over-engineer.
- **Category → label mapping is lossy by design**: map form categories onto existing team labels, leave the unmappable ones unlabeled, and always write the raw category into the issue body so nothing is lost. Frontend must send the raw i18n key, not the translated label.
- **Attachments** via the `fileUpload` mutation (get presigned URL → PUT bytes → embed `assetUrl` in the description as a markdown link). Make it best-effort: losing the issue over an attachment glitch is worse than losing the attachment. Record the filename in the body even when the upload fails.

## Gotchas

- **Linear's GraphQL doesn't accept a stale schema** — when Linear updates types, your queries can break silently with 200-OK + null payloads. Always check `data` for nulls before claiming success.
- **Personal API keys belong to a user**, not the workspace. If that user leaves, integrations break. For production, prefer an OAuth app or a dedicated service-account user.
- **Labels are team-scoped** — using a label ID from the wrong team gives a confusing "input does not exist" error.
- **`Authorization` header is the raw API key, NOT `Bearer <key>`** — Bearer silently fails auth.
- **Restricted API keys can `issueCreate` but not `fileUpload`** — `fileUpload` needs the `write` scope; a key created with only "Create issues" scope gets `Invalid scope: write required` (403) on attachment upload while issue creation keeps working. Either use a full-scope key or make attachments best-effort.
- **Vercel serverless bodies cap at ~4.5MB** — base64 inflates files by ~33%, so cap client-side attachments at **3MB raw** or the request dies with a 413 before your function runs.
- **CRA SPA on Vercel needs a rewrite that excludes `/api`**: `{ "source": "/((?!api/).*)", "destination": "/index.html" }` — a bare catch-all rewrite would swallow the function route.

---

## Go-Live Checklist

- [ ] All 4 env vars set on Vercel Production (key, team, project, labels as needed)
- [ ] Service-account user created (not your personal API key) for production
- [ ] Widget endpoint excluded from CSRF if applicable
- [ ] Submitted issues land in the correct team / project / labels
- [ ] User PII handling considered (do you want email captured? optional? required?)
