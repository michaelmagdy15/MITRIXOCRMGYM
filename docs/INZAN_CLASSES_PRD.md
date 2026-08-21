# Product Requirements Document (PRD): Gym Classes & System Core

**Tenant:** Inzan Athletics (`inzanathletics`)

## 1. Project Overview
A comprehensive gym management ecosystem consisting of a Member Mobile App, an Instructor Portal, and a Manager Admin Dashboard. The initial release focuses on a smart, automated Class Booking & Attendance System.

## 2. System Features by User Role

### A. Member Interface (Mobile App)
*   **Class Browsing & Schedule:**
    *   View weekly/monthly class schedules with clear indicators for Free vs. Paid classes.
    *   Filter classes by date, instructor, or category.
*   **Booking & Waitlist:**
    *   1-click booking for free classes (for active members).
    *   Integrated payment gateway for paid classes.
    *   **Automated Waitlist:** Option to join a waitlist if a class is full (FIFO - First-In, First-Out basis).
*   **Cancellations & Rules:**
    *   Self-service cancellation up to 2 hours before class start time.
    *   System locks cancellations within the 2-hour window and triggers penalty rules if applicable.
*   **Smart Alerts & Notifications:**
    *   Instant push notifications for booking confirmations and waitlist promotions.
    *   Reminders sent before class (e.g., 2 hours prior).
    *   Direct notifications if an instructor cancels a class.
    *   Calendar integration (1-click sync to Google/Apple Calendar).

### B. Instructor Interface (Mobile/Web Portal)
*   **Attendance Management:**
    *   Real-time roster of booked members.
    *   **Manual Check-In:** Ability for the instructor to manually take/verify attendance in the studio (for members who bypass the front desk).
*   **Class Cancellation Requests:**
    *   Submit cancellation requests directly to the Manager for approval before members are notified.
*   **Instructor History & Analytics:**
    *   View past class history, total attendance stats, and personal performance logs.

### C. Manager Interface (Admin Web Dashboard)
*   **Schedule & Staff Management:**
    *   Create, edit, and publish monthly class schedules.
    *   Create instructor profiles and manage login credentials.
*   **Approvals & Overrides:**
    *   Approve or reject instructor cancellation requests (automatically triggers member notifications and refunds/credits upon approval).
*   **Analytics & Heatmaps:**
    *   **Visual Heatmaps:** Visual reporting showing peak hours, popular days, and underutilized class slots.
    *   **Instructor Performance Tracking:** Track attendance rates, fill rates, no-show trends, and cancellation history per instructor.
*   **Automated Payout Calculations:**
    *   **Free Classes:** Automated per-session fixed rate calculation.
    *   **Paid Classes:** Revenue-share or percentage/fixed calculations based on paid member attendance.

## 3. Core Business Logic & Rules

### A. Automated Waitlist Management
*   When a booked member cancels, the first person on the waitlist is automatically promoted to "Booked."
*   The promoted member receives an immediate push notification and email confirmation.
*   **Cutoff Rule:** Auto-promotion stops 2 hours before class time to prevent surprise last-minute bookings.

### B. Access Control & Attendance
*   **Front Desk Check-in:** Dynamic QR code scan via Member App upon arrival.
*   **In-Studio Verification:** Instructors can mark attendance manually on their app for members walking straight into the studio.
*   Members not marked present 10 minutes after class start are automatically flagged as No-Show.

### C. No-Show & Late-Cancellation Penalties
*   Configurable penalty settings in Manager Dashboard (e.g., 3 no-shows = 1-week booking ban, or a fixed late-cancellation fee).
*   Automatic enforcement for free classes to prevent members from hogging spots.
