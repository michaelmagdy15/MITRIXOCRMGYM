# TENANTS.md — MitrixoGYM CRM Tenant Configuration

**Last updated:** 2026-08-18

---

## Active Tenants

### 1. Strike (strike) — Dedicated Standalone Project

**Dedicated GCP & Firebase Project:** `strike-production-f5242`
**Ownership:** Client-owned GCP account (100% data, privacy, and billing ownership).

**Domains:**
- `strike-egy.com` (Primary production domain — live on Firebase Hosting)
- `www.strike-egy.com` (Redirects to strike-egy.com)
- `strike-production-f5242.web.app` (Firebase default hosting URL)
- `dashboard.strikeboxing-eg.pro` (Secondary custom domain)
- `strike.mitrixo.com` (Legacy central subdomain fallback)

**Firestore Database:** `(default)` in project `strike-production-f5242` (location: `eur3` Europe multi-region).
**Cloud Storage:** `gs://strike-production-f5242.firebasestorage.app`
**Authentication:** Dedicated Firebase Auth (`1,152` members, `33` staff/coaches with SCRYPT hashes).
**CI/CD Pipeline:** Automated continuous deployment from unified `master` via `.github/workflows/deploy-strike-dedicated.yml`.

**Tenant ID:** `strike`

**Branding:**
- Default company name: STRIKE
- Email branding fallback: "STRIKE" (see mailer.ts)
- Logo & Splash: Uploaded in Cloud Storage `branding/`

**Notes:** Strike Boxing Club is 100% isolated in its dedicated GCP environment while continuously receiving all platform upgrades and fixes directly from this codebase.

---

### 2. Inzan Athletics (inzanathletics)

**Domains:**
- `admin.inzanathletics.com` (Primary CRM Dashboard)
- `inzanathletics.mitrixo.com`
- `inzanathletics.com` (Reserved for public website landing page; does NOT route to CRM dashboard)
- `www.inzanathletics.com` (Reserved for public website landing page)

**Firestore Database:** `db-inzanathletics`

**Tenant ID:** `inzanathletics`

**Branding:**
- Default company name: Inzan Athletics
- No special email branding override

**Notes:** This is the Inzan Athletics fitness tenant. The CRM dashboard is hosted on `admin.inzanathletics.com`, while `inzanathletics.com` serves the gym's public website landing page.

---

## Local Development Tenants

| Domain | Project | Tenant ID | Purpose |
|---|---|---|---|
| `localhost` | mitrixogymcrm (default) | test | Local dev testing |
| `mitrixogymcrm-boxing.local` | mitrixogymcrm-boxing-tenant-1 | mitrixogymcrm-boxing | Boxing variant dev |
| `other-gym.local` | other-gym-tenant-2 | other-gym | Other gym variant dev |

---

## Reserved Subdomains

These can NEVER be provisioned as tenants:

```
strike, strikeboxing, dashboard, superadmin, admin,
www, api, app, test, staging, dev, mail, smtp,
ftp, cdn, static, assets, mitrixo, default, registry
```

---

## Adding a New Tenant

1. **Add domain mapping in server.ts:**
   ```typescript
   const tenantConfigs: Record<string, any> = {
     // ... existing tenants
     "newtenant.mitrixo.com": {
       ...defaultFirebaseConfig,
       projectId: "new-tenant-project-id",
       tenantId: "newtenant"
     },
   };
   ```

2. **Create Firestore database** for the new tenant in Firebase console.

3. **Add tenant in TENANTS.md** documentation.

4. **Run provisioning** to set up initial data:
   - Branding document with empty logoUrl
   - Default branches
   - Default feature flags

---

## Tenant Data Isolation

Each tenant's data is isolated by:
- **Firestore database** — each tenant has its own database (or uses default)
- **Hostname-based routing** — `getTenantId()` derives tenant from request hostname
- **getDbForRequest(req)** — returns the correct Firestore database for the tenant

**IMPORTANT:** Every Firestore query MUST use `getDbForRequest(req)` to ensure tenant isolation. Queries without tenant context are a security vulnerability.

---

## Branding Defaults

When a new tenant is provisioned:
- `companyName`: set to tenant name provided during signup
- `logoUrl`: empty string (tenant must upload their own logo)
- `currencyCode`: EGP
- `currencySymbol`: LE
- `kioskPin`: empty
- `dailyCheckinPin`: empty
- `brandAccentColor`: #1a1a1a (Onyx)

---

## Email Branding

Email templates (functions/src/utils/mailer.ts) handle branding:
- Company name fallback: "mitrixogymcrm" → "STRIKE"
- Logo URL fallback: if not set, uses https://strike-egy.com/strikelogo.png for Strike tenant

## Contracts and Inzan appearance (2026-09-23)

Contract assets are explicitly mapped in src/config/contractTemplates.ts. Strike keeps its existing agreement; Inzan uses public/contracts/inzan-membership.pdf. Unknown tenants require their own template configuration. Inzan uses a fixed black/charcoal palette in the CRM, member/coach portals and Expo shell. See docs/TENANT_CONTRACTS_AND_THEME.md.
