# MITRIXO GYM CRM Platform
### Complete Gym Management & CRM Solution

> *Built for the Egyptian fitness market. Powered by cloud technology. Designed for growth.*

---

## 🏋️ Platform Overview

Mitrixo GYM CRM is a **full-stack cloud-based gym management platform** that handles every aspect of running a fitness business — from lead generation and sales tracking to member management, attendance, payments, coach scheduling, and club operations.

Each gym gets its own **private, isolated workspace** accessible via a custom subdomain (`yourgym.mitrixo.com`) or a fully custom domain. Data is physically separated between gyms — no gym can ever see another gym's data.

---

## ✅ Core Features

### 1. 📊 Dashboard & Real-Time Analytics
- Live revenue tracking with daily, weekly, and monthly views
- Sales target progress bars per rep and team-wide
- Lead conversion funnel visualization
- Attendance trends and member activity heatmaps
- Package expiry alerts and renewal pipeline
- Commission calculations for PT and group sales

### 2. 👥 Client & Member Management
- **Full member lifecycle**: Lead → Trial → Active → Nearly Expired → Expired → Renewal
- Member profiles with contact info, fitness goals, package history
- Sequential Member ID system (auto-generated)
- Family/linked accounts support (parent + child memberships)
- Member portal with self-service features
- Membership hold/freeze functionality with reason tracking

### 3. 🎯 Sales CRM & Lead Tracking
- Lead capture with source tracking (Instagram, WhatsApp, Walk-in, TikTok)
- Lead stages: New → Trial → Follow Up → Converted → Lost
- Lead interest and category classification
- Interaction logging: Calls, WhatsApp, Email, Visits with outcomes
- Follow-up reminders and next-action scheduling
- Lead assignment to sales reps with reassignment capability
- CRM comments and activity timeline per lead/member

### 4. 💰 Payments & Financial Management
- **Multi-method payments**: Cash, Credit Card, Bank Transfer, Instapay
- Instapay reference number tracking (12-digit validation)
- Discount system: percentage-based and fixed-amount discounts
- Package upgrade/transfer tracking with payment history
- Payment hold/freeze with reason tracking
- Soft-delete for payment records (audit-safe)
- Sales rep attribution and commission tracking
- PT commission rates and group training rates (configurable)

### 5. 📱 Attendance & QR Check-In System
- **Self-service kiosk mode**: Members check in with Member ID or phone number
- Daily check-in PIN system (staff sets the PIN each day)
- QR code scanning for rapid attendance
- Automatic session deduction on check-in
- Membership expiry validation at check-in (blocks expired members)
- Zero-session blocking (prevents check-in when sessions depleted)
- Branch-level attendance tracking
- Attendance history and frequency reports

### 6. 🏆 PT & Private Sessions Management
- Coach profiles with active/inactive status
- Coach schedule management (per-day availability)
- PT package creation with session counts and validity periods
- Session tracking: Scheduled → Attended → No Show → Cancelled
- Automatic session deduction from PT packages
- Coach-specific session assignment

### 7. 🏢 Club Operations
- **Locker Management**: Assign, track, and maintain lockers per branch
- **Locker Requests**: Members can request lockers via their portal
- **Juice Bar Orders**: Digital ordering with pickup time scheduling
- **Guest Invites**: Members generate guest passes with unique invite codes
- **Guest Tracking**: Staff validates and records guest attendance

### 8. 📈 Reports & Analytics
- Revenue reports by period, branch, and sales rep
- Package sales breakdown (Private vs Group)
- Lead conversion rate analysis
- Attendance frequency reports
- Sales rep performance rankings
- Commission calculation reports
- Data export capabilities

### 9. 📋 Audit Trail & Security
- **Complete audit logging**: Every create, update, and delete action is recorded
- Audit entries include: who, what, when, and details of the change
- 30-day rolling audit window (configurable)
- Role-based access to audit history
- Import batch tracking with rollback capability

### 10. 🌐 Multi-Branch Support
- Branch-level data segmentation
- Branch-specific packages and pricing
- Per-branch attendance tracking
- Cross-branch member access
- Branch-level sales targets

### 11. 📄 Quote Generator
- Custom commercial quote/proposal PDF generation
- Branded proposals with gym logo and contact info
- Package-by-package breakdown with pricing
- Professional presentation-ready output

### 12. 📥 Data Import & Migration
- CSV bulk import for clients and members
- Duplicate detection (phone number matching)
- Import batch tracking with history
- **Full rollback capability**: Undo any import batch completely
- Error reporting per import row

---

## 👤 Role-Based Access Control

| Role | Dashboard | Clients | Leads | Payments | Settings | Staff Mgmt | Audit Logs |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Super Admin** | ✅ Full | ✅ All | ✅ All | ✅ All + Delete | ✅ Full | ✅ Full | ✅ Full |
| **CRM Admin** | ✅ Full | ✅ All | ✅ All | ✅ All + Delete | ✅ Full | ✅ Full | ✅ Full |
| **Manager** | ✅ Full | ✅ All | ✅ All | ✅ View + Create | ✅ Full | ✅ Full | ✅ View |
| **Admin** | ✅ Full | ✅ All | ✅ All | ✅ View + Create | ✅ Full | ✅ Partial | ✅ View |
| **Sales Rep** | 📊 Own | 👤 Own | 🎯 Own | 💰 Own | ❌ | ❌ | ❌ |
| **Coach** | 📊 Own | 👤 Assigned | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Member (Portal)** | 📊 Own | 👤 Self | ❌ | 💰 Own | ❌ | ❌ | ❌ |

Fine-grained permissions can be toggled per user:
- `can_delete_payments` — Allow payment deletion
- `can_view_global_dashboard` — See team-wide metrics
- `can_access_settings_and_history` — Access system settings and audit logs
- `can_delete_records` — Delete client/member records
- `can_assign_leads` — Reassign leads between reps

---

## 📱 Mobile App (iOS & Android)

- Native mobile app available for **iOS** and **Android**
- Full dashboard access on mobile with optimized touch interface
- Push notifications for payment reminders, expiry alerts, and task assignments
- Camera access for QR scanning and photo uploads
- Offline resilience with retry mechanism
- Branded per-gym (custom app name, icon, and splash screen)

---

## 🔒 Security & Data Protection

- **Physical data isolation**: Each gym gets its own separate database — no shared tables
- **Firebase Authentication**: Enterprise-grade Google-managed auth
- **Firestore Security Rules**: Every collection has granular read/write rules
- **Role-based access control**: Data visibility is enforced at the database level
- **Audit trail**: Every action is logged and traceable
- **Encrypted connections**: All data transmitted over HTTPS/TLS
- **Automated backups**: Regular database snapshots

---

## 🚀 Onboarding Process

1. **Sign Up** → Gym owner fills out a subscription request form
2. **Approval** → Mitrixo team reviews and approves the request
3. **Provisioning** → In under 60 seconds:
   - Private database is created
   - Security rules are deployed
   - Owner admin account is created
   - Default packages and settings are seeded
   - Welcome email with login credentials is sent
4. **Go Live** → Gym accesses their workspace at `yourgym.mitrixo.com`
5. **Mobile App** → Custom-branded mobile app is built and deployed (Premium+ tier)

---

## 🌍 Built for Egypt

- **Egyptian Pound (EGP) pricing** throughout the system
- **Instapay integration** for digital payments with reference tracking
- **Arabic language support** (RTL-ready interface)
- **Cloudflare-powered CDN** for fast Egyptian access
- **Local hosting options** available

---

## 🤝 Why Mitrixo?

| Traditional Software | Mitrixo GYM CRM |
|---|---|
| Desktop installation required | ☁️ Cloud-based — access anywhere |
| Pay per computer license | 💰 One subscription for unlimited devices |
| Manual backups | 🔄 Automatic cloud backups |
| No mobile access | 📱 Full mobile app included |
| Generic software | 🏋️ Built specifically for gyms |
| Shared database risk | 🔒 Private isolated database per gym |
| Manual reporting | 📊 Real-time automated analytics |

---

## 🔮 Coming Soon (v2.0 Roadmap)

### 💎 Points & Digital Wallet
- Members buy **Points bundles** (e.g., 10 Points = 2,000 EGP)
- Use Points to purchase memberships, PT packages, or class drop-ins
- **Dual pricing** on everything: "6,000 EGP **or** 30 Points"
- **Mixed checkout**: Pay partially with Points, remainder with cash/Instapay
- Full transaction history and wallet dashboard

### 🏅 Gamification: Badges, Streaks & Rewards
- **Attendance streaks** with milestone rewards (7, 14, 30, 60, 90 days)
- **Achievement badges**: "30-Day Warrior", "Early Bird", "Loyal Member"
- **Coins** earned through streaks and badges — a separate reward currency
- **Rewards marketplace**: Redeem Coins for partner discounts or gym perks

### 🔔 Notification Center
- In-app notification feed with unread badges
- **Push notifications** (mobile): Payment reminders, expiry alerts, class changes
- Admin-composed announcements to member segments

### 📅 Enhanced Class Schedule
- **Calendar ribbon** with weekly date picker
- **Time-slot grouped** class listing with coach photos
- **Real-time capacity**: "3 Spots Left" indicator
- **One-tap booking** with cancellation policy display

### 🤝 Partner & Sponsor System
- **Admin-configurable** partner promotions with banner ads
- **Reward redemptions** at partner businesses using Coins
- Partner logo grid on member home screen

> *All v2.0 features are designed per-tenant — each gym configures their own loyalty program, badges, and partner deals independently.*

---

*Mitrixo GYM CRM — Your gym. Your data. Your growth.*

**Contact**: info@mitrixo.com | mitrixo.com
