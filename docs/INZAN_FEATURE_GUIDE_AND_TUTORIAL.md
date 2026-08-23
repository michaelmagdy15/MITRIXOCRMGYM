# Inzan Athletics — Platform Feature Guide & User Manual

**Tenant:** Inzan Athletics (`inzanathletics`)  
**Platform Version:** 1.0 (Firebase Multi-Tenant Engine)  
**Date:** August 2026  
**Document Purpose:** Comprehensive feature map, step-by-step user tutorials, and client verification checklist to confirm completion of the Session Management and Group Classes system.

---

## 📑 Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Role-Based Access & Feature Locations](#2-role-based-access--feature-locations)
3. [Step-by-Step User Tutorials](#3-step-by-step-user-tutorials)
   - 3.1 [Member / Client Workflows](#31-member--client-workflows)
   - 3.2 [Instructor / Coach Workflows](#32-instructor--coach-workflows)
   - 3.3 [Manager / Front Desk Workflows](#33-manager--front-desk-workflows)
4. [Automated Background Rules & Logic](#4-automated-background-rules--logic)
5. [Client Verification & Sign-Off Checklist](#5-client-verification--sign-off-checklist)

---

## 1. System Overview & Architecture

The Inzan Athletics platform provides a fully isolated, automated gym management ecosystem designed for:
- **Clients (Members):** Mobile and web experience for browsing classes, 1-click booking, joining waitlists, booking PT sessions, requesting freezes, and rating workouts.
- **Instructors (Coaches):** Mobile/web portal to set weekly schedules, configure capacity limits per session type, take in-studio attendance, manage assigned assessment leads, and submit cancellation requests.
- **Front Desk / Managers (Supervisors & Admins):** Web CRM to manage class schedules, review member freeze & assessment requests, track visual analytics heatmaps, and monitor instructor performance.
- **Automated Cloud Services:** Background tasks for FIFO waitlist auto-promotion, automated no-show detection, and session credit balance management.

---

## 2. Role-Based Access & Feature Locations

### 📱 Member Portal (Mobile / Web App)
Accessed by members when logging into `inzanathletics.mitrixo.com` or via the mobile app.

| Feature | Where to Find in App | Description |
|---|---|---|
| **Group Classes Booking** | Bottom Bar → **`Bookings`** → **`Group Classes`** | Browse weekly/monthly schedules, filter by coach/category, 1-click book, or join the automated waitlist. |
| **Personal Training (PT)** | Bottom Bar → **`Bookings`** → **`PT Sessions`** | Select coach, date, and hourly slot to book 1-on-1, Partner, or Small Group sessions. |
| **Request Free Assessment** | Bottom Bar → **`Bookings`** → **"Request Assessment"** | Submit an assessment request with coach preference, date/time availability, injury notes, and fitness goals. |
| **Membership Freeze (Max 7 Days)** | Bottom Bar → **`Profile`** → **`Packages`** → **"Request Freeze"** | Request a temporary hold on an active package, automatically queued for manager approval. |
| **Session Ratings & Feedback** | Triggered on session completion / Session card | Rate workouts (1–5 stars) and submit text feedback for coaches. |
| **Digital Member Pass** | Bottom Bar → **`Pass`** (`/home`) | Dynamic QR code for kiosk check-in upon arrival. |
| **Progress & Body Tracker** | Bottom Bar → **`Profile`** → **`Progress`** | Track body measurements, weight, and attendance streak. |

---

### 🥊 Coach / Instructor Portal
Accessed by coaches logging into their account (or via role preview in local testing).

| Feature | Where to Find in Portal | Description |
|---|---|---|
| **Class Rosters & In-Studio Check-In** | Coach Portal → **`Classes`** Tab | Real-time member roster, 1-tap manual check-in for members walking straight into class, and class cancellation requests. |
| **PT Session Schedule** | Coach Portal → **`Sessions`** Tab → Schedule | View daily/weekly booked sessions, remaining availability, and mark sessions as `Attended`, `No Show`, or `Cancelled`. |
| **Assigned Assessments** | Coach Portal → **`Sessions`** Tab → **`Assessments`** | Access prospective member assessment leads assigned by the manager, log contact attempts, and convert to bookings. |
| **Schedule & Capacity Setup** | Coach Portal → **`Schedule`** Tab | Set working days, working hours, and maximum hourly capacity per session type (1-on-1, Partner, Small Group, Class, Nutrition). |

---

### 🏢 Manager & Front Desk Dashboard (Admin CRM)
Accessed by staff, managers, and admins on the desktop CRM interface.

| Feature | Where to Find in Sidebar | Description |
|---|---|---|
| **Class Manager & Visual Heatmaps** | Sidebar → **`Class Manager`** | Create and publish class schedules, view peak-hour visual heatmaps, track fill rates, and audit instructor performance. |
| **Requests Hub (Freezes & Assessments)** | Sidebar → **`Requests`** | Approve/reject membership freeze requests (which automatically extends package expiry dates) and assign incoming assessment leads to coaches. |
| **Master Schedule / Calendar** | Sidebar → **`Calendar`** | Consolidated view of all PT sessions and group classes across all gym studios and coaches. |
| **Client Profiles & Inzan View** | Sidebar → **`Clients`** → Click any member | Dedicated Inzan member view showing package history, remaining session balances, and attendance logs. |
| **Storefront & Bookings** | Sidebar → **`Bookings`** | Order management, storefront purchases, and booking audit logs. |

---

## 3. Step-by-Step User Tutorials

---

### 3.1 Member / Client Workflows

#### 🅰️ How to Book a Group Class & Join the Waitlist
1. Log in to the Member App and tap **`Bookings`** in the bottom navigation.
2. Select the **`Group Classes`** sub-tab.
3. Browse the weekly calendar or use filters (by Date, Coach, or Category).
4. **If spots are available:** Tap **`Book Class`**. The booking is confirmed immediately, 1 session is deducted from your package, and you can sync it to your Google or Apple Calendar with 1 tap.
5. **If the class is full:** Tap **`Join Waitlist`**. You will be placed into the first-in, first-out (FIFO) queue.
6. **Automatic Promotion:** If an enrolled member cancels at least 2 hours before the start time, the system will automatically promote you to "Booked" and send you an instant push notification.
7. **Cancellation:** You can cancel your booking up to 2 hours before the class starts. Within the 2-hour window, cancellations are locked to ensure fair spot allocation.

#### 🅱️ How to Book a Personal Training (PT) Session
1. In the Member App, go to **`Bookings`** → **`PT Sessions`**.
2. Tap **`Book a Session`**.
3. Select your **Preferred Coach**, **Session Type** (1-on-1, Partner, Small Group, or Nutrition), **Date**, and **Time Slot**.
4. The system validates in real time that:
   - You have active sessions remaining in your package.
   - The coach is working on that day and has open capacity for your session type.
5. Tap **`Confirm Booking`**. Your session will appear immediately in your schedule and your coach's schedule.

#### 🅲 How to Request a Fitness Assessment
1. In **`Bookings`** → **`PT Sessions`**, tap the **`Request Assessment`** button at the top.
2. Complete the form:
   - Select a preferred coach (or "Any Available Coach").
   - Enter your preferred date and time.
   - Specify any injuries or medical limitations.
   - Share your fitness goals.
3. Tap **`Submit Request`**. A manager will review and assign your request to a coach, who will contact you directly.

#### 🅳 How to Request a Membership Package Freeze
1. Navigate to **`Profile`** → **`Packages`** sub-tab.
2. On your active package card, tap **`Request Freeze`**.
3. Enter your reason for the freeze (medical, travel, personal).
4. Tap **`Submit Freeze Request`**. Once approved by management, your package expiration date will automatically be extended by 7 days.

#### 🅴 How to Rate and Review a Session
1. After your coach marks a session as attended or after your workout, navigate to your session history.
2. Click **`Rate Session`** on the completed session card.
3. Select a rating from 1 to 5 stars, enter optional feedback comments, and tap **`Submit Rating`**.

---

### 3.2 Instructor / Coach Workflows

#### 🅰️ Setting Working Days, Hours, and Hourly Capacities
1. Log in to the **Coach Portal** and navigate to the **`Schedule`** tab.
2. For each day of the week (Monday through Sunday):
   - Toggle the day **Active / Inactive** (Days Off).
   - Set your **Start Time** (e.g., `09:00`) and **End Time** (e.g., `21:00`).
3. Set your **Maximum Hourly Capacity** per session type:
   - **1-on-1 Sessions:** Default `1` client.
   - **Partner Sessions:** Default `2` clients.
   - **Small Group:** Default `3` to `5` clients.
   - **Classes:** Default `15` clients.
   - **Nutrition Consultations:** Default `1` client.
4. Click **`Save Schedule`**. The system publishes your real-time availability to members.

#### 🅱️ In-Studio Class Roster & Manual Check-In
1. Navigate to the **`Classes`** tab in the Coach Portal.
2. Select your scheduled class to see the live roster of booked members and waitlisted members.
3. If a member walked directly into the studio without scanning their QR code at the front kiosk, tap **`Check-In`** next to their name.
4. If you need to cancel a class due to an emergency, click **`Request Class Cancellation`**, enter your reason, and submit it to the Manager.

#### 🅲 Managing Assigned Assessment Leads
1. Navigate to **`Sessions`** tab → **`Assessments`** sub-tab.
2. Review pending assessment requests assigned to you by management, including client goals and injury notes.
3. Contact the client via phone/WhatsApp and click **`Mark Contacted`** or schedule their assessment session directly.

---

### 3.3 Manager / Front Desk Workflows

#### 🅰️ Class Management & Visual Heatmap Analytics
1. In the Admin CRM, click **`Class Manager`** in the left sidebar.
2. **Schedule Management:**
   - Click **`Add New Class`** to schedule a class with assigned instructor, capacity cap, date/time, and room.
3. **Heatmap & Analytics:**
   - Scroll to the **Visual Heatmap** section to view attendance density by day and time slot.
   - Review the **Instructor Performance Table** to monitor attendance rates, fill percentages, and cancellation trends.

#### 🅱️ Processing Member Requests (Freezes & Assessments)
1. In the Admin CRM, click **`Requests`** in the left sidebar.
2. **Assessments Tab:**
   - View new assessment requests submitted by members.
   - Select an available coach from the dropdown and click **`Assign Coach`**.
3. **Freezes Tab:**
   - Review pending package freeze requests.
   - Click **`Approve`** to automatically add 7 days to the client's package end date in Firestore.

---

## 4. Automated Background Rules & Logic

| Rule | How the System Enforces It Automatically |
|---|---|
| **Overbooking Prevention** | The booking engine runs inside an atomic transaction; if the active bookings reach the coach's hourly capacity for that session type, the slot is immediately locked. |
| **Session Deduction on Booking** | Booking a PT session decrements `sessionsRemaining` on the active package. If the session is cancelled according to policy, the session credit is automatically refunded. |
| **FIFO Waitlist Auto-Promotion** | When a booked member cancels a class, a background trigger ([waitlist.ts](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/functions/src/classes/waitlist.ts)) immediately identifies the first waitlisted member, promotes them to booked status, and dispatches a notification. (Auto-promotion halts 2 hours prior to class time). |
| **Automatic No-Show Detection** | A scheduled background task ([noShowJob.ts](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/functions/src/classes/noShowJob.ts)) inspects class rosters 10 minutes post-start and flags any unverified member as a `No Show`. |
| **Audit Logging** | Every status update (`Scheduled`, `Attended`, `Cancelled`, `Rescheduled`, `No Show`) generates an unalterable audit log with timestamp, user ID, role, and details. |

---

## 5. Client Verification & Sign-Off Checklist

Use this checklist to test each user flow in the staging or local environment to confirm feature readiness:

| # | Test Case / Workflow | Role Tested | Status |
|:---:|---|:---:|:---:|
| 1 | **Coach Schedule Setup:** Toggle days off, change hours, set capacities per session type, and save. | Instructor | [ ] Pass |
| 2 | **1-on-1 PT Booking:** Book a session with an available coach; verify 1 session is deducted from package. | Member | [ ] Pass |
| 3 | **Overbooking Check:** Attempt to book beyond coach's configured capacity for that hour; verify system blocks overbooking. | Member | [ ] Pass |
| 4 | **PT Reschedule / Cancel:** Reschedule a booked session to a new time; cancel a session and verify credit is refunded. | Member | [ ] Pass |
| 5 | **Assessment Request Flow:** Submit assessment request with coach preference and injury notes; verify manager receives it. | Member | [ ] Pass |
| 6 | **Assessment Assignment:** Manager assigns assessment to a coach in `Requests`; coach sees it in `CoachSessions`. | Manager / Coach | [ ] Pass |
| 7 | **Package Freeze Flow:** Member requests freeze in `MemberPackages`; manager approves in `Requests`; verify package expiry +7 days. | Member / Manager | [ ] Pass |
| 8 | **Session Star Rating:** Member leaves 1–5 stars and text comment on completed session; verify saved to database. | Member | [ ] Pass |
| 9 | **Group Class Booking & Calendar:** Member books a free class and clicks Google/Apple calendar sync. | Member | [ ] Pass |
| 10 | **Class Waitlist & Promotion:** Fill class capacity; next member joins waitlist; cancel 1 spot and verify waitlist auto-promotes. | Member / System | [ ] Pass |
| 11 | **In-Studio Manual Check-In:** Coach views class roster in `CoachClassPortal` and marks member attended. | Instructor | [ ] Pass |
| 12 | **Visual Analytics Heatmap:** Open `Class Manager` in CRM; verify heatmaps, fill rates, and instructor stats render accurately. | Manager | [ ] Pass |

---

*This document serves as the official operational guide and completion sign-off for the Inzan Athletics platform release.*
