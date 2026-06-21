# MITRIXO GYM CRM — Feature Roadmap v2.0
### *"BeFit-Level Features, Multi-Tenant Architecture"*

> Prepared: June 2025 | Next Review: Sprint 1 Kickoff

---

## 📍 Strategic Position

**BeFit = Single brand, many locations, consumer-facing app**
**Mitrixo = Multi-tenant platform, each gym gets their own branded system (dashboard + mobile app)**

This means every BeFit feature we implement works **per-tenant** — each gym owner configures their own loyalty points, badges, partner deals, etc. This is MORE powerful than BeFit because it's a platform, not a single app.

---

## ✅ What We ALREADY Have (Live Today)

| Feature | Status | Notes |
|---|:---:|---|
| Full CRM (Leads → Clients → Members) | ✅ Live | Complete lifecycle management |
| Role-Based Access (7 roles) | ✅ Live | Super Admin, CRM Admin, Manager, Admin, Rep, Coach, Member |
| QR Check-In / Kiosk Mode | ✅ Live | Member ID, phone, daily PIN |
| Multi-Payment Methods | ✅ Live | Cash, Card, Instapay, Bank Transfer |
| PT & Group Session Tracking | ✅ Live | Package management with session deduction |
| Coach Schedule Management | ✅ Live | Per-day availability, assignments |
| Multi-Branch Support | ✅ Live | Branch-level segmentation |
| Club Operations (Lockers, Juice Bar, Guest Passes) | ✅ Live | Member self-service |
| Arabic + English (Bilingual) | ✅ Live | Full RTL support |
| Audit Trail | ✅ Live | Every action logged |
| Data Import/Export (CSV) | ✅ Live | Bulk operations with rollback |
| Quote/Proposal Generator | ✅ Live | Branded PDF output |
| Multi-Tenant Provisioning | ✅ Live | 60-second new gym setup |
| Physical Database Isolation | ✅ Live | Each gym = separate Firestore DB |
| Custom Subdomain Routing | ✅ Live | `yourgym.mitrixo.com` |
| Member Portal (Self-Service) | ✅ Live | View packages, request lockers, check history |
| Attendance Reports & Analytics | ✅ Live | Real-time dashboards |
| Password Self-Reset (Email + Phone) | ✅ Live | Just implemented |
| Mobile App (Expo/React Native) | 🔧 Ready | Build profiles configured |

**Total: 18 major features ALREADY shipping.** This is a serious platform.

---

## 🚀 v2.0 Feature Roadmap — BeFit-Inspired Upgrades

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### PHASE 1: Member Experience Upgrade (Sprint 1 — Week 1-2)
*Goal: Make the member portal feel like a premium mobile app*

#### 1.1 Enhanced Member Home Screen
- **Time-based greeting** ("Good Morning, Ahmed! 🌅")
- **Quick stats cards**: Sessions remaining, days until expiry, attendance streak
- **Quick shortcuts**: Schedule, My Package, Profile, Support
- **Upcoming sessions** carousel (PT + Group classes)
- **Announcement banners** (admin-configurable promotional carousel)

#### 1.2 Monthly Schedule View (Enhanced)
- **Calendar ribbon** (horizontal weekly date picker)
- **Time-slot grouped** class listing (6:00 PM, 7:00 PM, etc.)
- **Class cards**: Photo, coach name, location, time, fitness level
- **"Spots Left" indicator** (real-time capacity)
- **One-tap booking** with cancellation policy display

#### 1.3 Notification Center
- **Bell icon** on header with unread badge count
- **Notification types**: Payment reminders, expiry alerts, class changes, announcements
- **Push notifications** (mobile app via Expo)
- **Admin panel**: Compose & send notifications to segments (all members, expiring, etc.)

**Database additions:**
```
notifications: {
  id, recipientUid, type, title, body, data, 
  read, createdAt, expiresAt
}

announcements: {
  id, title, body, imageUrl, linkUrl, 
  priority, startDate, endDate, createdBy
}
```

---

### PHASE 2: Points Economy & Digital Wallet (Sprint 2 — Week 3-4)
*Goal: Monetize the platform with a points-based payment system*

#### 2.1 Points Wallet
- **Points balance** displayed prominently on member home
- **Transaction history**: Points added (purchased/gifted) and deducted (memberships/PT)
- **Buy Points**: Fixed bundles (e.g., 10 Points = 2000 EGP, 25 Points = 4500 EGP)
- **Payment**: Instapay or Cash at reception (admin confirms credit)

#### 2.2 Points-Based Purchasing
- **Dual pricing display**: "6000 EGP or 30 Points" on every package
- **Mixed checkout**: Pay partial with Points, remainder with cash/Instapay
- **Package upgrades**: Use Points balance for upgrades

#### 2.3 Admin Points Management
- **Credit/debit Points** to any member (with reason tracking)
- **Points pricing editor**: Set point values per package
- **Points transaction report**: Full ledger per member and gym-wide
- **Promotional Points**: Bonus Points on bulk purchases (buy 20, get 2 free)

**Database additions:**
```
pointsWallet: {
  memberId, balance, totalEarned, totalSpent, lastUpdated
}

pointsTransactions: {
  id, memberId, type (credit|debit), amount, 
  reason (purchase|gift|refund|packageBuy),
  referenceId, balanceBefore, balanceAfter, 
  createdBy, createdAt
}

pointsPricing: {
  packageId, pointsPrice, cashPrice, bonusCoins
}

pointsBundles: {
  id, name, pointsAmount, priceEGP, bonusPoints, active
}
```

---

### PHASE 3: Gamification & Engagement (Sprint 3 — Week 5-6)
*Goal: Increase retention through streaks, badges, and rewards*

#### 3.1 Coins (Reward Currency)
- **Separate from Points** — earned, never purchased
- **Earn methods**: Check-in streak (7 days = 50 coins), Badge unlock, Challenge completion
- **Coins balance** shown alongside Points on member home

#### 3.2 Badges & Achievements
- **Badge categories**: Featured (seasonal) + General (permanent)
- **Examples**: "30-Day Warrior" (30 check-ins), "Early Bird" (10 sessions before 8am), "Loyal Member" (6+ months active)
- **Progress tracking**: Show progress bars for in-progress badges
- **Coin rewards**: Each badge unlock grants Coins

#### 3.3 Streak Tracking
- **Current streak**: Consecutive days/weeks with check-ins
- **Best streak**: Personal record
- **Streak rewards**: Milestone Coins at 7, 14, 30, 60, 90 days

#### 3.4 Rewards Marketplace (Admin-Configured)
- **Partner rewards**: "Spend 300 Coins for 15% off [Partner]"
- **Gym rewards**: "Spend 100 Coins for a free protein shake"
- **Redemption flow**: Member claims → Staff validates → Coins deducted
- **Admin panel**: Create/edit/disable rewards, set Coin prices

**Database additions:**
```
coinsWallet: {
  memberId, balance, totalEarned, totalSpent, lastUpdated
}

coinsTransactions: {
  id, memberId, type, amount, reason, referenceId, createdAt
}

badgeDefinitions: {
  id, name, description, icon, category (featured|general),
  criteria (JSON: {type: 'checkin_streak', target: 30}),
  coinsReward, active, sortOrder
}

memberBadges: {
  memberId, badgeId, progress, unlockedAt, coinsAwarded
}

streaks: {
  memberId, currentStreak, bestStreak, lastCheckInDate
}

rewards: {
  id, name, description, imageUrl, coinsPrice,
  partnerName, type (partner|internal), 
  quantity, claimed, active, expiresAt
}

rewardRedemptions: {
  id, memberId, rewardId, coinsSpent, 
  status (pending|validated|expired), validatedBy, createdAt
}
```

---

### PHASE 4: Advanced Platform Features (Sprint 4 — Week 7-8)
*Goal: Premium features for larger gyms and chains*

#### 4.1 Facility Directory (Multi-Location Gyms)
- **Area/Room profiles** with photos, amenities icons, descriptions
- **Map integration** (Google Maps embed)
- **Amenity tags**: Showers, Lockers, Parking, Coffee Shop, Steam Room

#### 4.2 Tiered PT Pricing
- **Member vs Non-Member toggle** on PT packages
- **Coach-specific pricing** (senior coaches cost more)
- **Package comparison table**: 10 sessions vs 20 sessions side-by-side

#### 4.3 Seasonal/Campaign Hub
- **Admin-created campaigns**: "Summer Program", "Ramadan Hours"
- **Campaign landing pages**: Special schedules, pricing, content
- **Time-limited packages**: Auto-expire after campaign ends

#### 4.4 P2P Points Transfer
- **Send Points** to another member (with verification)
- **Transfer limits**: Admin-configurable daily/monthly caps
- **Transfer history**: Full audit trail

#### 4.5 Advanced Analytics
- **Retention cohort analysis**: Which month's signups have the best 3-month retention?
- **Revenue forecasting**: Based on expiry dates and renewal rates
- **Member engagement score**: Composite of check-ins, PT sessions, app usage

---

## 📊 Feature Comparison: Mitrixo vs BeFit vs Traditional Software

| Capability | Traditional Gym Software | BeFit | Mitrixo (Today) | Mitrixo v2.0 |
|---|:---:|:---:|:---:|:---:|
| Cloud-based | ❌ | ✅ | ✅ | ✅ |
| Multi-tenant (many gyms) | ❌ | ❌ (single brand) | ✅ | ✅ |
| CRM & Lead Tracking | Basic | ❌ | ✅ Advanced | ✅ Advanced |
| QR Check-in | Basic | ✅ | ✅ | ✅ |
| Points Economy | ❌ | ✅ | ❌ | ✅ Phase 2 |
| Gamification (Badges) | ❌ | ✅ | ❌ | ✅ Phase 3 |
| Mobile App | ❌ | ✅ | ✅ (Expo) | ✅ Enhanced |
| Arabic Support | Sometimes | ❌ | ✅ | ✅ |
| Data Isolation | ❌ | N/A | ✅ | ✅ |
| Custom Branding per Gym | ❌ | N/A | ✅ | ✅ |
| Audit Trail | ❌ | Unknown | ✅ | ✅ |
| Sales CRM + Commissions | ❌ | ❌ | ✅ | ✅ |
| White-Label Platform | ❌ | ❌ | ✅ | ✅ |

---

## 🎯 Meeting Talking Points (Tomorrow)

### What to DEMO (working right now):
1. **Live dashboard** with real-time metrics
2. **Member lifecycle**: Add lead → Convert → Active member
3. **QR check-in kiosk** mode
4. **Payment recording** with Instapay
5. **Coach scheduling** and PT tracking
6. **Role switching** (Admin → Rep → Coach → Member views)
7. **Arabic toggle** (show bilingual capability)
8. **Multi-branch** data separation
9. **Self-service password reset** (just built)
10. **Mobile-responsive** design

### What to PITCH (NOW LIVE ✅):
1. **Points & Digital Wallet** ✅ — "Members can buy Points bundles and track their balance"
2. **Gamification** ✅ — "10 achievement badges, streak tracking, and coins rewards boost retention"
3. **Rewards Marketplace** ✅ — "Members spend coins on protein shakes, guest passes, discounts"
4. **Admin Points Panel** ✅ — "Credit/debit points, manage bundles, view transaction history"

### What to PITCH (coming next sprint):
1. **Push Notifications** — "Automated reminders for expiry, payment, and class changes"
2. **Monthly Schedule View** — "Beautiful class calendar with real-time booking"
3. **Admin Analytics Dashboard** — "KPI cards, member engagement, revenue trends"

### Key Selling Points:
- "Each gym gets their own **private database** — your data is YOURS, never mixed"
- "60-second gym provisioning — we set up your entire system in under a minute"
- "**No per-seat licensing** — your entire staff uses one subscription"
- "**Arabic-first** — built for the Egyptian market, not translated from English"
- "We're building the **BeFit of gym management** — but every gym gets their own branded version"

---

## ⏱ Sprint Timeline

| Sprint | Status | Focus | Deliverables |
|---|---|---|---|
| **Sprint 1** | ✅ DONE (June 21) | Member Experience | Enhanced home, date ribbon, notifications, announcements, password reset |
| **Sprint 2** | ✅ DONE (June 21) | Points Economy | Wallet, buy bundles, transaction history, admin credit/debit, bundle CRUD |
| **Sprint 3** | ✅ DONE (June 21) | Gamification | 10 badges, auto-progress, coins wallet, streaks, rewards marketplace |
| **Sprint 4** | 📋 NEXT | Advanced Features | Facility directory, tiered PT, campaigns, admin analytics dashboard |

**Sprints 1-3 delivered in a single session!** Sprint 4 targets advanced features and analytics.

---

## 🔐 Edge Cases & Risks

1. **Race condition on class booking**: Two members book the last spot simultaneously → Use Firestore transactions with optimistic locking
2. **Points refund on cancellation**: Member buys package with Points + Cash mix → Need to reverse both currencies proportionally
3. **Cross-tenant Points abuse**: Member has accounts at two gyms → Points are per-tenant, wallets are isolated by database
4. **Streak timezone issues**: Member checks in at 11:55 PM and 12:05 AM → Should count as same day or streak continues? → Use gym's configured timezone, not UTC
5. **Badge criteria changes**: Admin changes "30-day streak" to "20-day streak" → Don't retroactively award, only apply to new progress

---

*Mitrixo GYM CRM v2.0 — Where gym management meets member engagement.*
