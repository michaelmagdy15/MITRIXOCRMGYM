# STRIKE CRM & Mobile App - Session Memory Log
**Version:** 1.1.0  
**Build Number:** 11  
**Last Updated:** July 7, 2026

---

## 1. App Icon & Version Configuration
* **Version Updates:** Bumped App version to `1.1.0`, iOS `buildNumber` to `11`, and Android `versionCode` to `11` in `mobile/app.json`, `mobile/package.json`, and root `package.json`. This prevents duplicate build errors when submitting to App Store Connect / Google Play Console.
* **App Icon Fix:** Saved and synced manually corrected **STRIKE** app icons (`icon.png` and `favicon.png`) in `mobile/assets/` to ensure the correct branding is compiled inside the binary.

---

## 2. Guest Portal Enhancements
* **Theme Switcher:** Added a Sun/Moon toggle button next to the Cart icon in the header of the `GuestPortal` component. Guests can now toggle between Light and Dark modes.
* **Label Update:** Renamed the navigation bar item from "Sign Up" to "Sign In" and replaced the default user icon with a `LogIn` icon.

---

## 3. Database Rules & API Proxy Fixes
* **User Migration Whitespace Fix:** Resolved login crash (`Error migrating user clientDocId/portalUserId`) by updating `isSafeUserSelfEdit()` and `clients` collection rules in `firestore.rules` to support whitespace-insensitive regex matching (e.g., `MEM-001 ` matching `MEM-001`).
* **Attendance Read Access:** Updated `/attendance` read rules to `allow read: if isAuthenticated();`, resolving the `permission-denied` error on `MemberHome.tsx` when computing public gym traffic statistics.
* **Vite API Proxy:** Configured Vite dev server in `vite.config.ts` to proxy all `/api` calls directly to the Express server running on port `8080`. This makes local development on port `5173` fully operational for push notifications.

---

## 4. Mobile Viewport & Navigation Locking
* **Sticky Layout Lock:** Changed the outer container of both `GuestPortal.tsx` and `MemberPortal.tsx` to `h-screen overflow-hidden` and added a scrollable container (`overflow-y-auto overscroll-contain`) on the `<main>` body in the middle. The top header and bottom navigation bar remain strictly locked in place, matching native app behaviors.

---

## 5. Checkout Login Streamlining
* **Top-Level Portal Dialog:** Moved the `<Checkout />` component to the root level inside `App.tsx` and removed it from `CartDrawer.tsx`. The checkout modal remains open during view unmounting when a guest user logs in.
* **Redirect Prevention:** Added a `useEffect` inside `App.tsx` that detects if the user logged in while `isCheckoutOpen` is active and retains their storefront view (`setClientViewMode('store')`) so they can complete payments directly.

---

## 6. Profile Evidence of Purchase
* **Pending Package Tracker:** Added a **"Pending Package Requests"** section to the user profile under the "Membership" sub-tab in `MemberPackages.tsx`. 
* When a user purchases a package, the app queries the `bookingRequests` collection for documents matching the client's ID with a `Pending` status, displaying a card stating **"Awaiting Payment"** with the order details and EGP price.

---

## 7. Premium Offline Capabilities
* **Offline Pill Banner:** Redesigned `OfflineBanner.tsx` with a premium glassmorphic top floating pill design, Lucide icons (`Wifi`, `WifiOff`), and slide-in animations.
* **Global App Integration:** Rendered `<OfflineBanner />` globally in `App.tsx` to notify users dynamically when they lose or regain connectivity.

---

## 8. WebView Cache-Busting (App Store Fix without App Update)
* **Aggressive WebView Caching Issue:** Resolved the issue where the App Store app loaded empty states ("Packages Coming Soon" and 0 sessions) by caching an old copy of `index.html` (e.g. from local developer testing or old database routes) that connected to the wrong or empty fallback database.
* **Inline Cache-Buster Script:** Injected a lightweight inline script inside the `<head>` of [index.html](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/index.html) that detects the mobile app WebView (via custom User-Agent `mitrixogymcrmCRM-Mobile`) and automatically redirects to `?cb=<timestamp>` if the cache-buster is missing.
* **No App Store Release Required:** This is a purely web-side fix. Staged and committed changes locally. Once pushed and deployed to Google Cloud Run, it will instantly force existing App Store app installations to bypass cache and load the latest configuration.

---

### Rebuilding & Publishing Instructions
To generate the new App Store/Google Play binaries:
1. Navigate to the mobile directory: `cd mobile`
2. Trigger EAS Cloud Build: `eas build --platform all` (or `--platform ios` / `--platform android`)
3. EAS will build with version `1.1.0` and build number `11`. Once finished, run your GitHub actions workflow or submit the `.ipa`/`.aab` directly to App Store Connect and Google Play Console.
