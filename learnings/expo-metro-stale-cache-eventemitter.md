# Learning — Expo/RN "runtime not ready: EventEmitter of undefined" = stale Metro bundle

## Symptom

The app red-boxes at load with:

```
[runtime not ready]: TypeError: Cannot read property 'EventEmitter' of undefined
  at loadModuleImplementation / guardedLoadModule / metroRequire ...
```

The React runtime is destroyed on load (`ReactHost ... raiseSoftException ... ReactInstance task
returned null`) and **a plain reload (RR) does not fix it** — it keeps crashing on every load. TypeScript
is clean and none of your changed files have top-level side effects.

Often accompanied by other weirdness that regenerated at the same time, e.g. expo-router's typed-routes
`.expo/types/router.d.ts` containing a phantom/garbage route entry.

## Cause

A **desynced Metro bundle / transformer cache** — not a code bug. It tends to happen after **fast-refreshing
many files at once**, especially modules that are loaded at the entry point (on Expo SDK 57 / RN 0.86 New
Arch this bit us with `react-native-android-widget`'s headless task registered in a custom `index.js`, plus a
newly-added SQLite table). Metro serves a partial/incoherent module registry, so a core native module resolves
to `undefined` and the first `X.EventEmitter` access throws.

## Fix

Restart Metro with a cleared cache, then fully reload the app:

```bash
# stop the running Metro (kill the process on 8081), then:
npx expo start --dev-client --port 8081 --clear
```

Reconnect the dev client (over USB): `adb reverse tcp:8081 tcp:8081` then relaunch via the
`exp+<slug>://expo-development-client/?url=http://localhost:8081` deep link.

## Rule of thumb

If you see `EventEmitter of undefined` / `runtime not ready` and a plain reload doesn't clear it, **don't
bisect your code first** — restart Metro with `--clear`. Only if a clean bundle still crashes is it a real code
problem. Batching many edits before a single reload makes this more likely; reload more often, or expect a
`--clear` after big multi-file sweeps.
