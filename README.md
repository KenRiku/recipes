# Recipes — Cross-Project Engineering Knowledge

Personal compounding-engineering archive. Lives outside any single project so every future project can read from it.

## Folder layout

| Folder | Purpose | When to add |
|---|---|---|
| `recipes/` | Step-by-step **how to integrate X** guides — accounts, env vars, gotchas, go-live checklist. | After integrating something for the first or second time. |
| `standards/` | Doctrines and patterns I always follow. The "why we always do it this way" docs. | When I notice a pattern repeating across 2+ projects. |
| `learnings/` | One-off lessons, gotchas, or workarounds that don't fit a single recipe. | Whenever I waste time on something that future-me shouldn't. |
| `solutions/` | Documented past bug fixes, frontmatter-indexed (`module`, `tags`, `problem_type`). | After a non-trivial debugging session. |

## How to use with Claude

- **At project start:** point Claude at relevant `recipes/` and `standards/` files.
  > "Follow the dev-fallback pattern from `~/src/recipes/standards/dev-fallback-pattern.md`. Use the Stripe integration recipe at `~/src/recipes/recipes/stripe-integration.md`."
- **When something breaks:** check `solutions/` for prior fixes before re-debugging.
- **When something works:** capture the new gotcha into the relevant recipe / learning before context fades.

## Compounding rules

1. **Update on each reuse.** Every time you follow a recipe in a new project, edit it with anything new you learned. Recipes are living docs.
2. **Always include "what didn't work."** The gotcha section is the most valuable part — it's the thing that's painful to rediscover.
3. **Lead with the checklist.** Recipes end with a one-screen go-live checklist so future-you doesn't have to re-read prose.
4. **Reference between docs.** A recipe can say "follow `standards/webhook-contract.md`" — don't duplicate doctrine.
