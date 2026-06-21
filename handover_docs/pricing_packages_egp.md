# Mitrixo GYM CRM — Pricing Packages (Egyptian Market)

> All prices are in **Egyptian Pounds (EGP)** — monthly subscription.

---

## Package Comparison

| Feature | 🥉 **Starter**<br>2,500 EGP/mo | 🥈 **Professional**<br>5,000 EGP/mo | 🥇 **Premium+**<br>9,000 EGP/mo |
|---|:---:|:---:|:---:|
| **Cloud Dashboard** | ✅ | ✅ | ✅ |
| **`gym.mitrixo.com` Portal** | ✅ | ✅ | ✅ |
| **Custom Domain** | ❌ | ❌ | ✅ |
|||
| **Member Management** | Up to 200 | Up to 500 | ✅ Unlimited |
| **Lead Tracking & CRM** | ❌ | ✅ | ✅ |
| **Interaction Logs (Call/WhatsApp/Visit)** | ❌ | ✅ | ✅ |
| **Lead Assignment & Pipeline** | ❌ | ✅ | ✅ |
|||
| **Payments (Cash/Instapay)** | ✅ | ✅ | ✅ |
| **Discount System** | ❌ | ✅ | ✅ |
| **Package Upgrade/Transfer** | ❌ | ✅ | ✅ |
|||
| **Attendance & QR Check-In** | ✅ | ✅ | ✅ |
| **Self-Service Kiosk Mode** | ✅ | ✅ | ✅ |
|||
| **PT & Private Sessions** | ❌ | ✅ | ✅ |
| **Coach Scheduling** | ❌ | ✅ | ✅ |
|||
| **Club Operations** | ❌ | ❌ | ✅ |
| ↳ Locker Management | ❌ | ❌ | ✅ |
| ↳ Juice Bar Orders | ❌ | ❌ | ✅ |
| ↳ Guest Invites | ❌ | ❌ | ✅ |
|||
| **Reports & Analytics** | Basic | Advanced | Full + Export |
| **Quote Generator** | ❌ | ✅ | ✅ |
| **CSV Data Import** | ❌ | ✅ | ✅ |
| **Audit Trail** | ❌ | ✅ | ✅ |
|||
| **Multi-Branch Support** | ❌ | ❌ | ✅ |
| **Custom Branding** | Default | Logo only | Full white-label |
| **Staff Accounts** | 2 | 5 | Unlimited |
| **Member Portal** | ❌ | ✅ | ✅ |
|||
| **Mobile App (iOS + Android)** | ❌ | ❌ | ✅ |
| **Push Notifications** | ❌ | ❌ | ✅ |
|||
| **Support** | Email only | Priority Email | Dedicated + WhatsApp |

---

## Annual Discount

| Package | Monthly | Annual (2 months free) | Savings |
|---|---|---|---|
| 🥉 Starter | 2,500 EGP/mo | **25,000 EGP/year** | 5,000 EGP saved |
| 🥈 Professional | 5,000 EGP/mo | **50,000 EGP/year** | 10,000 EGP saved |
| 🥇 Premium+ | 9,000 EGP/mo | **90,000 EGP/year** | 18,000 EGP saved |

---

## One-Time Setup Fees

| Item | Cost |
|---|---|
| Platform onboarding & data migration | 2,000 EGP (one-time) |
| Custom domain setup (Premium+ only) | Included |
| Mobile app build & App Store submission | 5,000 EGP (one-time, Premium+ only) |
| Staff training session (2 hours) | 1,500 EGP (optional) |

---

## Payment Terms

- **Payment methods accepted**: Cash, Instapay (bank transfer)
- **Billing cycle**: Monthly or Annual (prepaid)
- **Trial period**: 14-day free trial available on request
- **Cancellation**: Cancel anytime, no long-term commitment on monthly plans
- **Instapay reference**: Required for bank transfer payments (12-digit reference)

---

## Feature Tier Mapping (Technical Reference)

Used by the provisioning system to auto-configure feature flags:

```json
{
  "starter": {
    "leads": false,
    "ptPackages": false,
    "payments": true,
    "attendance": true,
    "reports": true,
    "quotes": false,
    "operations": false,
    "mobileApp": false
  },
  "professional": {
    "leads": true,
    "ptPackages": true,
    "payments": true,
    "attendance": true,
    "reports": true,
    "quotes": true,
    "operations": false,
    "mobileApp": false
  },
  "premium": {
    "leads": true,
    "ptPackages": true,
    "payments": true,
    "attendance": true,
    "reports": true,
    "quotes": true,
    "operations": true,
    "mobileApp": true
  }
}
```

---

## Upsell Path

```
Starter → Professional: "Unlock CRM, lead tracking, and grow your sales team"
Professional → Premium+: "Get the mobile app, multi-branch, and full club operations"
```

---

*All prices subject to review. Custom enterprise pricing available for gym chains with 3+ locations.*
