# Template — Linear Feedback Intake

API route that accepts feedback widget POSTs and creates Linear issues. Falls back to 503 with a friendly message when Linear isn't configured.

Uses the `@metis-ai-research/feedback` package (your existing widget + adapter). If you're not using that package, treat this template as pseudocode and substitute your own Linear GraphQL call.

## Files copied

```
app/api/feedback/route.ts   # Linear-backed feedback endpoint
```

## After copying

1. **Customize `enrichPayload`** — this template pulls `userId/email/name` from NextAuth session. Replace with your auth strategy if not using NextAuth.
2. **Add to `.env.example`:**
   ```
   LINEAR_API_KEY=
   LINEAR_TEAM_ID=
   LINEAR_PROJECT_ID=          # optional
   LINEAR_LABEL_BUG=           # optional, label UUID
   LINEAR_LABEL_FEEDBACK=      # optional
   LINEAR_LABEL_FEATURE=       # optional
   ```
3. **Wire the feedback widget** into your `(app)/layout.tsx` so it floats over every authenticated page.
4. **Follow the recipe** at `~/src/recipes/recipes/linear-feedback-intake.md` for finding team/project/label UUIDs.

## Required dependencies

```bash
npm install @metis-ai-research/feedback
```
