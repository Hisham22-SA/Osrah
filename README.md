# Osrah

Native Android prototype for Saudi productive families. Node.js 24 and SQLite provide the local API and persistent storage. This repository contains the current native Java Android prototype and local backend. It does not contain an earlier Flutter implementation.

## Run the approved demo

```powershell
node server.js --demo
```

The first demo launch imports the reviewed `demo/proposed-data.json` atomically and once only. A separate idempotent catalog update adds six Saudi dishes and clarifies the jareesh and marqooq names, for 36 demo products total. Later launches preserve changes. The demo includes 10 families, 10 customers, 60 behavior events, and 60 historical orders. A separate fictional administrator, **مشرف التجربة**, supports testing the admin dashboard. Existing records remain; the superseded original sample seller is hidden. Local databases and backups are not included; demo mode creates a fresh database from the synthetic dataset.

Open `android/` in Android Studio and build the debug app; install the generated `android/app/build/outputs/apk/debug/app-debug.apk`. Use Java 17 and Android SDK 36. Emulator API address: `http://10.0.2.2:3000`. For a USB phone use `adb reverse tcp:3000 tcp:3000` and set the app's developer connection address to `http://127.0.0.1:3000`.

In **Account → Try a demo account**, select a customer, family, or the administrator. This feature is for the debug app and explicitly enabled local demo server only. Demo passwords are random and are not exposed. The demo login endpoint is disabled outside demo mode and restricted to loopback connections. Keep this prototype server local.

## Implemented

- Arabic/English UI, RTL layout, and persistent language choice inside Settings.
- Natural-language search using a local deterministic parser: known product words, gift intent, supported cities, numerical budgets/ranges, and common Arabic number words. Example: `أبي هدية بأقل من مئة ريال`. Unknown or unrecognized restrictions return no matching results; constraints are never relaxed to display alternatives.
- **Recommended for you** and personalized search ordering. Uses searches, product views, recommendation clicks, cart-intent interactions, and purchases. Signed-in histories are scoped to the user; guest histories use a persistent random installation identifier. Explicit budgets and regions filter before ranking. A new visitor browses without onboarding questions.
- Public family weekly hours and date exceptions, in Saudi time. Families configure them after registration and edit them from Account.
- Single-product scheduled demo orders, submitted outside working hours for a later available slot. Validates preparation lead time, dates, stock, and exceptions. Reserves inventory transactionally. Payments are simulated; no card data or actual charges.
- Checkout offers cash on receipt or secure Tap-hosted online checkout. The online page shows merchant-enabled cards/Mada, Google Pay, STC Pay, and other supported methods. Orders stay unpaid until the server verifies the charge directly with Tap; failed charges cancel the pending order and release stock. Apple Pay is for Apple devices; Google Pay is the Android wallet option.
- Customer/family order lists and forward family status transitions: pending → preparing → ready → delivered.
- Role-protected family/admin dashboards: weekly orders/revenue, prior-week comparisons, top products, busy fulfillment hours, and low-confidence next-week demand/revenue/product/hour projections based on trailing averages. Observations do not claim causal explanations. Sparse histories suppress forecasts. Families see their own orders only.
- Administrative family approval and suspension.
- Password hashing, session expiration, and Android quoted-session-cookie support.

## Demo analysis date

The historical sample dashboard uses October 10, 2026 until new orders are created, displaying the reference date in Saudi time. On a new order it uses actual current time. Forecasts and revenue from sample orders are labeled synthetic.

## Validation

```powershell
node --test
```

Six test groups cover intent parsing, strict empty results, ranking, time boundaries/exceptions, sparse analytics, idempotent import, roles, family isolation, approval, quoted Android cookies, stock rollback, and status transitions. Prior development included Android debug compilation and emulator checks; build outputs are not included in this source package. See `android/README.md` for build instructions.

## Limits

The local engine is rules and scoring, not a trained language model. English product aliases cover selected sample words; Saudi city aliases are supported. Approved sample product text remains Arabic. Forecasts are rough averages without seasonality, capacity modeling, or validated predictive accuracy. Product pictures remain placeholders. Working windows do not cross midnight; exceptions support one window per date.

Live payments require a Tap merchant account, activated payment methods, server-side secret key, and a public HTTPS deployment. Never put the secret key in the Android app. The local demo has no credentials and never charges money; online checkout is simulated there. Cash checkout works in the local demo. New online orders on a deployed server require `TAP_SECRET_KEY` and `OSRAH_PUBLIC_URL`; use Tap test keys before live keys. The server return path is `/payment-return` and the payment notification path is `/api/payments/tap/callback`. The Tap account must enable the payment methods the store wants to display. The earlier web client remains a development preview without all new Android features.
# Family license review

Family registration also requires a pickup address, latitude/longitude, and an explicit delivery-driver yes/no selection. Families can update these from Account. Approved family locations are public pickup locations. Customer GPS is used only on-device for approximate direct distances and nearest sorting; it is not sent to the server or saved. Location permission is optional, and browsing continues if denied. Missing family pins sort last. Map links open the selected pin in an installed maps application. Demo pins are fictional and labeled accordingly. Orders support pickup or delivery by the family's own driver; delivery requires an address and is rejected server-side when that family has no driver. Osrah does not dispatch drivers. No route distance, delivery fee calculation, service-radius enforcement, or live driver tracking is provided in this version.

New family registrations require mobile number, city, license number, expiry date, and a PDF/PNG/JPEG attachment up to 3 MB. Applications remain pending until an administrator reviews their details and attachment. Rejection requires a reason; families can update and resubmit. Existing families without attachments can submit from Account. Passwords are never included in the administrator response. Attachments remain in the local SQLite database and are available only through the administrator application endpoint. File type/size and expiry checks do not verify the legal authenticity of a license; the administrator reviews it manually. Existing approved demo accounts remain synthetic examples without real licenses.

