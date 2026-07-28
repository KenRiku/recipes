# Expo Push Notifications — Credentials Setup Guide

Step-by-step for collecting every token, key, and JSON file needed to ship push notifications via Expo Push Service to iOS + Android, and where each one goes. Captured from setting up AroTaro's push pipeline. Implementation details (backend wiring, soft prompt UX, etc.) are out of scope — this recipe is purely "where do I get the values and where do I put them."

---

## What you need at a glance

| Credential | Required for | Where you get it | Where it goes |
|---|---|---|---|
| **`EXPO_ACCESS_TOKEN`** | Backend → Expo Push API auth | expo.dev personal access tokens page | Backend env vars (local `.env` + GitHub Actions secret) |
| **APN auth key (`.p8`)** | iOS push delivery (dev + prod) | Apple Developer → Keys | Uploaded to Expo via `eas credentials -p ios` (assign to BOTH dev + prod profiles) |
| **Apple Team ID** (10 chars) | Reference / occasional setup prompts | Apple Developer → Membership details | Usually nowhere — EAS stores it server-side once authed |
| **FCM service-account JSON** | Server-side (Expo → FCM) | Firebase Console → Project settings → Service accounts → Generate new private key | Uploaded to Expo via `eas credentials -p android` → **`Google Service Account`** option (NOT "Push Notifications (Legacy)" — that flow is dead) |
| **`google-services.json`** | Client-side (FCM SDK init on Android device) | Firebase Console → Project settings → Your apps → Android app → download | Place at `frontend/google-services.json` AND reference in `app.config.js` (`android.googleServicesFile`) |
| **EAS Project ID** | Frontend → `getExpoPushTokenAsync({ projectId })` | EAS dashboard or `app.config.js` → `extra.eas.projectId` | Already in `app.config.js` for any project bootstrapped via `eas init` |
| **Real device** | Testing | Physical iPhone or Android with Play Services | Cannot test in iOS simulator |

---

## 1. `EXPO_ACCESS_TOKEN`

Used by the **backend** to authenticate to the Expo Push API. Without it, requests are heavily rate-limited and may be silently dropped at scale.

### How to get it

1. Sign in to https://expo.dev.
2. Click your avatar → **Settings**.
3. Left sidebar → **Access tokens**.
4. **Create token** → name it (e.g. `arotaro-staging-push`), copy the value once. It's never shown again.

### Where it goes

| Environment | Location |
|---|---|
| Local dev | `<repo>/.env` → `EXPO_ACCESS_TOKEN=expo_token_value` (uncommented) |
| Staging | GitHub repo → Settings → Secrets and variables → Actions → **New repository secret** → name `EXPO_ACCESS_TOKEN` |
| Production | Same as staging. Reuse the secret name; the deploy workflow renders `.env` on the VM. |

### Notes

- One token works for both staging and production. Split into two if you want to revoke staging without disrupting prod.
- The deploy workflow (`.github/workflows/{staging,production}-deployment.yml`) needs an entry like `EXPO_ACCESS_TOKEN=${{ secrets.EXPO_ACCESS_TOKEN }}` inside the `cat > .env << EOF` heredoc on the Azure VM.
- Without it, the backend safely falls back to `LocalPushClient` (prints to logs, no real delivery) if `ENV` is `development` or empty.

---

## 2. APN auth key (`.p8`) — iOS

A single `.p8` key works for **both** APNs sandbox (dev) and APNs production. No need to create separate keys per environment.

### How to get it

1. Sign in to https://developer.apple.com.
2. **Certificates, Identifiers & Profiles** → **Keys** → click **+**.
3. Name it (e.g. `AroTaro APNs`), check **Apple Push Notifications service (APNs)**.
4. **Continue** → **Register** → **Download**. You get a `.p8` file. **Apple lets you download it once** — store it safely.
5. Note the **Key ID** (10 chars, shown next to the key) — EAS asks for it during upload.

### Where it goes

Upload to Expo:

```bash
cd frontend
eas credentials -p ios
```

- Pick **development** → **Push Notifications** → **Add a new push key** → upload the `.p8`, paste the Key ID, paste your Apple Team ID.
- Run `eas credentials -p ios` again → pick **production** → **Push Notifications** → **Use existing push key** → reuse the same `.p8` you just uploaded. Expo stores them once and lets you assign them to multiple build profiles.

### Notes

- For practice / dev testing, use the **development** EAS profile. Both profiles can (and should) reference the same `.p8`.
- The `aps-environment` entitlement in `app.config.js` flips between `development` and `production` automatically when keyed off `process.env.mode`. Apple uses this flag to pick which APNs server to hit; the key is the same.

---

## 3. Apple Team ID

10-character alphanumeric ID identifying your Apple developer team.

### How to get it

- **Apple Developer portal**: https://developer.apple.com/account → **Membership details** → **Team ID**.
- **Xcode**: Settings → Accounts → click your team → **Team ID**.
- **EAS CLI**: `eas credentials -p ios` prints it at the top once you've authenticated.
- **From an existing provisioning profile**: `security cms -D -i path/to/profile.mobileprovision | grep -A 1 TeamIdentifier`

### Where it goes

Usually nowhere in repo — EAS stores it after you authenticate during a build. Only add to `eas.json` (`submit.production.ios.appleTeamId`) if a tool explicitly asks.

---

## 4. FCM service-account JSON — Android (server-side)

Lets **Expo's push servers** authenticate to FCM on your behalf. Replaces the deprecated "Cloud Messaging API (Legacy)" / server key flow that Google killed in **June 2024**.

### How to get it

1. Open https://console.firebase.google.com → pick (or create) the AroTaro Firebase project. The project doesn't have to be wired to anything else; Expo only uses it for FCM credentials.
2. Add an Android app to the project: gear → **Project settings** → **General** → **Your apps** → **Add app** → Android.
   - **Android package name**: must match `app.config.js` → `android.package` (e.g. `com.arotaro.android`).
   - **App nickname**: any label.
   - You don't need to follow the SDK install steps that come next — just get the app registered.
3. **Project settings → Cloud Messaging tab** → confirm **Firebase Cloud Messaging API (V1)** is **Enabled**. For brand-new Firebase projects this is on by default; older projects may need to enable it via the linked Google Cloud Console page.
4. **Project settings → Service accounts tab** → **Generate new private key** → confirm. A `firebase-adminsdk-XXXX.json` downloads.

### Where it goes

Upload to Expo:

```bash
cd frontend
eas credentials -p android
```

- In the menu, pick **`Google Service Account`** (NOT "Push Notifications (Legacy)" — that's the dead path).
- Then **Service Account Key for Push Notifications (FCM V1)**.
- Point at the downloaded JSON.
- Repeat the menu for the **development** profile if EAS doesn't auto-share it.

### Notes

- One service-account JSON works for both staging and production unless you've split them into separate Firebase projects.
- Verify with `eas credentials -p android` again — should show "FCM V1 service account: configured."

---

## 5. `google-services.json` — Android (client-side)

The **Firebase Android SDK** reads this at app launch to call `FirebaseApp.initializeApp()`. **Without it, you get** `Default FirebaseApp is not initialized in this process` and push registration fails on Android. The service-account JSON above does NOT replace this — you need both.

iOS has no equivalent client config file; bundle id + entitlements + APN `.p8` are enough.

### How to get it

1. Firebase Console → your project → gear → **Project settings** → **General** tab.
2. **Your apps** → click the Android app you registered above.
3. Click **`google-services.json`** to download.

### Where it goes

Two parts:

**(a) Place the file:**
```
frontend/google-services.json
```

**(b) Reference it in `app.config.js`:**

```js
android: {
  // ... existing fields ...
  googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
},
```

Decide commit-or-not:

| Option | Tradeoff |
|---|---|
| **Commit `google-services.json`** | Simplest. Most teams do this. The file contains a Firebase project ID + a CLIENT API key (restricted by package name + signing cert) — not a server secret. |
| **Gitignore + EAS Secret** | Tighter. Add `frontend/google-services.json` to `.gitignore`, then `eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json`. EAS injects the file path at build time via the `process.env.GOOGLE_SERVICES_JSON` reference above. |

### Notes

- File contains the FCM **Sender ID** which the device uses to register with FCM. Distinct from the service-account JSON (server credential).
- The `app.config.js` line above supports either approach — local file fallback when env var isn't set.

---

## 6. EAS Project ID

Used in the frontend by `Notifications.getExpoPushTokenAsync({ projectId })`.

### How to get it

Already in `app.config.js`:

```js
extra: {
  eas: {
    projectId: "51f2c8d4-8597-48d6-8e57-e2c4a9b6ab03",
  },
},
```

If missing (e.g. brand-new project), `eas init` creates it. The Expo dashboard also shows it under each project's settings.

### Where it goes

Read at runtime via `Constants.expoConfig?.extra?.eas?.projectId`. Don't hardcode it elsewhere.

---

## Bundle ID and Android package name

Already configured for AroTaro:

- iOS bundle ID: `ai.arotaro.arotaro` (`app.config.js` → `ios.bundleIdentifier`)
- Android package: `com.arotaro.android` (`app.config.js` → `android.package`)

**These must match the values you registered in Apple Developer + Firebase Console.** A mismatch silently breaks token registration with no clear error.

---

## Setup checklist for a new project (or re-setup)

- [ ] Generate `EXPO_ACCESS_TOKEN` at expo.dev → store in `.env` + GitHub Actions secret
- [ ] Create APN `.p8` key in Apple Developer → upload via `eas credentials -p ios` → assign to BOTH `development` and `production` profiles
- [ ] Note Apple Team ID (usually only needed once, EAS caches it)
- [ ] Create Firebase project + add Android app (package name must match `app.config.js`)
- [ ] Enable FCM v1 API in Firebase project
- [ ] Generate service-account JSON → upload via `eas credentials -p android` → **Google Service Account** option
- [ ] Download `google-services.json` from Firebase → save to `frontend/google-services.json`
- [ ] Add `googleServicesFile` line to `app.config.js` `android` block
- [ ] Decide: commit `google-services.json` or upload as EAS Secret
- [ ] Bump `runtimeVersion` and `version` in `app.config.js` whenever you add native push deps (since `expo-notifications`, `expo-device` ship native code; iOS entitlement changes also count)
- [ ] Build a dev client: `eas build --profile development -p ios|android`
- [ ] Test on a real device

---

## Gotchas

- **Don't pick "Push Notifications (Legacy)" in `eas credentials -p android`.** That's the deprecated FCM Legacy server-key flow Google killed in June 2024. Use **Google Service Account** instead.
- **`google-services.json` is required even though you uploaded the service-account JSON to Expo.** They're two different credentials — server-side vs client-side. Missing the client file gives the cryptic `Default FirebaseApp is not initialized` error.
- **iOS simulator does not receive Expo Push.** Test on a real device only. Android emulators with Play Services do work but are flaky.
- **Bump `runtimeVersion` whenever you add native modules or change entitlements.** Otherwise old binaries on user devices receive a JS bundle that calls native modules they don't have → crash on launch.
- **Android < 13 auto-grants notification permission at install time.** No runtime popup. Android 13+ shows the OS dialog. Either way, push works once token registration completes.
- **`aps-environment` must flip between `"development"` and `"production"`.** Wire it via `process.env.mode === "production" ? "production" : "development"` in `app.config.js` so the EAS build profile decides which APNs server Expo proxies to.
- **APN `.p8` is environment-neutral.** A single key works for both dev and prod APNs servers. No need to generate two.
- **Mismatched bundle id / package name silently breaks registration.** The values in `app.config.js`, Apple Developer, and Firebase Console all need to match exactly.
- **Backend env var typo silently disables push.** If `EXPO_ACCESS_TOKEN` is missing or empty AND `ENV` is empty/dev, the backend falls back to `LocalPushClient` (prints to logs). Always confirm via `docker-compose logs celery` after restart that you see real Expo receipts, not `========== LOCAL PUSH ==========`.
