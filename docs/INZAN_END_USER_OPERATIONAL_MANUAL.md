# INZAN ATHLETICS — User Guide & Operational Manual

**Welcome to Inzan Athletics Management Platform.**  
This guide provides clear, step-by-step instructions on how to use every feature in the system—whether you are working at the Front Desk, coaching on the gym floor, managing sales leads, or overseeing operations as a Manager or CEO.

---

## 1. Introduction

### What is Inzan Athletics CRM?
Inzan Athletics CRM is an all-in-one gym management platform that connects your front desk, sales team, coaches, nutritionists, and members into one easy-to-use system. 

### Why Does It Matter?
- **One Member, One Profile:** No more duplicate records or lost paper forms. A member's payments, package balances, class bookings, attendance, fitness assessments, and complaints are stored in a single master profile.
- **Fair & Automatic Bookings:** Classes and personal training (PT) sessions respect real capacities. If a class is full, members join a fair first-come, first-served waitlist that automatically promotes them when a spot opens up.
- **Accurate Financials:** Every sale, partial payment, and discount is tracked down to the exact pound collected. Cash drawers balance cleanly at the end of every shift with zero guesswork.
- **Accountability & Audit:** Every critical action (refunds, cancellations, balance overrides, and date extensions) is logged permanently with timestamps and reasons.

---

## 2. Getting Started & Prerequisites

### System Requirements
- **Web Portal (Staff & Admin):** Any modern web browser (Google Chrome, Microsoft Edge, Safari, or Firefox) on desktop, laptop, or tablet.
- **Member Mobile Experience:** Any iOS or Android smartphone accessing the mobile web app or native application.
- **Peripherals (Front Desk):** Standard 2D barcode or QR code scanner (webcam or USB hand scanner) and receipt printer (optional).

### Logging In
1. Open your browser and go to your club portal: **`admin.inzanathletics.com`**.
2. Enter your assigned work email and password.
3. Click **Sign In**.
4. You will automatically land on your personalized dashboard tailored to your role (Front Desk, Coach, Sales, or Manager).

> [!NOTE]
> If you forget your password, click **Forgot Password?** on the login screen, enter your email address, and follow the password reset link sent to your inbox.

---

## 3. Core Workflows: Step-by-Step Guide

### Workflow 1: How to Check In a Member at the Front Desk
Every check-in verifies the member’s active status in real time to prevent expired access.

1. Click **Front Desk** in the left sidebar navigation.
2. **Scan or Search:**
   - **Using QR Scanner:** Have the member open their digital membership card on their phone and hold the QR code up to the scanner.
   - **Using Manual Search:** Type the member's full name, phone number (`+201XXXXXXXXX`), or Member ID into the search bar and press **Enter**.
3. **Verify Membership Status:**
   - **Green Badge (Active):** The system automatically logs attendance and displays the member's active package and remaining sessions. Greet the member and welcome them in.
   - **Red Alert (Expired / Frozen / Unpaid):** The system displays the exact refusal reason (e.g., *"Package Expired on 2026-10-01"*). Direct the member to renew or settle their balance.
4. **Manual Override Check-in:** If a member forgot their phone, click **Manual Check-in**, select their name from the list, choose a reason from the dropdown (e.g., *Forgot Phone*), and click **Confirm Check-in**.

---

### Workflow 2: How to Sell a Package & Record a Payment
Selling a package automatically updates the client profile and unlocks their booking privileges.

1. Click **Payments** in the sidebar, then click **Record Payment** (or click **New Payment** directly on a member’s profile).
2. **Select the Member:** Search and pick the client.
   - *Pre-Payment Gate:* Ensure the member has a full name, valid Egyptian mobile number (`+201...`), and National ID/Passport on file. If missing, a warning will prompt you to complete these fields first.
3. **Choose the Package:** Select from the category tabs:
   - **Gym Memberships** (Monthly, Quarterly, Annual access)
   - **Personal Training (PT)** (Private 1-on-1, Partner, or Group packages)
   - **Drop-in / Day Pass** (Single visit passes)
4. **Apply Discounts (If Applicable):**
   - Select **Percentage** or **Fixed Amount**.
   - *Note:* Discounts greater than 10% automatically route to the **Approvals Queue** for manager sign-off.
5. **Select Payment Method:** Click **Cash**, **Credit Card (POS)**, **Bank Transfer**, or **Instapay**.
6. **Enter Amount Paid:**
   - For full payment: Enter the total amount due.
   - For partial payment: Enter the amount collected today. The system saves the remaining balance and flags the record for future follow-up.
7. Click **Complete Transaction**. The payment is recorded, an official receipt is generated, and booking tokens are immediately added to the member’s balance.

---

### Workflow 3: How to Book and Conduct a Personal Training (PT) Session
Coaches manage their own schedule and hourly client capacity directly from the PT module.

1. Click **Personal Training** in the sidebar.
2. **Set Your Working Hours:** Click **Availability** to select your weekly working days and available time slots.
3. **Capacity Rules:** The system automatically enforces safety and session limits:
   - **1-on-1:** Maximum 1 client per hour.
   - **Partner:** Maximum 2 clients per hour.
   - **Small Group:** 3 to 5 clients per hour.
4. **Booking a Session:**
   - Click an available slot on the calendar.
   - Select the client from the dropdown. The system checks their remaining balance. If they have 0 sessions remaining, it prompts them to purchase a renewal first.
   - Click **Confirm Booking**.
5. **Updating Status After the Session:**
   - Once the workout is complete, open the session card and update the status:
     - **Attended:** Deducts **1 session** from the member’s balance.
     - **No Show:** Deducts **1 session** from the member’s balance.
     - **Rescheduled:** Deducts **0 sessions** (slot is moved to a new date).
     - **Advance Cancellation (>12h before):** Deducts **0 sessions**.
     - **Late Cancellation (<12h before):** Deducts **1 session**.

---

### Workflow 4: How Classes, Waitlists & Instructor Cancellations Work
Group classes run smoothly with automatic roster management and waitlist queues.

1. **Viewing Class Schedules:** Click **Classes** in the sidebar to view the weekly class grid. Filter by date, instructor, or category (e.g. *Boxing Fundamentals*, *HIIT*, *Strength*).
2. **Booking a Spot:** Members click **Book** on their phone. If spots are available, their seat is reserved immediately.
3. **Joining the Waitlist:** If a class is full, members can click **Join Waitlist**. Waitlists work on a strict first-come, first-served basis.
   - *Auto-Promotion:* If an attendee cancels at least **2 hours before class starts**, the system automatically promotes the first person on the waitlist, confirms their booking, and sends them a push notification.
4. **10-Minute Automatic No-Show Rule:**
   - Members must be checked in within **10 minutes** of class start time.
   - At the 10-minute mark, the system automatically marks absent members as **No Show**. Three no-shows within 30 days trigger a temporary 7-day class booking suspension.
5. **Instructor Cancellation Request:**
   - If an instructor cannot attend, they click **Request Cancellation** on the class card and enter a reason.
   - A Manager reviews and approves the request in **Approvals**.
   - Upon approval, the class is cancelled, **1 session credit is automatically refunded** to all booked attendees, and notification alerts are dispatched.

---

### Workflow 5: How to Capture Leads & Convert Them to Members
The Sales CRM ensures no prospective member falls through the cracks.

1. Click **Leads** in the sidebar, then click **New Lead**.
2. Enter the lead's name, phone number, and select the **Lead Source** (e.g., *Walk-in*, *Instagram*, *Referral*).
3. The sales rep who created the lead is automatically assigned as the lead owner.
4. **Log Activity:** After speaking with the lead, click their card to log phone calls, WhatsApp messages, or gym visits, and schedule the next follow-up reminder.
5. **Converting to a Member:**
   - When the lead agrees to join, click **Convert to Member** on their card.
   - Enter their National ID and confirm their profile.
   - The lead instantly becomes an active member in the directory **without duplicating records**, preserving all historical notes and conversation history.

---

### Workflow 6: End-of-Shift Drawer Balancing & Reconciliation
Front Desk cashiers close out their shifts with complete accounting transparency.

1. At the end of your shift, click **Front Desk** > **Shift Reconciliation** (or go to **Reports**).
2. The system automatically calculates your **Total Expected Cash** by summing all cash transactions recorded during your shift and subtracting any cash refunds.
3. Physically count the cash in your register drawer and type the figure into **Actual Counted Cash**.
4. Enter your credit card terminal settlement batch total.
5. **Check the Variance:**
   - If your counted cash matches expected cash, the system shows a **Green Balanced** indicator.
   - If there is an overage or shortage, the exact variance is highlighted in red. Enter a brief explanation in the notes box.
6. Click **Download CSV Report** to print or export the shift summary for the accounting team.

---

### Workflow 7: Member Complaints & SLA Case Management (PRD §16)
Ensure customer service inquiries, facility issues, and feedback are resolved promptly.

1. Open the member's profile in **Clients** or navigate to **Customer Support**.
2. Click **New Case / Complaint**.
3. Select the **Category**:
   - `Complaint` (Staff, facility, hygiene)
   - `Refund Request` (Financial escalations)
   - `Coach Issue` / `Class Issue` (Training-related)
   - `Membership Issue` (Freeze, transfer, renewals)
4. Set **Priority** (`Low`, `Medium`, `High`, `Urgent`). The system sets an automatic **SLA Resolution Deadline**.
5. Assign to a department head (e.g., *Fitness Manager*, *Operations Lead*).
6. Once resolved, document the resolution notes and click **Mark as Resolved**. The CEO and management can audit open and overdue cases on the management dashboard.

---

### Workflow 8: Lost & Found Item Logging (PRD §7)
Track misplaced member items transparently at the front desk.

1. Click **Front Desk** > **Lost & Found**.
2. Click **Log Found Item**.
3. Enter item description, location found (e.g. *Cardio Area*, *Locker Room 2*), date/time found, and staff name.
4. When a member claims the item:
   - Click **Claim Item**.
   - Search and select the claiming member.
   - Verify their identity and click **Confirm Return**.
5. The item status transitions from `Found` to `Returned`, logging an immutable record of who handed it over.

---

### Workflow 9: Nutrition Consultations & Confidential Notes (PRD §6.5, §11)
Manage dietary consultations while maintaining strict clinical health privacy.

1. Click **Nutrition** in the navigation sidebar.
2. **Setting Availability:** Nutritionists define their weekly consultation hours and appointment lengths (e.g. 30 or 45 minutes).
3. **Booking an Appointment:** Select client, service type, and available slot. The system’s collision engine guarantees no two clients can reserve the same slot.
4. **Recording Private Consultation Notes:**
   - Open the member’s appointment card and enter diet plans, macro calculations, body composition metrics, and confidential health observations.
   - Click **Save Notes**.
   - *Privacy Protection:* The system locks these notes in Firestore rules. Only the author nutritionist and the gym CEO can access these clinical records; they are strictly hidden from Front Desk and other coaches.

---

### Workflow 10: Fitness Assessments, Session Ratings & Package Freezes (PRD §6.4, §9)
Enable members to request evaluations, review workouts, and freeze memberships within policy.

1. **Submitting an Assessment Request:**
   - A member or front-desk staff opens **Fitness Assessments** and clicks **Request Assessment**.
   - Input preferred coach, available date/time, training goals, and existing injuries.
   - The Fitness Manager reviews the queue and assigns the assessment to the coach.
2. **Member Session Ratings:**
   - After a PT session is completed, the member receives a prompt in their app to rate the session from **1 to 5 stars** with optional comments.
   - Ratings aggregate into coach performance scorecards visible on the manager dashboard.
3. **Package Freeze Requests (Max 7 Days for PT):**
   - Members requesting a medical or travel freeze submit a request in **My Membership** > **Request Freeze**.
   - System validates the freeze duration against the package limit (maximum 7 consecutive days).
   - Once approved, the package expiration date extends automatically by the exact freeze duration, and bookings are temporarily paused.

---

### Workflow 11: Inventory Receiving & Retail Sales (PRD §24)
Manage gym gear, boxing gloves, apparel, and supplements without stock leakage.

1. Click **Inventory** in the sidebar.
2. **Receiving New Stock:**
   - Click **Receive Shipment**.
   - Select product (e.g. *Inzan 12oz Pro Gloves*), enter supplier name, purchase order reference, and quantity received.
   - Stock increments atomically and clears any `LOW_STOCK` warnings.
3. **Retail POS Sales:**
   - When selling an item at the front desk, select the product in the checkout window.
   - The system verifies available quantity. If stock is 0, the system rejects the transaction to prevent overselling.
   - Upon payment completion, stock decrements automatically.
4. **Low Stock Alerts:** Items whose quantity drops below their configured minimum threshold are automatically flagged with a **Yellow Low Stock** badge.

---

### Workflow 12: Daily Staff Checklists & Timeliness KPIs (PRD §18.2)
Ensure facility cleanliness, opening procedures, and closing checks are performed on schedule.

1. Click **Tasks** in the sidebar.
2. The system automatically populates the day’s recurring checklist from templates:
   - **Opening Checklist** (Due 06:30 AM: Unlock facility, sound system, AC check)
   - **Equipment Inspection** (Due 12:00 PM: Boxing ring ropes, bag tension, treadmill check)
   - **Cash Count** (Due 03:00 PM: Shift handover cash count)
   - **Closing Checklist** (Due 11:30 PM: Lock gates, lights off, final drawer settlement)
3. Staff check off items as they complete them.
4. If a task is checked off past its due time, it is marked **Completed Overdue**.
5. Managers can view the **Staff KPI Scorecard** showing the percentage of tasks completed and timeliness rates per employee.

---

### Workflow 13: Equipment Register & Maintenance Tracking (PRD §24)
Track gym assets, routine maintenance schedules, and book value depreciation.

1. Click **Settings** > **Equipment Register**.
2. **Registering New Equipment:**
   - Click **Add Equipment**.
   - Enter serial number, brand, purchase date, purchase price, salvage value, and useful life (in years).
   - Enter `Service Interval Days` (e.g. 90 days for quarterly service).
3. **Straight-Line Depreciation:**
   - The system automatically computes annual depreciation and current book value based on elapsed years.
4. **Maintenance Due Alerts:**
   - When an asset reaches its `nextServiceDueDate`, the status turns to **Orange Maintenance Due**.
   - Facility staff schedule the service, record parts replaced and service costs, and enter the next due date to return the equipment to **Green Operational** status.

---

## 4. Key Features Breakdown

| Module / Feature | Where to Find It | What It Does & How to Use It |
|---|---|---|
| **Live Front Desk Dashboard** | Click **Front Desk** | Real-time gym traffic: today's check-ins, scheduled PT sessions, classes, and cashier shift summaries. |
| **360° Member Directory** | Click **Clients** | View comprehensive member profiles: personal details, package expiry, session balances, payments, attendance history, notes, and complaints. |
| **Sales CRM & Pipeline** | Click **Leads** | Visual kanban board tracking prospective members from inquiry to signed membership with follow-up task reminders. |
| **Class Scheduler & Rosters** | Click **Classes** | Create and publish weekly classes, manage capacity, view confirmed attendees, and manage waitlists. |
| **Personal Training (PT)** | Click **Private Sessions** | Manage trainer availability, schedule 1-on-1, partner, or small group sessions, and track session token deductions. |
| **Nutrition Consultations** | Click **Nutrition** | Book private consultation appointments with nutritionists and maintain confidential dietary and assessment notes. |
| **Customer Service & Complaints** | Click **Support** / **Clients** | Log member feedback, set SLA deadlines, assign department owners, and track resolution notes. |
| **Lost & Found Logging** | Click **Front Desk** > **Lost & Found** | Log misplaced items, record storage location, verify claimant identity, and track returned items. |
| **Inventory & Consumables** | Click **Inventory** | Track stock quantities, record supplier shipments, prevent overselling, and monitor low-stock warnings. |
| **Staff Tasks & Checklists** | Click **Tasks** | Daily opening/closing checklists with automated timeliness and completion rate KPI scorecards. |
| **Equipment Register** | Click **Settings** > **Equipment** | Track facility assets, schedule preventative maintenance, and calculate GAAP straight-line depreciation. |
| **Payments & POS** | Click **Payments** | Record cash, credit card, bank transfer, and Instapay sales; issue receipts; and handle partial payments. |
| **Shift Reconciliation** | Click **Front Desk** > **Shift Reconciliation** | Balance physical drawer cash and card terminals against expected sales, flag variances, and export RFC 4180 CSV reports. |
| **Manager Approvals** | Click **Approvals** | Central queue for managers to review and approve refund requests, instructor class cancellations, and date adjustments. |
| **Immutable Audit Trail** | Click **Settings** > **Audit Trail** | Unalterable activity log showing who performed every critical action with timestamps and mandatory reasons. |
| **Member Mobile Portal** | Member App / Mobile Web | Self-service app where members view their digital QR card, book classes/PT, join waitlists, and export bookings to Google Calendar. |

---

## 5. Frequently Asked Questions (FAQs) & Troubleshooting

### Q1: The system gave an error: *"Duplicate transaction attempt detected"* when recording a payment. What happened?
- **Why this happens:** A staff member clicked the **Complete Payment** button twice rapidly, or submitted the exact same payment form twice within a few seconds.
- **How to fix it:** The system’s built-in duplicate protection intentionally blocked the second charge to prevent double-charging the member. Close the window, open the member's profile, and check the **Payments** tab. You will see that the first transaction was recorded successfully.

### Q2: Why is the member unable to book a class or PT session on their phone?
- **Why this happens:** The system enforces strict entitlement rules:
  1. The member's package has expired.
  2. The member has 0 remaining session tokens.
  3. The member has accumulated 3 no-shows and is on a 7-day booking suspension.
  4. The class has reached maximum capacity and the waitlist cutoff (2 hours before class) has passed.
- **How to fix it:** Open the member’s profile in **Clients**. Check their expiration date and session balance. If their package is expired or exhausted, record a renewal payment. If they are suspended for no-shows, a manager can lift the strike lock in their profile.

### Q3: Why did an instructor cancellation not notify the members immediately?
- **Why this happens:** To protect member trust, an instructor's cancellation is treated as a *request*. It does not take effect until approved by management.
- **How to fix it:** Have the Fitness Manager or Class Manager log in, open **Approvals**, and click **Approve** on the cancellation request. Once approved, the class is cancelled, members are automatically refunded 1 session credit, and cancellation notifications are sent immediately.

### Q4: I entered a partial payment, but the member says their balance doesn’t show full credits. Why?
- **Why this happens:** The platform accurately tracks money collected. If a member pays only 50% of a package price, the system records the payment as partial and tracks the remaining debt.
- **How to fix it:** The member can use services up to their authorized tier, but the package will remain marked as having an outstanding balance until the cashier records the final balance payment under **Payments** > **Record Payment** > select **Settlement of Balance**.

### Q5: Who can read confidential nutrition consultation notes?
- **Why this happens:** Strict client health privacy is enforced at the database level.
- **How to fix it:** Only the specific nutritionist who created the consultation note and the gym CEO / Super Admin have permission to view or edit clinical nutrition notes. Front Desk, Sales, and other coaches cannot view these records.

### Q6: What happens if the internet disconnects at the front desk?
- **Why this happens:** Temporary ISP drops or local network glitches.
- **How to fix it:** Inzan Athletics CRM features persistent multi-tab local caching. You can continue looking up member records, viewing schedules, and checking in members. Once connection is restored, the system synchronizes all queued operations smoothly with the central database.

---

*Inzan Athletics CRM — Built for operational excellence, data integrity, and member satisfaction.*
