# 🧪 Mitrixo GYM CRM — Complete Bug Testing Checklist

> **Purpose**: Manual verification of every feature before the gym meeting.
> **Time**: ~2-3 hours to complete everything.
> **URL**: Open your Strike dashboard (e.g. `https://dashboard.strikeboxing-eg.pro`)

---

## How to Use This Checklist

- ✅ = Pass (works perfectly)
- ❌ = Fail (bug found — note what happened)
- ⚠️ = Partial (works but has issues)
- ⏭️ = Skip (not applicable right now)

Go through each section in order. Each test has a specific action and expected result.

---

## 🔐 SECTION 1: Authentication & Login (15 tests)

### 1.1 Login Page
- [✅ ] **T001**: Open the dashboard URL → Login page loads with gym branding (logo or company name)
- [ ✅] **T002**: Enter wrong email/password → Error message appears, login is blocked
- [✅ ] **T003**: Enter correct admin credentials → Redirected to Dashboard
- [ ✅] **T004**: Login page is responsive on mobile browser (resize window to 375px wide)
- [ langauge toggle is not in the login page onlly when you login to the dashb **T005**: Arabic toggle works on login page (if language switcher exists)

### 1.2 Role-Based Login
- [ ✅] **T006**: Login as **CRM Admin** → See all navigation tabs (Dashboard, Clients, Leads, Payments, Settings, etc.)
- [ ✅] **T007**: Login as **Sales Rep** → Only see assigned clients/leads, no Settings tab
- [✅ ] **T008**: Login as **Coach** → Only see assigned clients and coach schedule
- [ ✅] **T009**: Login as **Member (portal)** → Only see own profile, attendance, subscription status

### 1.3 Session & Security
- [✅ ] **T010**: Refresh the page after login → Stay logged in (session persists)
- [✅ ] **T011**: Open a new tab to the same URL → Auto-logged in (multi-tab support)
- [✅ ] **T012**: Click Logout → Redirected to login page
- [✅ ] **T013**: After logout, press browser Back button → Should NOT return to dashboard (session cleared)
- [✅ ] **T014**: Try accessing `/settings` URL directly without login → Redirected to login
- [yes but the password reset is not working properly the only way is me loggin in with my god mode account and force reseting the password  ] **T015**: Password change flow works for `mustChangePassword` accounts

---

## 📊 SECTION 2: Dashboard (18 tests)

### 2.1 Stats Cards
- [ ] **T016**: Dashboard loads within 3 seconds
- [ ] **T017**: Total Members card shows correct count (cross-check with Clients tab)
- [ ] **T018**: Active Members count matches clients with status "Active" + "Nearly Expired"
- [ ] **T019**: Revenue card shows correct total (cross-check with Payments tab total)
- [ ] **T020**: Leads count matches the Leads tab total

### 2.2 Charts & Visualizations
- [ ] **T021**: Revenue chart (bar/line) renders correctly with monthly data
- [ ] **T022**: Hover over chart bars → Tooltip shows month name + amount
- [ ] **T023**: Lead conversion funnel displays correctly
- [ ] **T024**: Membership status pie/donut chart shows Active vs Expired breakdown
- [ ] **T025**: Sales target progress bar shows correct percentage

### 2.3 Dashboard Widgets
- [ ] **T026**: Recent payments list shows the latest 5-10 payments
- [ ] **T027**: Upcoming expirations list is accurate (members expiring soon)
- [ ] **T028**: Tasks widget shows pending tasks
- [ ] **T029**: Today's attendance count updates after a check-in

### 2.4 Dashboard Responsiveness
- [ ] **T030**: Dashboard renders correctly on tablet (768px)
- [ ] **T031**: Dashboard renders correctly on mobile (375px)
- [ ] **T032**: Charts resize properly on different screen sizes
- [ ] **T033**: No horizontal scrollbar on mobile view

---

## 👥 SECTION 3: Clients/Members Management (30 tests)

### 3.1 Client List View
- [ ] **T034**: Clients tab loads and shows all members
- [ ] **T035**: Search by name → Filters correctly in real-time
- [ ] **T036**: Search by phone number → Filters correctly
- [ ] **T037**: Search by Member ID → Filters correctly
- [ ] **T038**: Filter by status (Active, Expired, Nearly Expired, Lead, Hold) → Each filter works
- [ ] **T039**: Filter by branch → Shows only clients from selected branch
- [ ] **T040**: Sorting by name works (A-Z, Z-A)
- [ ] **T041**: Sorting by date works (newest first, oldest first)
- [ ] **T042**: Pagination works (if more than 25/50 clients) OR infinite scroll loads more

### 3.2 Add New Client
- [ ] **T043**: Click "Add Client" → Modal/form opens
- [ ] **T044**: Fill all required fields and submit → Client appears in the list
- [ ] **T045**: Member ID is auto-generated (sequential number)
- [ ] **T046**: Portal account is auto-created (check no error in console)
- [ ] **T047**: Try adding duplicate phone number → Error message: "already exists"
- [ ] **T048**: Leave required field empty → Validation error appears
- [ ] **T049**: Add client with Arabic name → Saves and displays correctly

### 3.3 Edit Client
- [ ] **T050**: Click on a client → Detail view/modal opens
- [ ] **T051**: Edit name and save → Name updates in the list
- [ ] **T052**: Change status from "Lead" to "Active" → Status badge updates
- [ ] **T053**: Change status from "Active" to "Hold" → Status badge updates
- [ ] **T054**: Add a package (subscription) to the client → Package shows in profile
- [ ] **T055**: Edit phone number → Saves correctly

### 3.4 Client Details
- [ ] **T056**: View client profile → All info displays (name, phone, status, member ID, package, dates)
- [ ] **T057**: Comments section loads → Can add a new comment
- [ ] **T058**: Add a comment → Comment appears with author name and timestamp
- [ ] **T059**: Interaction log shows history (calls, WhatsApp, visits)
- [ ] **T060**: Add an interaction → Appears in the log with correct type and outcome
- [ ] **T061**: Payment history for the client is visible and accurate
- [ ] **T062**: Attendance history for the client is visible

### 3.5 Delete Client
- [ ] **T063**: Delete a client → Confirmation dialog appears first
- [ ] **T064**: Confirm delete → Client removed from list
- [ ] **T065**: Multi-select clients and bulk delete → All selected clients removed

### 3.6 Family/Linked Accounts
- [ ] **T066**: Add a linked account (parent-child) → Both accounts visible
- [ ] **T067**: Linked account shares the parent phone number without duplicate error

---

## 🎯 SECTION 4: Leads & CRM (20 tests)

### 4.1 Lead List
- [ ] **T068**: Leads tab loads and shows all leads
- [ ] **T069**: Filter by lead source (Instagram, WhatsApp, Walk-in, TikTok) → Works
- [ ] **T070**: Filter by stage (New, Trial, Follow Up, Converted, Lost) → Works
- [ ] **T071**: Filter by assigned rep → Shows only that rep's leads
- [ ] **T072**: Leads count matches dashboard stats

### 4.2 Add Lead
- [ ] **T073**: Add new lead with all fields → Lead appears in list
- [ ] **T074**: Set lead source → Displays correctly
- [ ] **T075**: Set lead interest/category → Displays correctly
- [ ] **T076**: Assign lead to a sales rep → Lead shows under that rep's view

### 4.3 Lead Management
- [ ] **T077**: Change lead stage from "New" to "Trial" → Badge updates
- [ ] **T078**: Change lead stage from "Trial" to "Converted" → Lead becomes a member
- [ ] **T079**: Mark lead as "Lost" → Moved to lost leads
- [ ] **T080**: Add follow-up date → Reminder shows in tasks/calendar
- [ ] **T081**: Reassign lead to different rep → Lead moves to new rep's view

### 4.4 Lead Interactions
- [ ] **T082**: Log a call interaction → Type, outcome, and date recorded
- [ ] **T083**: Log a WhatsApp interaction → Saved with notes
- [ ] **T084**: Log a visit interaction → Saved correctly
- [ ] **T085**: Interaction history is chronological (newest first)

### 4.5 Lead Analytics
- [ ] **T086**: Conversion rate calculation is accurate
- [ ] **T087**: Lead pipeline view (if available) shows correct counts per stage

---

## 💰 SECTION 5: Payments & Invoicing (25 tests)

### 5.1 Payment List
- [ ] **T088**: Payments tab loads and shows all payments
- [ ] **T089**: Filter by date range → Correct payments shown
- [ ] **T090**: Filter by payment method (Cash, Instapay, Card, Bank Transfer) → Works
- [ ] **T091**: Filter by sales rep → Shows only that rep's payments
- [ ] **T092**: Total revenue calculation is accurate
- [ ] **T093**: Search by client name in payments → Filters correctly

### 5.2 Add Payment
- [ ] **T094**: Add new payment → Select client, enter amount, select method
- [ ] **T095**: Amount must be > 0 → Validation works
- [ ] **T096**: Select "Cash" payment method → No additional fields required
- [ ] **T097**: Select "Instapay" payment method → Transaction ID field appears
- [ ] **T098**: Enter Instapay reference (12 digits) → Validates and saves
- [ ] **T099**: Select a package → Package name and type recorded
- [ ] **T100**: Sales rep is automatically recorded → Shows in payment record
- [ ] **T101**: Payment date defaults to today → Can change to a past date
- [ ] **T102**: Add payment with discount (%) → Final amount calculates correctly
- [ ] **T103**: Add payment with fixed discount (EGP) → Final amount calculates correctly

### 5.3 Payment Actions
- [ ] **T104**: View payment details → All info correct (client, amount, date, method, rep)
- [ ] **T105**: Delete payment (admin only) → Confirmation dialog → Payment removed
- [ ] **T106**: Non-admin user cannot delete payments → Button hidden or disabled
- [ ] **T107**: Soft-delete preserves the record in audit trail

### 5.4 Payment Reports
- [ ] **T108**: Payment receipt / PDF generation works (if implemented)
- [ ] **T109**: Commission calculation for PT packages → Shows correct amount
- [ ] **T110**: Commission calculation for group packages → Shows correct amount
- [ ] **T111**: Revenue totals match between Dashboard and Payments tab
- [ ] **T112**: Package upgrade/transfer tracking records correctly

---

## 📱 SECTION 6: Attendance & QR Check-in (20 tests)

### 6.1 Standard Attendance
- [ ] **T113**: Attendance tab loads and shows today's check-ins
- [ ] **T114**: Record attendance for a member → Entry appears in the list
- [ ] **T115**: Duplicate check-in for same day → Warning or blocked
- [ ] **T116**: Filter attendance by date → Shows correct records
- [ ] **T117**: Filter attendance by branch → Shows correct records

### 6.2 Self-Service Kiosk Mode
- [ ] **T118**: Kiosk mode button/toggle exists and works
- [ ] **T119**: Enter Member ID → Successful check-in with member name displayed
- [ ] **T120**: Enter phone number → Successful check-in
- [ ] **T121**: Enter wrong ID → Error message "Member not found"
- [ ] **T122**: Check-in with expired membership → Blocked with "Membership expired" message
- [ ] **T123**: Check-in with 0 sessions remaining → Blocked with "No sessions" message
- [ ] **T124**: Daily PIN verification → Correct PIN grants access, wrong PIN blocks

### 6.3 QR Code Check-in
- [ ] **T125**: QR scanner activates (camera permission requested)
- [ ] **T126**: Scan a valid QR code → Check-in recorded
- [ ] **T127**: Scan an invalid QR code → Error message displayed

### 6.4 Attendance Data
- [ ] **T128**: Attendance history for a specific member is accurate
- [ ] **T129**: Attendance count on dashboard matches the attendance tab
- [ ] **T130**: Sessions remaining decrements after check-in
- [ ] **T131**: Attendance export (if available) → CSV/report generates correctly
- [ ] **T132**: Branch-level attendance view works

---

## 🏆 SECTION 7: PT & Private Sessions (15 tests)

### 7.1 Session Management
- [ ] **T133**: PT Sessions / Private Sessions tab loads
- [ ] **T134**: Schedule a new session → Select client, coach, date/time
- [ ] **T135**: Session status defaults to "Scheduled"
- [ ] **T136**: Mark session as "Attended" → Status updates, session deducted from package
- [ ] **T137**: Mark session as "No Show" → Status updates, session deducted
- [ ] **T138**: Mark session as "Cancelled" → Status updates, session NOT deducted
- [ ] **T139**: Filter sessions by coach → Shows only that coach's sessions
- [ ] **T140**: Filter sessions by client → Shows only that client's sessions

### 7.2 PT Packages
- [ ] **T141**: PT Packages view shows all active PT packages
- [ ] **T142**: Package shows remaining sessions count
- [ ] **T143**: Sessions deduction matches attendance records
- [ ] **T144**: Package expiry date displays correctly
- [ ] **T145**: Expired PT package is visually indicated

### 7.3 Coach Management
- [ ] **T146**: Coaches list shows all coaches with active/inactive status
- [ ] **T147**: Add new coach → Coach appears in the list and in session assignment

---

## 🏢 SECTION 8: Club Operations (15 tests)

### 8.1 Lockers
- [ ] **T148**: Lockers tab/section loads and shows all lockers
- [ ] **T149**: Assign a locker to a member → Locker status changes to "Occupied"
- [ ] **T150**: Release a locker → Locker status changes to "Available"
- [ ] **T151**: Member can request a locker from their portal
- [ ] **T152**: Admin approves locker request → Locker assigned

### 8.2 Juice Bar
- [ ] **T153**: Juice bar orders section loads
- [ ] **T154**: Member creates an order → Order appears in staff view
- [ ] **T155**: Staff marks order as ready/picked up → Status updates
- [ ] **T156**: Member can cancel a pending order → Status changes to "Cancelled"
- [ ] **T157**: Cannot cancel an already-completed order

### 8.3 Guest Invites
- [ ] **T158**: Guest invites section loads
- [ ] **T159**: Member creates a guest invite → Unique invite code generated
- [ ] **T160**: Staff validates invite code → Guest marked as attended
- [ ] **T161**: Invalid invite code → Error message
- [ ] **T162**: Each invite code can only be used once

---

## 📋 SECTION 9: Tasks & Calendar (10 tests)

- [ ] **T163**: Tasks tab loads and shows all tasks
- [ ] **T164**: Add new task → Set title, due date, priority, assignee
- [ ] **T165**: Task priority colors work (High=red, Medium=amber, Low=green)
- [ ] **T166**: Mark task as "In Progress" → Status icon changes
- [ ] **T167**: Mark task as "Completed" → Green checkmark appears
- [ ] **T168**: Filter tasks by status (Pending, In Progress, Completed)
- [ ] **T169**: Filter tasks by assignee
- [ ] **T170**: Delete task → Confirmation dialog → Task removed
- [ ] **T171**: Calendar view shows tasks and appointments on correct dates
- [ ] **T172**: Click on a calendar date → Shows events for that day

---

## ⚙️ SECTION 10: Settings (20 tests)

### 10.1 My Profile
- [ ] **T173**: My Profile tab loads with current user info
- [ ] **T174**: Edit display name → Saves correctly
- [ ] **T175**: Change password → Works (test with new password)

### 10.2 Branding
- [ ] **T176**: Branding tab loads with current company name
- [ ] **T177**: Change company name → Updates across all pages (header, login, kiosk)
- [ ] **T178**: Upload logo → Displays correctly in header
- [ ] **T179**: Remove logo → Falls back to text-based branding

### 10.3 Users / Staff Management
- [ ] **T180**: Users tab shows all staff accounts
- [ ] **T181**: Add new staff user → Appears in the list
- [ ] **T182**: Change user role → Role badge updates
- [ ] **T183**: Toggle permissions (can_delete_payments, etc.) → Permissions apply immediately
- [ ] **T184**: Delete a staff user → Removed from list

### 10.4 Branches
- [ ] **T185**: Branches tab shows current branches
- [ ] **T186**: Add new branch → Appears in branch dropdown across all forms
- [ ] **T187**: Remove a branch → Disappears from dropdowns

### 10.5 Packages
- [ ] **T188**: Packages tab shows all subscription packages
- [ ] **T189**: Add new package → Set name, price, sessions, validity, type
- [ ] **T190**: Edit package price → Updates (does NOT affect existing members retroactively)
- [ ] **T191**: Delete package → Removed from dropdown in payment forms

### 10.6 Commission & Targets
- [ ] **T192**: Commission rates tab loads (PT rate, Group rate)
- [ ] **T193**: Change PT commission rate → New rate applies to future calculations
- [ ] **T194**: Sales target tab → Set monthly target amount
- [ ] **T195**: Target progress updates on dashboard

### 10.7 Backup & Danger Zone
- [ ] **T196**: Export backup button → JSON file downloads
- [ ] **T197**: Danger zone → Only visible to CRM Admin
- [ ] **T198**: Clear all data requires explicit confirmation

---

## 📥 SECTION 11: Data Import (10 tests)

- [ ] **T199**: Import Data tab loads
- [ ] **T200**: Download CSV template → Template has correct columns
- [ ] **T201**: Upload valid CSV → Preview shows data correctly
- [ ] **T202**: Confirm import → Clients added to the system
- [ ] **T203**: Import with duplicate phone numbers → Duplicates flagged, not imported
- [ ] **T204**: Import with missing required fields → Errors shown per row
- [ ] **T205**: Import batch recorded in Import History
- [ ] **T206**: Rollback import → All clients from that batch are removed
- [ ] **T207**: Bulk import of 50+ records → Completes without timeout
- [ ] **T208**: Member IDs auto-generated for imported clients

---

## 📊 SECTION 12: Reports & Analytics (8 tests)

- [ ] **T209**: Reports tab loads
- [ ] **T210**: Revenue report shows accurate monthly breakdown
- [ ] **T211**: Package sales report (Private vs Group) is accurate
- [ ] **T212**: Sales rep performance rankings match actual data
- [ ] **T213**: Date range filter on reports works
- [ ] **T214**: Export report data (if available)
- [ ] **T215**: Attendance frequency report is accurate
- [ ] **T216**: Commission report matches payment records × commission rates

---

## 📄 SECTION 13: Quote Generator (5 tests)

- [ ] **T217**: Quote Generator page loads
- [ ] **T218**: Select packages for the quote → Preview renders
- [ ] **T219**: Generate PDF → PDF downloads with gym branding
- [ ] **T220**: PDF contains correct package names, prices, and totals
- [ ] **T221**: PDF looks professional (no broken layout or missing fonts)

---

## 📋 SECTION 14: Audit Trail (5 tests)

- [ ] **T222**: Audit Logs tab loads (admin/manager only)
- [ ] **T223**: Create a client → Audit log entry: "Added new client: [name]"
- [ ] **T224**: Update a payment → Audit log entry: "Updated payment: [details]"
- [ ] **T225**: Delete a record → Audit log entry: "Deleted: [entity]"
- [ ] **T226**: Audit logs show correct timestamp, user, and action type

---

## 🌐 SECTION 15: Multi-Tenant & Provisioning (10 tests)

> ⚠️ Only test these from the SuperAdmin hub (superadmin.mitrixo.com or your admin URL)

- [ ] **T227**: SuperAdmin Hub loads and shows tenant registry
- [ ] **T228**: Existing tenants display with correct status, subdomain, and feature flags
- [ ] **T229**: Try provisioning with reserved subdomain "strike" → BLOCKED with error
- [ ] **T230**: Try provisioning with reserved subdomain "admin" → BLOCKED with error
- [ ] **T231**: Provision a test gym (e.g. "testgym123") → Database created, rules deployed
- [ ] **T232**: After provisioning, visit `testgym123.mitrixo.com` → Login page loads
- [ ] **T233**: Login with provisioned owner credentials → Dashboard loads with default data
- [ ] **T234**: Verify Strike's data is untouched after provisioning (client count, payment count)
- [ ] **T235**: Feature flags toggle works → Disabling "leads" hides the Leads tab for that tenant
- [ ] **T236**: Suspend a tenant → Suspended page shows when visiting their URL

---

## 📱 SECTION 16: Mobile App (15 tests)

> Test on a real iOS/Android device or Expo Go

### 16.1 App Launch
- [ ] **T237**: App opens and shows loading screen with app name
- [ ] **T238**: Loading screen transitions to the dashboard WebView
- [ ] **T239**: WebView loads the correct production URL
- [ ] **T240**: App name matches the configured gym name

### 16.2 Core Functionality
- [ ] **T241**: Login works inside the WebView
- [ ] **T242**: All dashboard features accessible (scroll through tabs)
- [ ] **T243**: Touch interactions work (tap buttons, swipe, scroll)
- [ ] **T244**: Forms work (add client, add payment — keyboard doesn't cover inputs)
- [ ] **T245**: Camera access works for QR scanning

### 16.3 Mobile-Specific
- [ ] **T246**: Android back button navigates back within the WebView
- [ ] **T247**: iOS swipe-from-edge navigates back
- [ ] **T248**: Offline screen shows when internet is disconnected
- [ ] **T249**: Reconnect after offline → App reloads correctly (Retry button works)
- [ ] **T250**: Push notification permission prompt appears on first launch

### 16.4 Performance
- [ ] **T251**: App loads in under 5 seconds on 4G connection

---

## 🏎️ SECTION 17: Performance & Edge Cases (15 tests)

### 17.1 Speed
- [ ] **T252**: Dashboard loads in under 3 seconds
- [ ] **T253**: Client list with 100+ clients loads in under 2 seconds
- [ ] **T254**: Switching between tabs is instant (no visible loading delay)
- [ ] **T255**: Adding a payment completes in under 2 seconds

### 17.2 Edge Cases
- [ ] **T256**: Very long client name (50+ chars) → Doesn't break the layout
- [ ] **T257**: Phone number with country code (+20...) → Saves correctly
- [ ] **T258**: Special characters in names (أحمد, O'Brien, Jr.) → Saves correctly
- [ ] **T259**: Empty states → When there are 0 payments, the page shows a friendly empty message
- [ ] **T260**: Large payment amount (999,999 EGP) → Displays with proper formatting
- [ ] **T261**: Rapid double-click on "Save" → Doesn't create duplicates
- [ ] **T262**: Refresh page during a form submission → Data is not corrupted

### 17.3 Browser Compatibility
- [ ] **T263**: Chrome (latest) → Everything works
- [ ] **T264**: Safari (latest) → Everything works
- [ ] **T265**: Firefox (latest) → Everything works
- [ ] **T266**: Edge (latest) → Everything works

---

## 🌍 SECTION 18: Localization & UI Polish (10 tests)

- [ ] **T267**: Arabic language toggle (if available) → All labels switch to Arabic
- [ ] **T268**: RTL layout renders correctly in Arabic mode
- [ ] **T269**: EGP currency symbol shows correctly everywhere
- [ ] **T270**: Date format is consistent (DD/MM/YYYY or similar)
- [ ] **T271**: No text overflow or truncation on badges and buttons
- [ ] **T272**: Dark mode (if available) → All components render correctly
- [ ] **T273**: Loading spinners appear during data fetches
- [ ] **T274**: Error messages are user-friendly (no raw Firebase errors shown)
- [ ] **T275**: Success toasts/notifications appear after save actions
- [ ] **T276**: All icons load (no broken image placeholders)

---

## 🔒 SECTION 19: Security Verification (10 tests)

- [ ] **T277**: Non-admin cannot access Settings page
- [ ] **T278**: Sales rep cannot see other reps' clients/payments
- [ ] **T279**: Coach cannot access payments or settings
- [ ] **T280**: Member portal only shows own data (cannot see other members)
- [ ] **T281**: API endpoints return 401 without auth token (test in browser DevTools)
- [ ] **T282**: Console has no sensitive data leaks (no passwords, tokens logged)
- [ ] **T283**: Firebase config in page source doesn't expose admin credentials
- [ ] **T284**: Feature flags actually hide tabs (not just cosmetic — data is also restricted)
- [ ] **T285**: Branding settings are readable by everyone (public), writable by admin only
- [ ] **T286**: Audit logs cannot be deleted by non-CRM-admin users

---

## ✅ SECTION 20: Pre-Meeting Demo Script (10 tests)

> Run this as your final check — this is the exact flow you'll show in the meeting.

- [ ] **T287**: Open the dashboard → Show the clean, professional login page
- [ ] **T288**: Login → Dashboard with live stats, charts, and revenue numbers
- [ ] **T289**: Navigate to Clients → Show the member list with search and filters
- [ ] **T290**: Add a new client live → Show auto-generated Member ID
- [ ] **T291**: Record a payment → Show multi-method (Cash/Instapay), discount system
- [ ] **T292**: Show the Attendance tab → Demonstrate kiosk check-in with Member ID
- [ ] **T293**: Show the Leads tab → Demonstrate lead tracking and stage management
- [ ] **T294**: Open Settings → Show branding customization (change gym name live)
- [ ] **T295**: Show Reports → Revenue charts, sales rep performance
- [ ] **T296**: Open on mobile phone → Show the mobile app or mobile-responsive dashboard

---

## Summary Scorecard

| Section | Tests | Pass | Fail | Skip |
|---|:---:|:---:|:---:|:---:|
| 1. Authentication | 15 | | | |
| 2. Dashboard | 18 | | | |
| 3. Clients | 34 | | | |
| 4. Leads & CRM | 20 | | | |
| 5. Payments | 25 | | | |
| 6. Attendance | 20 | | | |
| 7. PT Sessions | 15 | | | |
| 8. Club Operations | 15 | | | |
| 9. Tasks & Calendar | 10 | | | |
| 10. Settings | 26 | | | |
| 11. Data Import | 10 | | | |
| 12. Reports | 8 | | | |
| 13. Quote Generator | 5 | | | |
| 14. Audit Trail | 5 | | | |
| 15. Multi-Tenant | 10 | | | |
| 16. Mobile App | 15 | | | |
| 17. Performance | 15 | | | |
| 18. Localization | 10 | | | |
| 19. Security | 10 | | | |
| 20. Demo Script | 10 | | | |
| **TOTAL** | **296** | | | |

---

> **Priority order for tonight**: Start with Section 20 (Demo Script), then Sections 1-5, then mobile (Section 16). If time is short, Sections 8, 13, and 15 can be done after the meeting.
