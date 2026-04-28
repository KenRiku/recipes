# Integration — Linear Feedback Intake

> **Status:** Stub. Reference implementation: `pieceful/app/api/feedback/route.ts` + `@metis-ai-research/feedback` widget.

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

## Gotchas

- **Linear's GraphQL doesn't accept a stale schema** — when Linear updates types, your queries can break silently with 200-OK + null payloads. Always check `data` for nulls before claiming success.
- **Personal API keys belong to a user**, not the workspace. If that user leaves, integrations break. For production, prefer an OAuth app or a dedicated service-account user.
- **Labels are team-scoped** — using a label ID from the wrong team gives a confusing "input does not exist" error.

---

## Go-Live Checklist

- [ ] All 4 env vars set on Vercel Production (key, team, project, labels as needed)
- [ ] Service-account user created (not your personal API key) for production
- [ ] Widget endpoint excluded from CSRF if applicable
- [ ] Submitted issues land in the correct team / project / labels
- [ ] User PII handling considered (do you want email captured? optional? required?)
