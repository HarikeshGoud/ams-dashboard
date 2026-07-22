# Building the SHC Technician Android app (.apk / .aab)

The technician site is a full PWA (manifest + service worker + HTTPS), so it can be
wrapped into a real Android app using a **Trusted Web Activity (TWA)** — a thin native
shell that opens `https://shc.riksu.co/employee` full-screen with **no browser bar**.

## App identity
- **Package name (App ID):** `co.riksu.shc.twa`
- **App name:** SHC Technician  ·  **Launch URL:** `https://shc.riksu.co/employee`
- Digital Asset Links file is served at: `https://shc.riksu.co/.well-known/assetlinks.json`

## Easiest route — PWABuilder (no tools, ~10 min)
1. Go to <https://www.pwabuilder.com> and enter `https://shc.riksu.co`.
2. Click **Package for stores → Android**.
3. Set **Package ID** = `co.riksu.shc.twa` (must match `assetlinks.json`).
   - For direct sharing (sideload): download the **APK** + the **signing key** (keep it safe — you need the same key for every future update).
   - For Google Play: download the **AAB** (Play requires a $25 one-time Google Play Developer account).
4. PWABuilder shows a **SHA-256 fingerprint** for the signing key. Put it into
   `frontend/public/.well-known/assetlinks.json` (replace the placeholder), then redeploy
   (push to `master`). This makes the app open with no browser bar.
   - For Google Play, ALSO add the fingerprint from *Play Console → App integrity → App signing*.
5. Install the APK on an Android phone (enable "install from unknown sources" for sideload),
   or publish the AAB to Play. iPhone users keep using "Add to Home Screen" (Apple has no APK).

## Alternative — build locally with Bubblewrap
Requires JDK 17 + Android SDK. `npm i -g @bubblewrap/cli`, then `bubblewrap init
--manifest https://shc.riksu.co/manifest.json`, set the App ID to `co.riksu.shc.twa`, then
`bubblewrap build`. Paste the resulting fingerprint into `assetlinks.json` as above.

## Updating the app later
The APK is only a shell around the live website — every change you deploy to `shc.riksu.co`
shows up in the app instantly. You only rebuild/republish the APK if the app name, icon,
or package ID changes.
