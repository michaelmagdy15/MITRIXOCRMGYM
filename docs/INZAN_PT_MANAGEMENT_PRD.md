# Session Management System – App Requirements

## 1. Objective
Develop an in-app Session Management System that manages various types of sessions (Personal Training, Group Classes, Nutrition Consultations, Partner Sessions, etc.) between clients and instructors, with Front Desk acting as supervisors/admins. The system should ensure clear scheduling, session tracking, capacity control, and real-time notifications across all session types.

## 2. User Roles & Permissions

### 2.1 Instructor
- Set working days and days off
- Define available time slots per day
- Set maximum capacity per session type per hour:
  - 1-on-1 Sessions: 1 client
  - Partner Sessions: 2 clients
  - Small Group: 3-5 clients
  - Classes: Configurable (e.g., 10-20 clients)
  - Nutrition Appointments: 1 client
- View booked sessions and remaining availability per time slot
- Receive notifications for: New bookings, Cancellations, Reschedules
- Update session status after the session: Completed, Canceled, Rescheduled, No-show
- Fitness manager can get all the assessments request and resend them to the coach

### 2.2 Client
- Assessment request, the client will fill the Assessment form and wait for coach to contact, (Preferred coach - Available date and time – Injuries)
- Access booking only after payment confirmation.
- Book sessions up to the remaining balance of purchased sessions.
- View: Upcoming PT sessions, Remaining session balance
- Request: Cancellation, Reschedule (subject to policy rules), Freeze max 7 days
- Rating each session by stars and comment

### 2.3 Front Desk (Supervisor / Admin)
- Full visibility over all coaches’ schedules and client bookings.
- Monitor: Session usage, Coach capacity, No-shows and cancellations
- Generate reports: Sessions completed per coach, Sessions remaining per client, Canceled vs completed sessions

## 3. Booking & Capacity Logic
- Each coach defines hourly slots.
- Each hour can hold based on package (1 on 1 – Partner – Group 3:5).
- Example:
  - Coach sets 5 slots at 6:00–7:00 PM
  - Client books 1 slot
  - Coach view shows: Booked: 1, Available: 4
- The system must prevent overbooking automatically.

## 4. Session Status Management
Each session must have one of the following statuses:
- Scheduled
- Completed (deducts 1 session from client package)
- No Show (deducts 1 session from client package)
- Rescheduled (session is not deducted)
- 48hr notified
- 24hr to cancel
- Session be within the package date
- All status changes should be logged with date, time, and user role.

## 5. Notifications System
**Instructor Notifications:** New booking confirmation, Slot availability update, Cancellation or reschedule alerts
**Client Notifications:** Booking confirmation, Session reminder (e.g. 48 hours before), Cancellation / reschedule confirmation (e.g. 24 hours before)
**Front Desk Notifications:** Fully booked hours, Repeated cancellations or no-shows

## 6. Rules & Controls (Configurable)
- Cancellation – Configurable per session type (e.g., 24 hours for PT, for classes)
- No-show policy – Automatic session deduction
- Rescheduling limits – Maximum number of reschedules allowed per package
- Package expiration – Automatic expiration dates
- Freezing – 1 week is the maximum freeze

## 7. Reporting & Dashboard (Coach / Front Desk)
- Daily / weekly / monthly PT sessions summary.
- Client session balance tracking.
- Revenue linked to PT packages.

## 8. Integration Requirements
- Linked to payment system (access granted only after payment).
- Integrated with member profiles in the app.
- Sessions should appear in: Client app schedule, Coach app schedule, Front desk management panel

## 9. Technical Flow / User Journeys
**(Refer to original document for detailed journey step-by-steps)**
