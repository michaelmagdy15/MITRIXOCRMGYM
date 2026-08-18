# TENANTS.md — MitrixoGYM CRM Tenant Configuration

**Last updated:** 2026-08-18

---

## Active Tenants

### 1. Strike (strike)

**Domains:**
- `strike.mitrixo.com`
- `strikeboxing.mitrixo.com`
- `dashboard.strikeboxing-eg.pro`

**Firestore Database:** Default (no specific database ID — uses `(default)`)

**Tenant ID:** `strike`

**Branding:**
- Default company name: Strike
- Email branding fallback: "STRIKE" (see mailer.ts)
- Logo: tenant uploads their own

**Notes:** This is the primary Strike boxing gym tenant.

---

### 2. Inzan Athletics (inzanathletics)

**Domains:**
- `inzanathletics.mitrixo.com`

**Firestore Database:** `db-inzanathletics`

**Tenant ID:** `inzanathletics`

**Branding:**
- Default company name: Inzan Athletics
- No special email branding override

**Notes:** This is the Inzan Athletics fitness tenant.

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
