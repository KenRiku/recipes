---
date: 2026-07-19
module: android-gradle-build
tags: [react-native, expo, android, gradle, ninja, windows, release-apk, reanimated]
problem_type: infra
---

# RN Android `assembleRelease` fails on Windows: lint Metaspace + ninja "build.ninja still dirty"

## Problem

Building a release APK (`gradlew assembleRelease`) for an Expo SDK 57 / RN 0.86 app on Windows
failed three different ways, while `expo run:android` (debug) built fine on the same machine:

1. `:react-native-screens:lintVitalAnalyzeRelease` → `A failure occurred ... Metaspace`
2. `:react-native-reanimated` C++ build → `ninja: error: manifest 'build.ninja' still dirty after 100 tries`
   (CMake regen loop: "Re-checking globbed directories... Re-running CMake..." forever)
3. (during workarounds) subst-drive builds broke autolinking/codegen — see dead ends below.

## Root cause

Two independent issues:

- **Lint Metaspace**: Expo template default `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m`
  is too small for `lintVitalAnalyzeRelease` across a large RN dependency graph. (Release-only:
  lintVital doesn't run on debug builds.)
- **Ninja dirty loop**: the Android SDK's CMake 3.22.1 bundles **ninja 1.10.2**, which mishandles
  long Windows paths when restat-ing `build.ninja`. Release builds use variant dir `RelWithDebInfo`
  (longer than `Debug`) inside `node_modules\<lib>\android\.cxx\...` — just enough extra length to
  trip it. That's why debug built and release looped. Reanimated's own docs call this out and
  require **ninja ≥ 1.12**: https://docs.swmansion.com/react-native-reanimated/docs/guides/building-on-windows/

## Fix

1. `android/gradle.properties`:
   `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m` (then `gradlew --stop` so the daemon restarts).
2. Replace the SDK's bundled ninja with 1.13.x (keep a backup):
   - Download `ninja-win.zip` from https://github.com/ninja-build/ninja/releases
   - In `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\`: rename `ninja.exe` → `ninja-1.10.2.exe.bak`, drop in the new `ninja.exe`.
   - NOTE: re-installing/updating the `cmake;3.22.1` SDK package will silently restore old ninja.
3. Delete every stale `.cxx` dir before rebuilding (`node_modules\*\android\.cxx`, `android\app\.cxx`).
4. `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (arm64-only ≈ quarters the C++ work
   for a personal-device APK).

### Dead ends (don't retry these)

- Deleting only reanimated's `.cxx` — loop comes right back; the ninja binary is the problem.
- `subst X: <project>` to shorten paths (reanimated docs suggest it) — fails twice over in an Expo app:
  - project at drive root: `expo-modules-autolinking` walk-up never checks the drive root itself → `Couldn't find "package.json" up from path "X:\android"`.
  - project one level down: RN codegen resolves paths through Node's `realpath`, which canonicalizes
    the subst drive back to `C:\...` → Gradle `this and base files have different roots`.
  Windows `LongPathsEnabled=1` does NOT help; ninja 1.10 is broken regardless.

## How to detect next time

- `Metaspace` in a `lintVital*` task → bump jvmargs (fix 1).
- `manifest 'build.ninja' still dirty after 100 tries` + endless "Re-running CMake" → old ninja +
  long paths (fix 2), especially when debug builds fine and only release loops.
- `Couldn't find "package.json" up from path` or `different roots` during Gradle settings/codegen →
  you're building through a subst drive; stop.
