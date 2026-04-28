# Learning — Flex Justify-Between Overflow on Mobile

## Symptom

A `flex justify-between` row with text on both sides overflows on narrow screens. The right-hand element gets clipped off the edge of its container, and sometimes pushes the entire page wider than the viewport (causing horizontal scroll).

## Cause

Flex items default to `min-width: auto`, which means they refuse to shrink below their intrinsic content size. With two text spans + `justify-between` + no wrap, when total width exceeds the parent, the right span has nowhere to go and overflows.

## Fix

Three options, in increasing strength:

1. **`flex-wrap`** — the right span drops to a new line on narrow screens. Best for label / value pairs where stacking is acceptable.
   ```tsx
   <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
   ```

2. **`min-w-0` + `truncate`** — children can shrink past intrinsic content size, with ellipsis. Best for table-row-like layouts.
   ```tsx
   <div className="flex items-center min-w-0">
     <span className="flex-1 min-w-0 truncate">{long}</span>
     <span className="flex-shrink-0">{short}</span>
   </div>
   ```

3. **`flex-col sm:flex-row`** — fully stack on mobile. Best for header-like rows with title + action button.
   ```tsx
   <div className="flex flex-col sm:flex-row sm:items-center gap-2">
   ```

## Defensive global fix

When you're not sure where the overflow is coming from, add `overflow-x-hidden` to the layout root and `min-w-0` to grid children. This contains the symptom while you find the cause.
