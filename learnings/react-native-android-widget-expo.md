# Learning — react-native-android-widget on Expo (deep links, glyphs, height-agnostic layout)

Building an Android home-screen widget with `react-native-android-widget` (v0.21.x) on Expo SDK 57 /
RN 0.86 (New Arch). Widget UI is authored in JSX and rendered to Android **RemoteViews** via a headless
JS task — so it's *not* a normal React tree (no react-native-svg, no core RN components inside it).

## Setup essentials

- Add the config plugin with a **`widgets` block** (name/label/minWidth/minHeight/targetCell.../previewImage/
  resizeMode). The plugin **fails `expo prebuild` if `widgets` is missing** — a bare `"react-native-android-widget"`
  string isn't enough once you actually use it.
- Register the task handler in a **custom entry** and point `package.json` `main` at it:
  ```js
  // index.js
  import 'expo-router/entry';
  import { registerWidgetTaskHandler } from 'react-native-android-widget';
  import { widgetTaskHandler } from './src/widgets/widget-task-handler';
  registerWidgetTaskHandler(widgetTaskHandler);
  ```
- If `reactCompiler` is enabled, add `'use no memo';` to widget component + handler files (the lib warns the
  React Compiler is incompatible with the widget render path).

## Tap → open a deep link from COLD (the important one)

Don't handle the tap in JS. Use the library's built-in native click action:

```tsx
<FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: `myapp://card/${id}` }} ... />
```

`OPEN_URI` is handled natively, so the tap launches the deep link even when the app is not running — no
headless JS navigation, minimal latency. Make sure the app's `scheme` matches and the route exists
(expo-router file route). `prebuild` wires the widget `receiver` + collection service + scheme into
`AndroidManifest.xml` automatically.

## Render your app's glyphs in the widget

The widget can't use `react-native-svg`. Use **`SvgWidget` with a raw SVG *string***:

```tsx
<SvgWidget svg={'<svg viewBox="0 0 24 24" ...>...</svg>'} style={{ width, height }} />
```

Keep a string version of each icon (fill/stroke via a `{C}` placeholder you replace with the color). Widget
`backgroundColor` needs **hex** (`#RRGGBB` / `#AARRGGBB`), not `hsl()` — convert first.

## Height-agnostic vertical centering (the subtle bug)

Widgets get placed at wildly different heights (a custom launcher 1-row can be ~34–50dp; OneUI 1-row is
~104dp). A **fixed disc/icon size larger than the widget height overflows and can't center** — content gets
shoved to an edge (e.g. label touching the bottom border).

Fix: the headless task receives `props.widgetInfo.height` (and `requestWidgetUpdate`'s `renderWidget` gets
`WidgetInfo` per placed instance). **Size the content to the available height, and always leave SLACK** so the
content is strictly smaller than the widget — then flexbox centering keeps it centered at any size. Drop labels
automatically when there isn't room. Estimate the label line height generously (~18dp for ~11sp text incl.
Android font padding); underestimating makes content overflow and mis-center.

## Corners

Android 12+/OneUI clips the widget's outer frame to a **system corner radius**. If your content background
uses a *larger* radius, the two fight and corners look uneven (worse top-vs-bottom due to widget insets). Keep
your own `borderRadius` small (≈16) and let the launcher's clip be the only rounding.

## Refresh model

`updatePeriodMillis: 0` = no periodic refresh (saves battery). The placed widget only re-renders when you call
`requestWidgetUpdate({ widgetName, renderWidget, widgetNotFound })` — do it after every data/appearance change
(add/favorite/delete/reorder/settings). During dev, a placed widget won't pick up new JS until one of those
fires (or it's re-added/resized).

## Verify without hunting on the home screen

`WidgetPreview` renders the real widget bitmap **inside the app** — drop it in a settings screen sized to a
short height to eyeball layout/centering live as settings change. Much faster than placing/resizing on the
launcher.
