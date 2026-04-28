# Learning — Recharts ResponsiveContainer 99% Trick

## Symptom

Pie charts (and other Recharts charts) inside a flex/grid container cause horizontal page overflow on mobile. The chart card extends past the viewport, dragging the rest of the layout with it.

## Cause

`ResponsiveContainer width="100%"` measures its parent on first paint and writes back its computed width. In flex/grid contexts where the parent's width depends on its children, this creates a feedback loop: the container thinks the parent is wider than it actually is, and the parent grows to match.

## Fix

Use `width="99%"` instead of `100%`. The 1% difference is invisible but breaks the feedback loop because Recharts no longer tries to fill exactly the parent's width.

```tsx
<ResponsiveContainer width="99%" height={240}>
  <PieChart>...</PieChart>
</ResponsiveContainer>
```

Also helpful in the same kind of scenarios:
- Wrap in `<div className="w-full min-w-0 overflow-hidden">`
- Add `min-w-0` to grid columns containing the chart (default `min-width: auto` prevents shrinking below content size)

## Reference

- Recharts issue thread: https://github.com/recharts/recharts/issues/172 (and many duplicates)
