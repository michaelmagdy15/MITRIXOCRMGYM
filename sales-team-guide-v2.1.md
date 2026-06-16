# Sales Team Guide — mitrixogymcrm CRM
# Version 2.1 | April 2026

---

> **This guide explains every feature in full detail:**
> - **Where** to find it in the system
> - **How** to use it step by step
> - **Why** it exists and what it's for
> - **When** to use it
> - Flowcharts for all major operations

---

## Table of Contents

| # | Section |
|---|---|
| 1 | [System Structure & Roles](#1-system-structure--roles) |
| 2 | [Login & Navigation](#2-login--navigation) |
| 3 | [Dashboard](#3-dashboard) |
| 4 | [Leads Management](#4-leads-management) |
| 5 | [Members Management](#5-members-management) |
| 6 | [Payments](#6-payments) |
| 7 | [Attendance](#7-attendance) |
| 8 | [PT Sessions](#8-pt-sessions) |
| 9 | [Tasks](#9-tasks) |
| 10 | [Reports](#10-reports) |
| 11 | [Activity History](#11-activity-history) |
| 12 | [Settings](#12-settings) |
| 13 | [Kiosk & Self Check-in](#13-kiosk--self-check-in) |
| 14 | [Import & Export](#14-import--export) |
| 15 | [Notifications & Alerts](#15-notifications--alerts) |
| 16 | [Full Practical Scenarios](#16-full-practical-scenarios) |
| 17 | [Quick Reference Table](#17-quick-reference-table) |
| 18 | [Future Roadmap](#18-future-roadmap) |

---

# 1. System Structure & Roles

## Why is there a role system?

Every employee has different responsibilities. The system is designed so each person sees only what they need, and cannot modify data that isn't theirs. This protects data integrity and prevents mistakes.

## Available Roles:

```
┌──────────────────────────────────────────────────────┐
│                 Permission Hierarchy                  │
│                                                      │
│              ┌────────────────┐                      │
│              │   CRM Admin    │  ← Highest (Atef)    │
│              └───────┬────────┘                      │
│                      │                               │
│              ┌───────▼────────┐                      │
│              │  Super Admin   │  ← Full access       │
│              └───────┬────────┘                      │
│                      │                               │
│              ┌───────▼────────┐                      │
│              │     Admin      │  ← Settings access   │
│              └───────┬────────┘                      │
│                      │                               │
│              ┌───────▼────────┐                      │
│              │    Manager     │  ← Team manager      │
│              └───────┬────────┘                      │
│                      │                               │
│              ┌───────▼────────┐                      │
│              │      Rep       │  ← Sales rep         │
│              └────────────────┘                      │
└──────────────────────────────────────────────────────┘
```

## Detailed Permissions Matrix:

| Feature | Rep | Manager | Admin | Super Admin | CRM Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Personal Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Global Dashboard | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage Leads | ✅* | ✅ | ✅ | ✅ | ✅ |
| Manage Members | ✅* | ✅ | ✅ | ✅ | ✅ |
| Record Payments | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete Payments | ❌ | ✅ | ✅ | ✅ | ✅ |
| View Reports | ❌ | ✅ | ✅ | ✅ | ✅ |
| Access Settings | ❌ | ✅ | ✅ | ✅ | ✅ |
| Activity Log | ❌ | ✅ | ✅ | ✅ | ✅ |
| Invite Users | ❌ | ✅ | ✅ | ✅ | ✅ |
| Change User Roles | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete Users | ❌ | ❌ | ❌ | ✅ | ✅ |
| Wipe System | ❌ | ❌ | ❌ | ❌ | ✅ |
| Backup / Restore | ❌ | ❌ | ❌ | ❌ | ✅ |

> **Note:** ✅* = sees only their own assigned records

---

# 2. Login & Navigation

## Where?
The main page when you open the system link.

## How to log in:

```
┌────────────────────────────────────────┐
│             Login Screen               │
│                                        │
│  1. Open the system URL                │
│  2. Click "Sign in with Google"        │
│  3. Choose your Google account         │
│  4. ✅ You're in automatically         │
└────────────────────────────────────────┘
```

> **Note:** First login assigns you the "Rep" role. A manager changes your role from Settings.

---

## Navigation

### Desktop:
Top navigation bar with tabs based on your role:

```
┌────────────────────────────────────────────────────────────────────┐
│ [Logo] Dashboard | Leads | Members | Tasks | Payments |            │
│        Attendance | Reports | History | Settings    [🔔] [Name]    │
└────────────────────────────────────────────────────────────────────┘
```

### Mobile:
Bottom tab bar + "More" menu:

```
┌────────────────────────────────────┐
│         Main Content               │
├────────┬────────┬────────┬─────────┤
│  Home  │ Leads  │Members │  Scan   │
│   🏠   │   👤   │  👥    │  📷    │
└────────┴────────┴────────┴─────────┘
```

Press **"More"** to access: Tasks / Payments / Reports / History / Settings / Logout

---

## Global Search

**Where:** Search box in the header
**Why:** Quickly find any member or lead without navigating to a specific page
**When:** Whenever you need to find someone fast by name, phone, or member ID

---

## Notifications (🔔)

**Where:** Bell icon in the header
**Why:** Alerts you to things that need immediate attention
**When:** Check it at the start of every shift

Automatic alerts:
- Lead not contacted in 7+ days ⚠️
- Member's birthday is today 🎂
- Membership expiring within 3 days ⏰
- Overdue task 📋

---

# 3. Dashboard

## Where?
First tab after login — **Dashboard**

## Why does it exist?
The dashboard is the "pulse of the gym" — a full picture of the current situation without navigating anywhere else.

## When to use it?
- First thing every morning
- Before team meetings
- To track your monthly performance

---

## What a Sales Rep sees:

```
┌──────────────────────────────────────────────────────────────────┐
│                   Dashboard — Rep View                           │
├──────────┬──────────────┬──────────────┬────────────────────────┤
│  Leads   │Nearly Expired│   Expired    │  Upcoming Birthdays    │
│  Active  │ Expiring Soon│  Ended       │  Next 7 Days           │
│  [12]    │    [5]       │   [23]       │       [2]              │
├──────────┴──────────────┴──────────────┴────────────────────────┤
│  🎯 Monthly Target: 50,000 LE                                    │
│  ████████████░░░░░░░  Collected: 32,000 LE (64%)                │
├─────────────────────────────┬───────────────────────────────────┤
│  ⚠️ Action Required          │  🔔 Urgent Reminders              │
│  • 3 negative sessions       │  • Lead: Ahmed — 8 days no contact│
│  • 5 with no attendance      │  • Member: Mary — expires tomorrow │
│  • 8 expired need renewal    │  • Task: call overdue 2 days       │
└─────────────────────────────┴───────────────────────────────────┘
```

---

## What a Manager sees additionally:

```
┌──────────────────────────────────────────────────────────────────┐
│  Revenue Trend Chart (Area Chart — 6 months)                     │
│  Jan → Feb → Mar → Apr → May → Jun                               │
├──────────────────────────────────────────────────────────────────┤
│  Rep Performance Bar Chart                                        │
│  Ahmed: ██████ 85%  |  Sara: ████ 60%  |  Karim: █████████ 120% │
├──────────────────────────────────────────────────────────────────┤
│  Payment Methods Breakdown (Stacked Bar)                          │
│  Cash ████ | Instapay ██ | Visa ██████                           │
├──────────────────────────────────────────────────────────────────┤
│  Rep Leaderboard                                                  │
│  # | Name   | Revenue  | Target % | Leads Conv. | Conv.Rate     │
│  1 | Karim  | 48,000  | 120%     | 12          | 40%           │
│  2 | Ahmed  | 34,000  | 85%      | 9           | 30%           │
│  3 | Sara   | 24,000  | 60%      | 6           | 20%           │
└──────────────────────────────────────────────────────────────────┘
```

---

## How to set the monthly target:

**Why:** To define the monthly sales goal for each rep
**When:** Beginning of every month

```
Steps:
1. On Dashboard → click "Edit Target" next to the target bar
2. Enter the goal amount (in LE)
3. Select the rep (if you're a manager)
4. Click Save ✅
```

---

# 4. Leads Management

## Where?
**"Leads"** tab in the top navigation

## Why does it exist?
A lead is any potential customer who hasn't paid yet. The system helps you:
- Track every conversation
- Know where they are in the buying journey
- Never forget anyone
- Measure which marketing channels work best

## When to use it?
- When a new inquiry arrives from any source
- For daily lead follow-ups
- To review who hasn't been contacted

---

## Lead Journey Flowchart:

```
┌────────────────────────────────────────────────────────────────┐
│                 Full Lead Journey                               │
└────────────────────────────────────────────────────────────────┘

New inquiry arrives
        │
        ▼
┌──────────────────┐
│   Add New Lead   │
│   (New Stage)    │
└────────┬─────────┘
         │
         ▼
Contact them ← Log Interaction
         │
         ├── No answer ────────────────► Follow Up
         │                                   │
         │                           Try again later
         │                                   │
         │                          ┌────────┤
         │                          │        │
         │                      Interested  Not interested
         │                          │        │
         │                          ▼        ▼
         │                      Trial Stage  Lost ❌
         │
         ├── Interested ──────────► Set trial appointment
         │                               │
         │                     Did they come?
         │                     ┌──────────┴──────────┐
         │                     │                      │
         │                    Yes                     No
         │                     │                      │
         │                     ▼                      ▼
         │             Did they decide to join?    Follow Up
         │             ┌────────┴────────┐
         │             │                 │
         │            Yes                No
         │             │                 │
         │             ▼                 ▼
         │      Convert to Member    Lost / Follow Up
         │             │
         │             ▼
         │      Record Payment ✅
         │      Active Member 🎉
         │
         └── Rejected ──────────────► Lost ❌
```

---

## Lead Tabs:

```
┌──────┬────────────┬───────────┬──────────┬──────────┬───────────┐
│  All │ Unassigned │ Instagram │ WhatsApp │ Walk-in  │  Trials   │
│  All │  No rep    │  IG leads │  WA leads│Walk-in  │  Trials   │
│leads │  assigned  │           │          │  leads   │ scheduled │
└──────┴────────────┴───────────┴──────────┴──────────┴───────────┘
```

**Why each tab:**
- **All:** Full overview
- **Unassigned:** Leads with no rep — distribute them immediately
- **Instagram/WhatsApp/Walk-in:** See which source delivers best results
- **Trials:** Everyone with a trial scheduled — follow up after trial
- **Follow Up:** Everyone needing follow-up right now

---

## Lead Score Calculation:

```
┌──────────────────────────────────────────────┐
│         How is Lead Score calculated?         │
├──────────────────────────────────────────────┤
│ Source:                                       │
│   Walk-in     → +10 points                   │
│   Instagram   → +7 points                    │
│   WhatsApp    → +6 points                    │
│   TikTok      → +5 points                    │
│   Other       → +3 points                    │
│                                              │
│ Interest:                                    │
│   Interested      → +15 points              │
│   Pending         → +5 points               │
│   Not Interested  → +0                      │
│                                              │
│ Stage:                                       │
│   Trial       → +10 points                  │
│   Follow Up   → +5 points                   │
│   New         → +0                          │
│                                              │
│ Days without contact → up to -20 points     │
└──────────────────────────────────────────────┘
```

**When to use Sort by Score:** When you have limited time and want to focus on the highest-probability leads first.

---

## Adding a new lead — step by step:

**Why:** To save any new prospect's data immediately before forgetting them
**When:** The moment any inquiry arrives (WhatsApp / Instagram / walk-in / call)

```
1. Click "+ Add Lead" (blue button at top of page)
2. Enter:
   ┌────────────────────────────────────────┐
   │ Name*          │ Mohamed Ahmed          │
   │ Phone*         │ 01012345678            │
   │ Source*        │ [Instagram ▼]          │
   │ Branch*        │ [COMPLEX ▼]            │
   │ Assigned To    │ [auto-filled: you]     │
   └────────────────────────────────────────┘
3. Click "Save" ✅
```

---

## Logging an Interaction:

**Why:** The most important action in lead management. Every contact logged builds a complete conversation history.
**When:** After every call, message, or visit

```
Interaction Logging Flowchart:

Open the lead's page
        │
        ▼
Click "Log Interaction"
        │
        ▼
┌──────────────────────────────────────────────┐
│ Interaction type:                             │
│  📞 Call  💬 WhatsApp  📧 Email  🚶 Visit    │
└──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────┐
│ Outcome:                                              │
│  ✅ Interested    → change Stage to Trial             │
│  📵 Not Answered  → set follow-up date               │
│  📅 Scheduled Trial → enter Trial Date               │
│  ❌ Rejected      → change Stage to Lost             │
│  📝 Other        → add a note                        │
└──────────────────────────────────────────────────────┘
        │
        ▼
Set next follow-up date
        │
        ▼
Add notes (optional)
        │
        ▼
Click "Add" ✅
```

---

## Bulk Actions:

**Why:** Save time when dealing with multiple leads at once
**When:** Redistributing leads between reps or updating a group's stage

```
Steps:
1. Select leads using the Checkbox column
2. In the bar that appears at the top, choose:
   ┌──────────────────────────────────────────┐
   │  Change Stage: [Stage ▼] [Apply]          │
   │  Reassign:    [Rep ▼] [Apply]            │
   │  Delete:      [Delete] ← with confirm    │
   └──────────────────────────────────────────┘
```

---

## Converting a Lead to a Member:

**Why:** When a lead agrees to join, they automatically become an active member
**When:** As soon as the lead agrees and pays

```
Lead agrees to join
        │
        ▼
Open the lead's page
        │
        ▼
Click "Convert to Member"
        │
        ▼
Automatically becomes a Member ✅
        │
        ▼
Go to Payments
        │
        ▼
Record payment in their name
        │
        ▼
Membership complete ✅
```

---

# 5. Members Management

## Where?
**"Members"** tab in the navigation

## Why does it exist?
To manage all current members: track their memberships, sessions, renewals, and communications.

## When to use it?
- To register a new member
- To track memberships nearing expiry
- To look up a specific member
- To review a member's history

---

## Member Status Lifecycle:

```
┌──────────────────────────────────────────────────────────────┐
│                   Member Lifecycle                            │
│                                                              │
│  Lead ──► Active ──► Nearly Expired ──► Expired              │
│   👤      ✅ Active  ⚠️ Expiring < 30d   ❌ Ended             │
│                                                              │
│  Or: Active ──► Hold (temporarily paused)                    │
└──────────────────────────────────────────────────────────────┘
```

| Status | Meaning | Required Action |
|---|---|---|
| **Active** ✅ | Active membership, sessions remaining | None |
| **Nearly Expired** ⚠️ | Expiring within 30 days | Contact to renew |
| **Expired** ❌ | Membership ended | Urgent renewal contact |
| **Hold** ⏸️ | Temporarily paused | Wait for their decision |
| **Lead** 👤 | Has not subscribed yet | Follow up to convert |

---

## Renewal Pipeline:

**Where:** "Renewal Pipeline" button at the top of the Members page
**Why:** A smart tool that gathers everyone who needs renewal in one view, sorted by urgency
**When:** Every day — especially at the start and middle of the month

```
┌────────────────────────────────────────────────────────────────┐
│                      Renewal Pipeline                          │
├──────────────────┬─────────────────┬──────────────────────────┤
│  🔴 Expired       │  🟡 Urgent       │  🔵 Upcoming              │
│  Membership ended│  ≤ 7 days left   │  8-30 days left          │
│                  │                 │                           │
│  [Karim]         │  [Sara]          │  [Ahmed]                 │
│  Ended 5 days ago│  Ends in 3 days  │  Ends in 20 days         │
│  [Mark Contacted]│  [Mark Contacted]│  [Mark Contacted]        │
│  [Record Renewal]│  [Record Renewal]│  [Record Renewal]        │
└──────────────────┴─────────────────┴──────────────────────────┘
```

**"Mark Contacted":** Records that you reached out (updates last contact date)
**"Record Renewal":** Opens a renewal payment dialog directly

---

## Renewal Process Flowchart:

```
Member is about to expire
        │
        ▼
Appears in Renewal Pipeline (Upcoming/Urgent)
        │
        ▼
Call / WhatsApp the member
        │
        ├── Agreed to renew ──────────────────────────────────┐
        │                                                      │
        ├── Needs to think → click "Mark Contacted"            │
        │                    set follow-up date                │
        │                                                      │
        └── Refused → log Interaction (Rejected)               │
                      set status to Hold or let expire         │
                                                              ▼
                                          Click "Record Renewal"
                                                              │
                                                              ▼
                                          Enter: Amount + Package
                                          + Payment method + Start date
                                                              │
                                                              ▼
                                          Click Save ✅
                                                              │
                                                              ▼
                                          Membership renewed automatically
```

---

# 6. Payments

## Where?
**"Payments"** tab in the navigation

## Why does it exist?
To record every payment and link it to the member, rep, and package. This is the foundation for revenue and commission calculations.

## When to use it?
- Immediately after receiving any payment (new or renewal)
- To look up a past payment
- To print an invoice

---

## Full Payment Recording Flowchart:

```
Click "+ New Payment"
        │
        ▼
Search for the client in the "Client" field
        │
        ▼ (name and rep auto-filled)
        │
        ▼
Enter amount in LE
        │
        ▼
Choose payment method:
┌──────────────────────────────────────────────────────────────┐
│  💵 Cash          → enter amount only                         │
│  💳 Credit Card   → enter amount only                         │
│  🏦 Bank Transfer → enter amount only                         │
│  📱 Instapay      → enter amount + 12-digit reference (req.) │
│  📦 Other         → enter amount only                         │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
Choose package:
  • Select from list (price auto-fills)
  • Or select "Custom" and enter a custom name
        │
        ▼
Is it a Private Training package?
   Yes → select coach from dropdown (required)
   No  → skip
        │
        ▼
Enter start date (end date auto-calculated)
        │
        ▼
Add notes (optional)
        │
        ▼
Verify "Recorded By" is correct
        │
        ▼
Click "Save Payment" ✅
        │
        ▼
Payment saved and added to revenue automatically
```

---

## Print Invoice:

**Why:** To give the client a formal receipt
**When:** When any client requests a receipt

```
Steps:
1. In the payments list, find the payment
2. Click the 🖨️ Print icon
3. A print window opens with:
   ┌──────────────────────────────────┐
   │   [Logo] mitrixogymcrm           │
   │   Payment Receipt #001           │
   │                                  │
   │  To: Mary Mohamed | ID: #0042    │
   │  Branch: MIVIDA                  │
   │  Date: 20 Apr 2026              │
   │  Method: Cash                    │
   │                                  │
   │  10 Sessions Private Adult  1x  │
   │                   Total: 2,500 LE│
   └──────────────────────────────────┘
4. Select printer and print
```

---

# 7. Attendance

## Where?
**"Attendance"** tab (or "Scan" on mobile)

## Why does it exist?
To track member attendance and deduct sessions. Also helps identify absent members at risk of churning.

## When to use it?
- When members arrive at the gym (if kiosk isn't available)
- To review a specific member's attendance history

---

## Attendance Recording Flowchart:

```
┌───────────────────────────────────────────────┐
│          Attendance Recording Options          │
└───────────────────────────────────────────────┘

          ┌──────────┴──────────┐
          │                     │
    QR Scanner               Manual
    (Kiosk)                  Entry
          │                     │
          ▼                     ▼
  Member scans           Search by name
  their QR Code          or Member ID
          │                     │
          ▼                     ▼
  Member info          Select branch
  shows on screen
          │                     │
          ▼                     ▼
  Click "Confirm"       Click "Check In"
          │                     │
          └──────────┬──────────┘
                     │
                     ▼
          ✅ Attendance recorded
          (session deducted automatically)
```

---

# 8. PT Sessions

## Where?
"PT Sessions" tab, or from within a member's profile

## Why does it exist?
To schedule and track every 1-on-1 Personal Training session precisely — with coach, status, and automatic session deduction.

## When to use it?
- To schedule new PT sessions
- To record attendance or no-show for a PT session
- To review PT statistics

---

## PT Sessions Dashboard:

```
┌──────────────────────────────────────────────────────────────────┐
│  Month-to-Date (MTD) Stats                                       │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│Packages Logged│  Attended    │  No Shows    │  Attendance Rate   │
│    [45]       │    [38]      │    [7]       │      [84%]         │
└──────────────┴──────────────┴──────────────┴────────────────────┘

  📅 Calendar         │  Sessions on April 20
  ← April 2026 →     │  Time  | Client | Coach  | Status
  Selected in blue   │  10:00 | Mary   | Karim  | Attended
                     │  12:00 | Ali    | Sara   | Scheduled
                     │  15:00 | Hana   | Karim  | No Show
```

---

## Session Status Update:

```
In the sessions table → Status column:
Select from [Scheduled ▼]:

  ✅ Attended   → deducts 1 session from client's balance
  ❌ No Show    → deducts 1 session (client loses it)
  🚫 Cancelled  → no session deducted
  📅 Scheduled  → not yet occurred
```

---

# 9. Tasks

## Where?
**"Tasks"** tab in the navigation

## Why does it exist?
To organize daily team tasks, assign responsibilities, and track due dates.

## When to use it?
- To assign a task to yourself or a colleague
- To review overdue tasks
- To link a task to a specific client

---

## Creating a Task:

```
Click "+ Add Task"
        │
        ▼
┌────────────────────────────────────────────────────┐
│ Title*           │ Follow up with Mary              │
│ Description      │ Check if she liked the trial     │
│ Due Date*        │ [Apr 21, 2026]                   │
│ Priority*        │ [High 🔴▼]                       │
│ Status           │ [Pending ▼]                      │
│ Assigned To      │ [Ahmed ▼]                        │
│ Related Client   │ [Mary Mohamed ▼] (optional)      │
└────────────────────────────────────────────────────┘
        │
        ▼
Click "Create Task" ✅
```

---

## Priority Guide:

```
🔴 High   → Directly affects revenue or member satisfaction
            Example: member wants to cancel / lead ready to buy

🟡 Medium → Important but not urgent
            Example: review a report / schedule a meeting

🟢 Low    → Can be deferred
            Example: update a profile photo / tidy lead list
```

---

## Task Permissions:

- **Assignee only:** Can change status only (Pending/In Progress/Completed)
- **Creator or Manager:** Can edit everything or delete the task

---

# 10. Reports

## Where?
**"Reports"** tab — visible to Managers only

## Why does it exist?
Reports answer strategic questions that don't appear in the normal screens.

## When to use it?
- Monthly performance review meetings
- Budget and marketing decisions
- Spotting problems before they escalate

---

## Report 1: Lead Source ROI

**Why:** To know which marketing channel deserves more investment
**When:** Monthly, to review the marketing budget

```
┌──────────────────────────────────────────────────────────────────┐
│                  Lead Source ROI Report                          │
├─────────────┬──────────┬───────────┬──────────┬─────────────────┤
│   Source    │  Leads   │ Converted │ Conv.%   │  Revenue        │
├─────────────┼──────────┼───────────┼──────────┼─────────────────┤
│ Instagram   │  120     │    36     │  30%     │  90,000 LE      │
│ Walk-in     │   45     │    22     │  49%     │  55,000 LE      │
│ WhatsApp    │   80     │    18     │  23%     │  45,000 LE      │
│ TikTok      │   30     │     5     │  17%     │  12,500 LE      │
│ Other       │   25     │     4     │  16%     │  10,000 LE      │
└─────────────┴──────────┴───────────┴──────────┴─────────────────┘
```

**How to read it:**
- Walk-in: Highest conversion rate (49%) — direct visits are highest quality
- Instagram: Most leads and most revenue — worth continued investment
- TikTok: Low conversion — strategy needs review

---

## Report 2: Churn Risk

**Why:** Discover members about to leave the gym
**When:** Weekly — before they decide to quit themselves

```
┌──────────────────────────────────────────────────────────────────┐
│                      Churn Risk Report                           │
│      (Active members with no attendance in 14+ days)             │
├──────────────┬──────────────┬──────────────────┬─────────────────┤
│    Name      │   Phone      │  Last Attendance  │  Days Absent   │
├──────────────┼──────────────┼──────────────────┼─────────────────┤
│ Ahmed Samir  │ 01012345678  │  April 5          │  15 days        │
│ Sara Mohamed │ 01198765432  │  April 2          │  18 days        │
│ Karim Ali    │ 01234567890  │  March 28         │  23 days        │
└──────────────┴──────────────┴──────────────────┴─────────────────┘
```

---

## Report 3: Cohort Retention

**Why:** To understand long-term member retention rate
**When:** Quarterly or semi-annually

```
┌────────────────────────────────────────────────────────────────┐
│                   Cohort Retention Report                       │
├──────────────┬──────────┬──────────┬──────────┬───────────────┤
│   Cohort     │ Members  │ Renewed  │ Churned  │ Retention %   │
├──────────────┼──────────┼──────────┼──────────┼───────────────┤
│ Jan 2026     │   40     │   28     │   12     │    70%        │
│ Feb 2026     │   35     │   24     │   11     │    69%        │
│ Mar 2026     │   50     │   38     │   12     │    76%        │
│ Apr 2026     │   45     │   -      │   -      │   ongoing     │
└──────────────┴──────────┴──────────┴──────────┴───────────────┘
```

---

## Report 4: Revenue Forecast

**Why:** Predict renewal revenue before month end for planning
**When:** In the first 10 days of every month

```
┌────────────────────────────────────────────────────────────────┐
│                      Revenue Forecast                           │
├──────────────────────────────┬─────────────────────────────────┤
│ Members expiring this month  │            48 members           │
│ Value at risk                │          120,000 LE             │
│ Renewal rate (last 3 months) │             72%                 │
│ Projected renewal revenue    │           86,400 LE             │
└──────────────────────────────┴─────────────────────────────────┘
```

---

# 11. Activity History

## Where?
**"History"** tab — Managers only

## Why does it exist?
Accountability and transparency — every change in the system is recorded with timestamp and the name of who made it.

## When to use it?
- Investigating unexpected data changes
- Reviewing who deleted a payment or changed a member's data
- Monthly auditing

---

## Reading the Log:

```
┌──────────────────────────────────────────────────────────────────┐
│                         Audit Log                                │
├──────────────────────────────────────────────────────────────────┤
│  [Search]  [Entity Type ▼]  [Action ▼]  [Branch ▼]              │
├──────────┬──────────┬──────────┬────────────────┬───────────────┤
│ Timestamp│   User   │  Action  │    Details     │   Branch      │
├──────────┼──────────┼──────────┼────────────────┼───────────────┤
│ 20 Apr   │  Ahmed   │ 🟢CREATE │ New payment    │  COMPLEX      │
│ 10:32 AM │          │ Payment  │ 2500 LE Cash   │               │
├──────────┼──────────┼──────────┼────────────────┼───────────────┤
│ 20 Apr   │  Sara    │ 🔵UPDATE │ Stage changed  │  MIVIDA       │
│ 11:15 AM │          │   Lead   │ New → Trial    │               │
├──────────┼──────────┼──────────┼────────────────┼───────────────┤
│ 20 Apr   │  Karim   │ 🔴DELETE │ Payment deleted│  COMPLEX      │
│  2:30 PM │          │ Payment  │ 1000 LE        │               │
└──────────┴──────────┴──────────┴────────────────┴───────────────┘
```

🟢 **CREATE** = new data added
🔵 **UPDATE** = existing data modified
🔴 **DELETE** = data removed

---

# 12. Settings

## Where?
**"Settings"** tab — Managers and Admins only

## Why does it exist?
To configure everything: branding, users, packages, coaches, branches, and commissions.

---

## Settings Tabs:

```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Branding │  Users   │ Branches │ Packages │ Coaches  │Commission│  Backup  │Danger ⚠️ │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

---

## Branding Tab:

**Why:** Personalize the system with the gym's identity
**When:** When changing the logo, company name, or PINs

```
┌────────────────────────────────────────────────────┐
│  Company Name*     │ mitrixogymcrm                  │
│  Logo URL          │ https://...logo.png            │
│                    │ [Logo preview here]            │
│  Kiosk PIN         │ ••••••  (6 digits)             │
│  Self Check-in PIN │ ••••••  (6 digits)             │
└────────────────────────────────────────────────────┘
Click "Save" to apply changes
```

---

## Users Tab:

### Inviting a new user:

```
Click "Invite User"
        │
        ▼
┌───────────────────────────────────────────┐
│  Email*    │ ahmed@mitrixogymcrm.com              │
│  Role*     │ [Rep ▼]                      │
└───────────────────────────────────────────┘
        │
        ▼
Click "Invite" ✅
        │
        ▼
Employee receives invitation
        │
        ▼
Employee logs in with Google ← role assigned automatically
```

### Editing a user:

```
In the users list → click "Edit" next to the employee
        │
        ▼
┌────────────────────────────────────────────────────────┐
│  Name           │ Ahmed Mohamed                        │
│  Email          │ ahmed@mitrixogymcrm.com                     │
│  Branch         │ [COMPLEX ▼]                         │
│  Monthly Target │ 40,000 LE                            │
│  Extra permissions:                                    │
│  ☐ Can Delete Payments                                │
│  ☐ Can View Global Dashboard                          │
│  ☐ Can Access Settings                               │
└────────────────────────────────────────────────────────┘
        │
        ▼
Click "Save" ✅
```

---

## Branches Tab:

**Why:** Manage gym branches and print QR codes for each branch's attendance
**When:** When opening a new branch

```
Current branches:
┌──────────────────────────────────────────────┐
│  COMPLEX       [Print QR] [Remove]           │
│  MIVIDA        [Print QR] [Remove]           │
│  mitrixogymcrm IMPACT [Print QR] [Remove]           │
└──────────────────────────────────────────────┘

Add new branch:
[New branch name]  [Add]
```

### Printing a Branch QR Code:

**Why:** To place at the branch entrance — members scan it to access the self check-in page
**When:** Setting up a new branch or refreshing the QR code

```
Click "Print QR" next to the branch name
        │
        ▼
A print window opens with:
┌──────────────────────────────────┐
│    [Logo] mitrixogymcrm          │
│                                  │
│         [Large QR Code]          │
│                                  │
│       Scan to Check-in           │
│      COMPLEX Branch              │
│                                  │
│  Please ask the front desk       │
│  for today's PIN                 │
└──────────────────────────────────┘
```

---

## Packages Tab:

**Why:** To define available memberships with prices and sessions
**When:** Adding a new package or changing a price

```
Click "+ Add Package"
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│  Name*          │ 10 Sessions Private Adult               │
│  Sessions*      │ [10] ← or ☑ Unlimited                  │
│  Price (LE)*    │ 2,500                                   │
│  Validity (days)│ 30                                      │
│  Branch         │ [ALL ▼] or a specific branch            │
│  Type*          │ [Private ▼]                             │
└────────────────────────────────────────────────────────────┘
        │
        ▼
Click "Save Package" ✅
```

---

## Commission Tab:

**Why:** To define PT and Group commission rates and review monthly earnings per rep
**When:** Monthly, or when changing commission rates

```
┌────────────────────────────────────────────────────────────────┐
│  PT Rate: [15%]   Group Rate: [10%]   [Save Rates]             │
├────────────────────────────────────────────────────────────────┤
│  Commission Report [April 2026 ▼]                              │
├──────────┬──────────┬──────────┬──────────┬────────────────────┤
│   Rep    │ PT Rev.  │Group Rev.│  Total   │   Commission       │
├──────────┼──────────┼──────────┼──────────┼────────────────────┤
│  Ahmed   │ 15,000  │  20,000  │  35,000  │   5,250 LE        │
│  Sara    │  8,000  │  16,000  │  24,000  │   2,800 LE        │
│  Karim   │ 12,000  │  22,000  │  34,000  │   3,800 LE        │
└──────────┴──────────┴──────────┴──────────┴────────────────────┘
                                             [Export CSV]
```

---

# 13. Kiosk & Self Check-in

## Kiosk Mode

## Where?
URL: `/kiosk`

## Why does it exist?
A dedicated screen for the gym entrance — members scan their QR code to check in automatically without staff involvement.

## When to use it?
Always — runs on a tablet or screen at every branch entrance.

---

## Kiosk Flowchart:

```
┌───────────────────────────────────────────────────────────────┐
│                      Kiosk Journey                             │
└───────────────────────────────────────────────────────────────┘

PIN entry screen
        │
        ▼
Correct PIN?
   No → Error message + clear field
   Yes →
        ▼
Main kiosk screen
  [Logo]  [KIOSK MODE]  [Lock 🔒]
  Select branch: [COMPLEX ▼]
        │
        ▼
Member holds QR code in front of camera
        │
        ▼
Screen shows:
  ✅ Scan Successful
  Name: Mary Mohamed
  Member ID: #0042
  Package: 10 Sessions Private
  Sessions Remaining: 6 (green)
        │
        ▼
Click "Confirm Attendance"
        │
        ▼
✅ Attendance recorded — session deducted
        │
        ▼
Screen returns to standby
```

---

## Self Check-in Page

## Where?
URL: `/checkin` or by scanning the branch QR code

## Why does it exist?
For members who don't pass in front of the camera — they enter their details manually.

```
Member opens the page (from branch QR code)
        │
        ▼
Selects branch (COMPLEX / MIVIDA / mitrixogymcrm IMPACT)
        │
        ▼
Enters Member ID or phone number
        │
        ▼
Enters today's PIN (given by reception)
        │
        ▼
Clicks "Check In"
        │
        ▼
✅ Check-in Successful!
   Welcome, Mary!
   (auto-resets after 2 seconds)
```

---

# 14. Import & Export

## Why does it exist?
To move large volumes of data from Excel or Google Sheets into the system all at once, instead of manual entry.

---

## Full Import Flowchart:

```
┌───────────────────────────────────────────────────────────────┐
│                     Import Workflow                            │
└───────────────────────────────────────────────────────────────┘

Go to Leads or Members → click "Import Data"
        │
        ▼
┌───────────────────────────────────────────────┐
│          Step 1: Upload                        │
│  Upload CSV ─── or ─── Paste Google Sheets URL│
│             Click "Parse"                      │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│          Step 2: Map Columns                   │
│  CSV Column → System Field                    │
│  "Full Name" → Name ✅ (auto)                 │
│  "Mobile"   → Phone ✅ (auto)                 │
│  "Start"    → Start Date ⚙️ (manual)         │
│  "Package"  → Package Type ✅ (auto)          │
│  Click "Continue"                             │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│          Step 3: Importing                     │
│  ████████████████░░░░ 75%                     │
│  Imported: 150 | Errors: 3                    │
│  Error row 23: invalid date format            │
│  Error row 87: duplicate phone number         │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│          Step 4: Result                        │
│  ✅ Imported: 197 records                     │
│  ❌ Failed: 3 rows                            │
│  [View Errors]  [Done]                        │
└───────────────────────────────────────────────┘
```

---

## Rolling Back an Import:

**Why:** If you discover after importing that data is wrong
**When:** Immediately after discovering the issue

```
Steps:
1. Click "Import History"
2. Find the import batch
3. Click "Rollback"
4. Confirm ✅
5. All records from that batch are deleted
```

---

# 15. Notifications & Alerts

## Where?
🔔 bell icon in the header

## Why does it exist?
So nothing important slips through — the system monitors and alerts you automatically.

## When to check it?
At the start of every working day.

---

## Automatic Notification Types:

```
┌──────────────────────────────────────────────────────────────────┐
│  🔔 Notification Center (3 new)                                  │
├──────────────────────────────────────────────────────────────────┤
│  ⚠️  Lead: Mohamed Ahmed — no contact in 8 days    [X Dismiss]   │
│  🎂  Birthday: Sara Karim — Today!                 [X Dismiss]   │
│  ⏰  Expiring: Ali Mahmoud — in 2 days             [X Dismiss]   │
│  📋  Overdue task: follow-up call for Karim        [X Dismiss]   │
├──────────────────────────────────────────────────────────────────┤
│                        [Dismiss All]                              │
└──────────────────────────────────────────────────────────────────┘
```

---

# 16. Full Practical Scenarios

---

## Scenario 1: A Rep's Ideal Work Day

```
9:00 AM — Open the system
        │
        ▼
1. Review 🔔 Notifications
   • Act on every alert immediately or schedule a follow-up
        │
        ▼
2. Open Dashboard
   • Check the KPI cards
   • Review Action Required and Urgent Reminders
        │
        ▼
3. Open Leads → My Leads → Sort by Score
   • Start with the highest score
   • Log an interaction for each lead you contact
        │
        ▼
4. Open Renewal Pipeline
   • Handle Expired first ← urgent contact
   • Then Urgent ← plan contact today or tomorrow
        │
        ▼
5. Review Tasks
   • Complete overdue tasks first
   • Update status of ongoing tasks
        │
        ▼
Throughout the day:
   • Any new lead → add immediately
   • Any payment → record immediately
   • Any contact → log Interaction
```

---

## Scenario 2: New Instagram Inquiry

```
Received message: "How much is a membership?"
        │
        ▼
Click "+ Add Lead"
Enter: Name + Phone + Source: Instagram + Branch
        │
        ▼
Reply with pricing info
        │
        ▼
Log Interaction:
  Type: WhatsApp
  Outcome: Interested (if interested) or Not Answered
  Follow-up: tomorrow
        │
        ▼
If interested → set trial date
Stage → Trial | enter Trial Date
        │
        ▼
After trial → Log Interaction
  Yes, joining → Convert to Member → record payment
  Needs time   → Stage: Follow Up | set follow-up
  Declined     → Stage: Lost
```

---

## Scenario 3: Member Wants to Renew

```
Member calls to renew
        │
        ▼
Search for them in Members
        │
        ▼
Check their details: current package, remaining sessions
        │
        ▼
Go to Payments → "+ New Payment"
        │
        ▼
Select client → enter amount → select new package
Select payment method → enter start date
        │
        ▼
Click "Save Payment" ✅
        │
        ▼
Membership renews automatically
        │
        ▼
Print Invoice if they want a receipt
        │
        ▼
Log Interaction on their profile: "Renewed membership"
```

---

## Scenario 4: Setting Up Kiosk at a New Branch

```
Open Settings → Branding
        │
        ▼
Confirm:
  Company Name ✅
  Logo ✅
  Kiosk PIN: 6 digits — store it safely
        │
        ▼
Go to Settings → Branches
        │
        ▼
Add the new branch name → click "Add"
        │
        ▼
Click "Print QR" for the new branch
Print and place it at the entrance
        │
        ▼
Open /kiosk on the tablet
        │
        ▼
Enter the Kiosk PIN ✅
        │
        ▼
Select the new branch from the dropdown
        │
        ▼
Kiosk is ready 🎉
```

---

## Scenario 5: Reviewing Team Performance (Manager)

```
Go to Dashboard
        │
        ▼
Scroll to Rep Performance Leaderboard
        │
        ▼
Select the month using ← → navigation
        │
        ▼
Read the table:
  Who hit their target?
  Who needs support?
  Who has the highest conversion?
        │
        ▼
Go to Reports → Lead Source ROI
  Which source gave us the best results this month?
        │
        ▼
Go to Reports → Churn Risk
  Which members are at risk of leaving?
  Distribute the outreach list to the team
        │
        ▼
Settings → Commission
  Review monthly commissions
  Export CSV for accounting
```

---

## Scenario 6: Import 200 Leads from Google Sheets

```
Download the Sheet as CSV (File → Download → CSV)
        │
        ▼
Go to Leads → "Import Data"
        │
        ▼
Upload the CSV file
Click "Parse"
        │
        ▼
Verify column mapping:
  "Name" → Name ✅
  "Phone" → Phone ✅
  "Source" → Source ✅
  (any unmatched column → map manually)
        │
        ▼
Click "Continue"
        │
        ▼
Wait for import to finish
Review errors (if any)
        │
        ▼
"Done" ✅
200 leads added in seconds
```

---

## Scenario 7: Investigating a Suspicious Payment

```
Manager spots a payment with an incorrect amount
        │
        ▼
Go to History (Audit Log)
        │
        ▼
Filter by: Entity = Payments | Action = CREATE or DELETE
        │
        ▼
Search by approximate date
        │
        ▼
Find the record: who recorded it, when, and for how much
        │
        ▼
If incorrect:
  Go to Payments → find the payment
  Click "Delete" (requires Can Delete Payments permission)
  Record a new correct payment
```

---

# 17. Quick Reference Table

## Where to find what:

| What I want to do | Where | Button |
|---|---|---|
| Add a new lead | Leads | + Add Lead |
| Follow up on a lead | Leads → open lead | Log Interaction |
| Convert lead to member | Leads → open lead | Convert to Member |
| Add a new member | Members | + Add Member |
| Search for a member | Any page | Global Search (header) |
| Record a payment | Payments | + New Payment |
| Print an invoice | Payments → find payment | 🖨️ Print icon |
| Track renewals | Members | Renewal Pipeline |
| Manual attendance | Attendance | Manual Check-in |
| Schedule a PT session | PT Sessions | Log PT Usage |
| Add a task | Tasks | + Add Task |
| See team performance | Dashboard | Leaderboard (bottom) |
| View commission report | Settings → Commission | Select month |
| Import data | Leads or Members | Import Data |
| Export data | Any page | Export CSV |
| Add a coach | Settings → Coaches | + Add Coach |
| Add a package | Settings → Packages | + Add Package |
| Add a branch | Settings → Branches | Add Branch |
| Invite a new staff member | Settings → Users | Invite User |
| Edit staff permissions | Settings → Users → Edit | Edit dialog |
| Review data changes | History | Filter by Entity / Action |
| Take a backup | Settings → Backup | Export Database |

---

## Emergency Reference — What if:

| Problem | Solution |
|---|---|
| Member says "my sessions count is wrong" | Members → open their profile → check package history |
| Payment recorded with wrong amount | History → investigate → Payments → delete and re-record |
| Lead assigned to the wrong rep | Leads → open lead → change Assigned To |
| Forgot kiosk PIN | Settings → Branding → check Kiosk PIN field |
| Imported wrong data | Leads/Members → Import History → Rollback |
| Staff member left, need to revoke access | Settings → Users → Delete |
| Member wants to freeze membership | Members → open member → change Status to Hold |

---

# 18. Future Roadmap

## Upcoming Suggested Features — Mini Roadmap

```
┌──────────────────────────────────────────────────────────────────┐
│              mitrixogymcrm CRM Roadmap                            │
│                     2026 — 2027                                  │
└──────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Q2 2026   (April — June)       HIGH PRIORITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌────────────────────────────────────────────────┐
  │ 📱 Native Mobile App (iOS + Android)           │
  │    • Push Notifications                        │
  │    • QR scanning with phone camera             │
  │    • Offline Mode (works without internet)     │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 💬 WhatsApp Business API Integration           │
  │    • Auto messages when membership expires     │
  │    • Automatic PT appointment confirmations    │
  │    • Scheduled marketing campaigns             │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 📊 Advanced Financial Dashboard                │
  │    • Monthly P&L (Profit & Loss)               │
  │    • Branch expense tracking                   │
  │    • Net revenue after commissions             │
  └────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Q3 2026   (July — September)   MEDIUM PRIORITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌────────────────────────────────────────────────┐
  │ 🎯 Integrated Loyalty Points System            │
  │    • Earn points per attendance                │
  │    • Redeem points for discounts or gifts      │
  │    • Member page to view point balance         │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 🤖 AI Predictions & Suggestions                │
  │    • Predict who will leave (Churn Prediction) │
  │    • Suggest best time to contact a lead       │
  │    • Analyze patterns to boost conversion      │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 💳 Integrated Online Payment Gateway           │
  │    • Paymob / Fawry Integration                │
  │    • Members pay online                        │
  │    • Auto-recorded in the system               │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 📅 Class Scheduling System                     │
  │    • Weekly class timetable                    │
  │    • Members book spots online                 │
  │    • Track attendance per class                │
  └────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Q4 2026   (October — December)  LONG-TERM VISION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌────────────────────────────────────────────────┐
  │ 🏪 Member Portal                               │
  │    • Members view their sessions & attendance  │
  │    • Book PT sessions                          │
  │    • Renew membership online                   │
  │    • View loyalty points                       │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 📈 Advanced Business Intelligence Reports      │
  │    • Customer Lifetime Value (LTV)             │
  │    • Quarterly and annual reports with compar. │
  │    • NPS (member satisfaction score)           │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 🔗 External Integrations                       │
  │    • Google Calendar for PT appointments       │
  │    • Mailchimp for email campaigns             │
  │    • Facebook Ads for lead tracking            │
  └────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2027     Expansion Vision
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌────────────────────────────────────────────────┐
  │ 🌐 Multi-Gym Platform                          │
  │    • Manage multiple gyms from one account     │
  │    • Transfer members between sister branches  │
  │    • Cross-gym performance comparison board    │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ 🎥 Smart Digital Signage                       │
  │    • Ads displayed on kiosk between visits     │
  │    • Personalized offers per member package    │
  └────────────────────────────────────────────────┘
```

---

## What the system can do RIGHT NOW — full list:

```
Data Management:
✅ Add / edit / delete leads and members
✅ Import data from CSV and Google Sheets
✅ Export any data to Excel (CSV)
✅ Full system backups
✅ Merge duplicate records

Sales Management:
✅ Track the lead journey from inquiry to membership
✅ Log every interaction with a lead or member
✅ Automatic Lead Scoring
✅ Visual renewal management (Renewal Pipeline)
✅ Set monthly targets per rep
✅ Leaderboard comparing rep performance

Payments:
✅ Record payments with multiple methods
✅ Instapay 12-digit reference validation
✅ Print professional invoices
✅ Export payment records

Attendance:
✅ QR Code kiosk for automatic check-in
✅ Manual check-in from the system
✅ Self check-in for members
✅ View every member's attendance history

PT Sessions:
✅ Schedule PT sessions with date, time, and coach
✅ Track attendance, no-shows, and cancellations
✅ Auto-deduct sessions upon attendance
✅ Monthly PT statistics

Reports & Analytics:
✅ Lead Source ROI report
✅ Churn Risk report
✅ Cohort Retention report
✅ Revenue Forecast report
✅ Monthly revenue trend charts
✅ Payment method breakdown
✅ Rep commission reports

Administration:
✅ Full role and permissions system (5 roles)
✅ User management and invitations
✅ Manage packages, coaches, and branches
✅ Complete activity audit log
✅ Smart automatic notifications
✅ Brand customization (logo, name, PINs)
✅ Multi-branch support
✅ Responsive UI (mobile + desktop)
✅ Fast global search
```

---

## Final Note:

> The more data you put in, the more insight you get out.
> Every interaction you log, every payment you record, every lead you follow up
> builds a complete picture that helps you sell more and lose fewer members.

---

*Version 2.1 | mitrixogymcrm CRM | April 2026*
*For technical support: contact the system administrator*
