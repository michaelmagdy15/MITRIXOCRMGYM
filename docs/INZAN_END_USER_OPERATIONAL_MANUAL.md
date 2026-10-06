# INZAN ATHLETICS — User Guide & Operational Manual

**Welcome to Inzan Athletics Management Platform.**  
This guide provides clear, step-by-step instructions on how to use every feature in the system—whether you are working at the Front Desk, coaching on the gym floor, managing sales leads, or overseeing operations as a Manager or CEO.

---

## 1. Introduction

### What is Inzan Athletics CRM?
Inzan Athletics CRM is an all-in-one gym management platform that connects your front desk, sales team, coaches, nutritionists, and members into one easy-to-use system. 

### Why Does It Matter?
- **One Member, One Profile:** No more duplicate records or lost paper forms. A member's payments, package balances, class bookings, attendance, and fitness assessments are stored in a single master profile.
- **Fair & Automatic Bookings:** Classes and personal training (PT) sessions respect real capacities. If a class is full, members join a fair first-come, first-served waitlist that automatically promotes them when a spot opens up.
- **Accurate Financials:** Every sale, partial payment, and discount is tracked down to the exact pound collected. Cash drawers balance cleanly at the end of every shift with zero guesswork.

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
   - *Pre-Payment Check:* Ensure the member has a full name, valid Egyptian mobile number, and National ID/Passport on file. If missing, a warning will prompt you to complete these fields first.
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

## 4. Key Features Breakdown

| Module / Feature | Where to Find It | What It Does & How to Use It |
|---|---|---|
| **Live Front Desk Dashboard** | Click **Front Desk** | Displays today's real-time gym traffic: expected check-ins, PT sessions, classes, and cashier shift totals. |
| **360° Member Directory** | Click **Clients** | Search any member to view their complete history: personal details, package expiry, session balances, payments, attendance history, and notes. |
| **Sales CRM & Pipeline** | Click **Leads** | Visual kanban board tracking prospective members from first contact to signed membership with follow-up task reminders. |
| **Class Scheduler & Rosters** | Click **Classes** | Create and publish weekly classes, manage in-studio capacity, view confirmed attendees, and manage waitlists. |
| **Personal Training (PT)** | Click **Private Sessions** | Manage trainer availability, schedule 1-on-1, partner, or small group sessions, and track session token deductions. |
| **Nutrition Consultations** | Click **Nutrition** | Book private consultation appointments with nutritionists and maintain confidential dietary and assessment notes. |
| **Payments & POS** | Click **Payments** | Record cash, credit card, bank transfer, and Instapay sales; issue receipts; and handle partial payments with balance tracking. |
| **Manager Approvals** | Click **Approvals** | Central queue for managers to review and approve refund requests, instructor class cancellations, and date adjustments. |
| **Immutable Audit Trail** | Click **Settings** > **Audit Trail** | An unalterable activity log showing who performed every critical action (payments, refunds, status changes, date overrides) with timestamps and reasons. |
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

---

*Inzan Athletics CRM — Built for operational excellence, data integrity, and member satisfaction.*
