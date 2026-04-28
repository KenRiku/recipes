# Solutions — Documented Past Bug Fixes

Frontmatter-indexed archive of debugging sessions. Each file captures a single problem, the investigation, and the fix.

## When to add a solution

After any debugging session that took more than ~30 minutes. The whole point is so future-you doesn't pay the same cost twice.

## File format

```markdown
---
date: YYYY-MM-DD
module: <component / lib / system area>
tags: [tag1, tag2, tag3]
problem_type: bug | misconfig | infra | data | perf
related_recipe: <recipe-name>   # optional
---

# <Short title — one line>

## Problem
What broke. Reproduction steps. Error messages.

## Root cause
What was actually wrong (after investigation, not the first guess).

## Fix
The change that resolved it. Code diff or config change.

## How to detect next time
Symptoms / log lines / error messages that point at this same root cause.
```

## Querying

`grep -r 'tags:.*stripe' .` or use the `compound-engineering:research:learnings-researcher` agent which reads frontmatter.
