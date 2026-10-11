# Osrah Android

Native Java client for the local Node/SQLite API. Version 0.2 includes behavior-based recommendations, constrained natural-language search, availability, scheduled demo orders, family/admin dashboards, and family approval.

## Build

Open this directory in Android Studio. Use SDK 36, Android Gradle Plugin 8.13.2, Gradle 8.13, and Java 17. Install/configure Java 17 independently; a local JDK and SDK are not distributed with this repository.

```powershell
./gradlew.bat :app:assembleDebug
```

Set JAVA_HOME to Java 17 and ANDROID_HOME to the SDK for terminal builds. Output: `app/build/outputs/apk/debug/app-debug.apk`.

## Explore

Run `node server.js --demo` from the repository root. The emulator uses `http://10.0.2.2:3000`. For a USB phone, run `adb reverse tcp:3000 tcp:3000` and set `http://127.0.0.1:3000` in Settings → Developer connection settings.

- **Account → Try a demo account**: compare customers, families, and the administrator. No password is needed for fictional accounts in explicitly enabled local demo mode.
- **Discover**: try `أبي هدية بأقل من مئة ريال` or `أبي جريش في الرياض`. Recommendations adapt to behavior; search never broadens constraints.
- **Cart → Checkout**: choose one of the family's available times, then pay online through Tap's secure hosted page or select cash on receipt. Online methods depend on the merchant account and device; Android wallet is Google Pay. In the local demo, no payment is charged.
- **Family account → Manage working hours**: set weekly hours and exceptions. Changes affect future requests, not existing commitments.
- **Family/admin account → Insights dashboard**: past performance and rough forecasts. Customer accounts have no dashboard access.
- **Settings → App language**: Arabic/English. Language controls do not appear on the home screen.

Sessions are in memory and require sign-in after app restart. Guest behavior is scoped to an installation identifier, signed-in behavior to its own account. Demo activity and orders persist server-side. The reviewed dataset is in `../demo/proposed-data.json`.

Live payment activation requires Tap merchant credentials and a public HTTPS server; see `../payments.env.example` and the payment setup notes in the root README. Never put the Tap secret key in the app. Reviews, real product photography, production deployment, and Play Store signing remain future work. Forecasts are historical averages, not a validated machine-learning model.
