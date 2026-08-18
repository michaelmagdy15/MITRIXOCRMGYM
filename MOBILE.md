# MOBILE.md — MitrixoGYM CRM Mobile App Guide

**App Name:** STRIKE  
**Bundle ID (iOS):** com.mitrixogymcrmboxing.crm  
**Package (Android):** com.mitrixogymcrmboxing.crm  
**EAS Project ID:** 91ff5ffa-407c-49c6-9a0e-c1edc54db1fb  
**App Store ID:** 6782686771  
**Last Updated:** 2026-08-18

---

## 1. Current Status

| Platform | Status | Notes |
|---|---|---|
| **iOS App Store** | ✅ Published | Version 1.12.0, Build 15 |
| **Android Play Console** | ⏳ Pending | Same package name, build when ready |
| **WebView Wrapper** | ✅ Active | Custom user-agent: `mitrixogymcrmCRM-Mobile` |

---

## 2. App Architecture

The mobile app is a **React Native / Expo WebView wrapper** that loads the web CRM inside a native shell:

- **Frontend:** The main CRM web app (this repository) deployed to `https://strike-egy.com`
- **Shell:** Expo/React Native app built with EAS Build
- **WebView:** Native WebView component loading the web app URL
- **Deep Linking:** Custom URL scheme `strike-eg://` configured

### Cache-Busting Mechanism

The web app detects the mobile WebView via User-Agent (`mitrixogymcrmCRM-Mobile`) and automatically appends a cache-buster query parameter to prevent stale cached content:

```javascript
// In index.html <head>
if (/mitrixogymcrmCRM-Mobile/i.test(navigator.userAgent)) {
  if (!location.search.includes('cb=')) {
    location.replace(location.pathname + '?cb=' + Date.now());
  }
}
```

---

## 3. EAS Build Configuration

**File:** `mobile/eas.json`

### Build Profiles

| Profile | Purpose | Command |
|---|---|---|
| `development` | Local dev with dev client | `eas build --profile development --platform all` |
| `preview` | Internal testing | `eas build --profile preview --platform all` |
| `production` | Generic production build | `eas build --profile production --platform all` |
| `production-strike` | STRIKE tenant production | `eas build --profile production-strike --platform all` |
| `production-strikeboxing` | STRIKE Boxing production | `eas build --profile production-strikeboxing --platform all` |

### Environment Variables per Profile

**production-strike:**
- `GYM_SUBDOMAIN`: strike
- `APP_NAME`: STRIKE
- `PRODUCTION_URL`: https://strike-egy.com

**production-strikeboxing:**
- `GYM_SUBDOMAIN`: strikeboxing
- `APP_NAME`: STRIKE
- `PRODUCTION_URL`: https://strike-egy.com

---

## 4. Building & Publishing

### Prerequisites

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Configure credentials (first time only)
eas credentials --platform ios
eas credentials --platform android
```

### iOS Build & Submit

```bash
cd mobile

# Build for iOS (App Store)
eas build --profile production-strike --platform ios

# Submit to App Store Connect
eas submit --profile production-strike --platform ios --latest
```

### Android Build & Submit

```bash
cd mobile

# Build for Android (Play Console)
eas build --profile production-strike --platform android

# Submit to Play Console (when ready)
eas submit --profile production-strike --platform android --latest
```

### Manual APK for Testing

```bash
eas build --profile production-strike --platform android --local
```

---

## 5. App Configuration

**File:** `mobile/app.json`

### Key Settings

```json
{
  "expo": {
    "name": "STRIKE",
    "slug": "strike-eg",
    "scheme": "strike-eg",
    "version": "1.12.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "ios": {
      "bundleIdentifier": "com.mitrixogymcrmboxing.crm",
      "buildNumber": "15"
    },
    "android": {
      "package": "com.mitrixogymcrmboxing.crm",
      "versionCode": 15
    }
  }
}
```

### Updating Version

To bump the version for a new release:

1. Update `mobile/app.json`:
   - Bump `version` (e.g., `1.12.0` → `1.12.1`)
   - Bump `ios.buildNumber` (e.g., `15` → `16`)
   - Bump `android.versionCode` (e.g., `15` → `16`)

2. Commit and push

3. Rebuild with EAS

---

## 6. Web App URL Configuration

The mobile app loads the web CRM from:

| Tenant | URL | EAS Profile |
|---|---|---|
| STRIKE | https://strike-egy.com | production-strike |
| STRIKE Boxing | https://strike-egy.com | production-strikeboxing |

The URL is configured via `PRODUCTION_URL` environment variable in EAS build.

---

## 7. Push Notifications

Push notifications are configured via:

- **iOS:** APNs with Expo Notifications
- **Android:** FCM with Expo Notifications
- **Icons:** `mobile/assets/android-icon-monochrome.png`

The CRM server proxies push notifications to Expo's Push Service:

```typescript
// In server.ts - /api/proxy-push endpoint
app.post("/api/proxy-push", requireAuth, async (req, res) => {
  // Proxies push tokens to Expo Push Service
});
```

---

## 8. Known Mobile-Specific Issues

### WebView Cache Issues
- **Problem:** App Store app loads stale cached content
- **Fix:** Cache-busting script in `index.html` detects mobile WebView and forces fresh load

### Camera Permissions
- **Purpose:** QR code scanning for member attendance
- **Info.plist keys:** `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`

### Non-Exempt Encryption
- `ITSAppUsesNonExemptEncryption: false` set in Info.plist (required for App Store)

---

## 9. Future Enhancements

| Enhancement | Priority | Status |
|---|---|---|
| Android Play Console publication | High | Pending |
| Native iOS/Android features (notifications, camera) | Medium | Partial |
| Background sync | Medium | Not started |
| Offline mode improvements | Medium | Basic offline banner only |

---

## 10. Troubleshooting

### App Shows "Packages Coming Soon" / Empty Data
This is usually a WebView caching issue. Deploy the web app to Cloud Run and the cache-busting script will force a fresh load.

### Build Fails with "Duplicate Build Number"
Bump the `buildNumber` in `app.json` and try again.

### Push Notifications Not Working
1. Verify EAS credentials are up to date: `eas credentials`
2. Check the device push token is being sent to `/api/proxy-push`
3. Verify Expo project ID is correct in `app.json`

---

## 11. Relevant Files

| File | Purpose |
|---|---|
| `mobile/app.json` | Expo app configuration |
| `mobile/eas.json` | EAS Build profiles |
| `mobile/App.js` | React Native app entry point |
| `mobile/assets/` | App icons and splash screens |
| `index.html` | Web app entry (contains WebView cache-busting) |
| `server.ts` | Push notification proxy endpoint |
