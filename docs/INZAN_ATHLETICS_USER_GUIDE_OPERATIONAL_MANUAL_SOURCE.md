# INZAN ATHLETICS

## User Guide and Operational Manual

Edition 03 | October 2026 | Inzan Athletics

Use this handbook at the front desk, on the training floor and during the daily close. Each procedure identifies where to work, what to record and how to check that the action is complete.

Availability depends on the signed-in role, branch, tenant feature switches and deployment. The Inzan CRM is associated with admin.inzanathletics.com and the tenant database db-inzanathletics in the central Firebase project faa-test-guide-v2. If branding or member data looks wrong, stop the operation and report it to an administrator.

## 1 System map and navigation

[[FIG:architecture]]

### 1.1 The three workspaces

- Member portal: Pass, Bookings, Juice Bar, Wallet, Locker, Invites, Nutrition and Profile. Profile also holds settings, membership, progress, attendance history, badges and rewards when the relevant features are enabled.
- Coach portal: Home, Classes, Schedule, Members, Sessions, Earnings and Profile.
- Staff CRM: Dashboard, Leads, Clients, Calendar, Bookings, Requests, Pending Approvals, Class Manager, Nutrition, Tasks, Payments, Attendance, Debtors, Unconfirmed Memberships, Reports, Audit, Settings, Quotes, Club Operations, Admin Hub, Advanced Reports, Call Center, Lost and Found and Complaints. A user sees only permitted modules.

### 1.2 Roles and operating boundaries

- Members manage their own services and can see their own bookings, package state, pass and account information. A linked family or dependent profile may appear where enabled; confirm the selected person before booking or paying.
- Coaches manage their own schedule, class rosters, PT sessions, assigned assessments and earnings. Coaches should record attendance and session outcomes promptly.
- Front desk and sales staff manage enrollment, check-in, payments, follow-up and operational queues according to assigned permissions. A rep's sales attribution is locked during ordinary checkout.
- Managers review exceptions, approvals, schedule changes, financial variance and staff output. CEO and authorized administrators can see broader reporting and settings.
- Nutrition consultation notes are sensitive. Access to private notes is restricted to the authoring practitioner and CEO-level roles in the tenant rules.

### 1.3 Sign in and recover access

1. Open the assigned Inzan Athletics portal and verify the logo and domain.
2. Sign in with your individual account. Use the member ID flow only for a member account.
3. If prompted, change a temporary password before proceeding.
4. Use Forgot Password on the login screen for the available email or phone reset route. A manager should correct a missing phone number in the staff user record before relying on SMS recovery.
5. If a member account has no linked client record, use the member account linking flow with the verified member ID or phone. Check for an existing profile before creating a guest profile.

## 2 Daily operating rhythm

[[FIG:daily]]

### 2.1 Open the shift

1. Confirm the current branch and account role. Review Dashboard metrics and the notification center.
2. Check today's Calendar, Class Manager and Bookings for capacity, cancellations, waitlists, assessments and nutrition appointments.
3. Review Requests, Pending Approvals, Tasks, Call Center reminders, Debtors and Unconfirmed Memberships.
4. Record the starting cash position and confirm access to the card terminal, transfer and Instapay settlement records.
5. Assign an owner to any open complaint, equipment issue, payment exception or member access problem.

### 2.2 During the shift

1. Search by name, phone or member ID before adding a person. Use one master profile for the full lead-to-member journey.
2. Scan the member's digital pass or use the approved check-in search. Explain any expired, frozen, suspended or unpaid status shown by the system.
3. Use package and payment workflows to sell or renew; use the booking workflows to reserve classes, PT or nutrition.
4. Log calls, contact outcomes, complaints and task completion while the details are fresh.
5. Keep sensitive consultation notes inside the nutrition workspace.

### 2.3 Close and hand over

1. Reconcile cash, terminal, bank transfer and Instapay amounts separately. Explain every variance.
2. Review pending, failed and partial payments, refunds, cancellations, no-shows and unresolved membership confirmations.
3. Export the shift report and any required revenue or attendance reports. Restrict access to exported files.
4. Record the open item, member or record ID, owner and next action in the shift handover. Do not put passwords or full identity documents in handover notes.

## 3 Lead, member and contract lifecycle

[[FIG:lifecycle]]

### 3.1 Capture and qualify a lead

1. In Leads, choose New Lead and enter the prospective member's name, mobile number and source. Search first to avoid duplicates.
2. Confirm the assigned sales representative. Record call, visit or messaging activity and the next follow-up date.
3. Move the lead through the visible pipeline stages as contact progresses. For Call Later, create the follow-up reminder and complete it only after the later contact.
4. Use Call Center segments for active, expired, non-attendee and lead outreach. Respect the recorded Not Interested cooldown and any target-list exclusions.

### 3.2 Convert and maintain the 360 profile

1. Select Convert to Member or open the lead's account from the combined member directory.
2. Confirm legal name, Egyptian mobile number, national ID or passport, branch, contact details and any required corporate proof. The checkout data gate requires the mandatory fields before payment.
3. Review the resulting profile: package history, dates, remaining sessions, payment history, attendance, bookings, notes, complaints and audit history where permission allows.
4. Use the member profile actions for Renew, Upgrade and Add Package. Do not create a second client to represent a new package cycle.
5. If the member needs a contract, use the Inzan contract download. Confirm the populated identity and latest payment fields before sharing. A blank field means the information is absent; it should be completed through the normal record workflow.

### 3.3 Date changes, archival and attribution

- Start and end dates are locked for ordinary staff. An administrator uses Adjust Package Dates, supplies a reason and leaves an audit trail.
- Package catalog items can be archived and restored. Archived packages disappear from new-sale selectors while historical member records remain readable.
- Sales attribution changes require an administrator confirmation and audit record. Review attribution before final checkout.
- Destructive package actions require a confirmation dialog. Escalate a mistaken removal or archive rather than trying to edit historical payment data.

## 4 Products, quotations and checkout

### 4.1 Configure products

Authorized staff manage memberships, PT, drop-in or day-pass products and service options in Packages or Settings. Check category, price, validity, included sessions, branches and active state before a product is offered. PT and group-class purchase options must match the entitlement the member needs. Archiving is the route for retiring a product from new sales.

### 4.2 Issue a quote

The Quotes module is visible only to authorized users. Choose the appropriate client, branch and product details, then review the generated quotation before download or print. A quotation is an offer; it does not activate an entitlement or count as a payment. If a quote is accepted, complete the sale in Payments or the member profile.

### 4.3 Complete a sale

[[FIG:payment]]

1. In Payments choose Record Payment, or open the payment action from the member profile.
2. Select the correct member and package category: Gym Memberships, Personal Training or Drop-in / Day Pass.
3. Pass the required-data gate. Check price, original amount, fixed or percentage discount, net amount, amount collected and payment method.
4. Enter cash, card terminal, bank transfer or Instapay as actually received. For a partial payment, record only what was collected and verify the remaining balance.
5. Submit once. Wait for a confirmed result, then inspect the receipt, payment status, package dates and entitlement on the member profile. A duplicate-attempt message calls for record inspection before any retry.
6. Explain to the member when a payment remains pending or failed. Those states do not activate package access or award points.

### 4.4 Payment and package states

- Paid: the payment and matching package or entitlement should appear together. Loyalty points, where enabled, derive from money collected.
- Partial: review the amount collected and the balance still due. Follow up through Debtors or the member account.
- Pending or failed: payment intent can exist without access. Resolve the status before booking a paid service.
- Complimentary: a properly authorized package may activate with zero points.
- Refund: use the approval and refund workflow. The payment history is retained and its status changes to refunded; do not delete the historical record.
- Renewal or upgrade: the previous cycle stays in history while the new cycle is recorded through the transaction flow.
- Unconfirmed membership: review the pending package and choose Confirm or Reject in Unconfirmed Memberships. Confirmation activates it; rejection records the decision. Check payment evidence first.

### 4.5 Discount, balance and refund approvals

Open Pending Approvals for exception requests. Review the requesting staff member, member, amount, old and proposed values, reason and evidence before approval or rejection. Balance adjustments and sensitive overrides use maker-checker controls. An approver should not perform an undocumented manual Firestore edit to achieve the same result.

## 5 Member portal

### 5.1 Pass and check-in

Open Pass on the member home screen to show the digital QR card. Present it at the approved scanner or kiosk. If the QR cannot be used, ask front desk to search and check in through the staff workflow. A successful check-in appears in attendance history. A QR pass alone does not establish that a package is active.

### 5.2 Packages and membership

Open Profile and Membership or Packages to review package status, start and end dates, session balance and prior cycles. Use the Request Freeze action on an eligible active package, enter the reason and submit. Wait for management approval; the request itself does not change the expiry date. A subscription change request can be used where shown. Staff should review requested changes before altering a paid plan.

### 5.3 Classes and waitlist

1. Open Bookings, select Group Classes and filter the schedule by date, instructor or category.
2. Open the class card and confirm time, room, price or entitlement and availability.
3. Choose Book if eligible. If full, use Join Waitlist. The system may promote the first eligible member when a booked spot becomes available before the configured cutoff.
4. Watch the booking status and notification center; a waitlist entry is not a confirmed seat.
5. Cancel through the booking card within the applicable window. Export one booking to .ics or Google Calendar, or use Export All to Calendar on the home screen for upcoming bookings.

### 5.4 PT and assessments

Choose Bookings and PT Sessions. Select coach, session type, day and available time. Confirm that the active package has the right credit and the coach has capacity. The assessment request captures coach preference, available time, goals and injury information; management assigns it to a coach. After a completed session, use the rating action for stars and optional comments. Session history reflects attendance, cancellation and reschedule outcomes.

### 5.5 Nutrition

Open Nutrition to view practitioners, slots, appointments and consultation history. Select a practitioner, date and available time; add goals if the form asks. A slot is rejected when the practitioner is inactive, outside working hours, in the past or already occupied. Use the displayed cancellation action and reason if plans change. Sensitive clinical notes follow the nutrition permissions, even if a member can see selected history or metrics.

### 5.6 Wallet, rewards and progress

Wallet shows points balance, earn/spend history and available bundles if enabled. Profile may show Progress, body metrics, attendance history, badges and rewards. Points and badges are not a substitute for package credit. A member should ask staff to review the underlying transaction if a paid purchase and wallet entry disagree.

### 5.7 Juice Bar, locker and guest invites

- Juice Bar: add items through the member storefront or cart, review total and order status, and retain the order reference. Staff move active orders through Pending, Preparing, Ready and Completed.
- Locker: view an assigned locker or submit a request for an available branch. Staff approve a pending request against an available locker; the request alone does not assign one.
- Invites: enter the guest's name and phone to create a code and view its Pending, Attended or Expired state. Ask staff to verify the guest and applicable visit policy at arrival.

### 5.8 Profile and account settings

Update allowed contact and profile fields in Profile. Use account linking if the portal says no member record was found. For a linked account with multiple client records, choose the correct member before buying or booking. Review the notification bell for confirmations, reminders and service changes.

## 6 Coach portal and fitness operations

### 6.1 Workday, schedule and capacity

Home shows the coach's daily work. In Schedule, define working days, start and end times and supported session capacities. Save the schedule and confirm that new member booking slots reflect the change. One-on-one capacity is one; partner capacity is two; small-group capacity is constrained to the configured three-to-five range. A changed schedule does not resolve an already booked member automatically.

### 6.2 Class roster

In Classes, open the scheduled class and review booked and waitlisted attendees. Check in a physically present member who did not use the kiosk. Record the correct attendance outcome. When unable to teach, submit Request Class Cancellation with a reason and await manager decision. On approval, the class is cancelled, booked attendees are notified and affected credits are refunded by the workflow.

### 6.3 PT sessions and assessments

In Sessions, review bookings by day. Mark Attended, No Show, Cancelled or Rescheduled based on the actual event. An assigned assessment appears in its queue; review the request, contact the member and record the follow-up. Avoid manipulating the member's package balance directly.

### 6.4 Members, earnings and profile

Members shows the coach's permitted client information. Profile holds the coach's own details. Earnings shows payout records by month and status such as Draft, Approved or Paid after management generates them. Confirm a discrepancy with management; do not infer a final contractual payout from a draft figure.

## 7 Booking, attendance and class policy

[[FIG:booking]]

### 7.1 Shared booking checks

Before confirming a class, PT or nutrition booking, check member status, payment/entitlement, validity window, remaining credit, coach or practitioner schedule, branch, slot capacity and collision. If a booking is refused, correct the actual cause, then repeat the normal action. Do not bypass capacity with a second booking record.

### 7.2 Class timing and waitlist

The class manager publishes a schedule with instructor, room, category, time and capacity. Members see free or paid booking choices according to the class configuration. When full, eligible members enter a first-in-first-out waitlist. Automatic promotion skips ineligible members and records a notification and audit entry. The documented promotion cutoff is two hours before start; verify the configured rule on the live tenant before promising a seat.

### 7.3 Attendance and no-show

Front desk, kiosk and coach check-in all contribute to the same attendance picture. A class no-show job evaluates unverified attendees ten minutes after the class begins. Repeated no-shows can cause a booking restriction. A manager should examine the roster and scan history before correcting a disputed outcome.

### 7.4 PT session credit rules

Completed or No Show uses one PT session. Rescheduled uses none. Advance cancellation with at least twelve hours of notice preserves the credit; cancellation with less than twelve hours of notice forfeits one. An authorized correction to a non-deducting status may restore a previously used credit. Check the session history and remaining package balance after any correction.

### 7.5 Calendar export

Use Download .ics or Add to Google Calendar from individual booked class and PT cards. The member home export collects upcoming bookings over a sixty-day horizon. The calendar file uses the club timezone label Africa/Cairo while event timestamps remain UTC, so the recipient's calendar renders the correct instant. An invalid start time is omitted and an empty export shows an error.

## 8 Front desk, kiosk and club operations

### 8.1 Arrival and access decision

1. In Attendance or the authorized kiosk, scan the QR pass or search by member ID, name or phone.
2. Verify that the selected record is the intended person and read the displayed package status and refusal reason.
3. Complete check-in when eligible. For a manual check-in, record the permitted reason and actor.
4. If the record is expired, frozen, unpaid or suspended, direct the member to the matching renewal, payment or manager workflow. Do not create a duplicate account or bypass access without authority.

### 8.2 Club Operations

Club Operations contains Juice Bar, Lockers and Guests, subject to feature switches. Advance an order only when the preparation step actually occurs. Approve a locker request only against a locker marked Available at the requested branch; mark an unusable locker Maintenance. For a guest invite, verify the code and identity, then record attendance once.

### 8.3 Lost and Found

Record description, location, time and staff details for a found item. When a claimant arrives, verify identity and the item's distinguishing details, then record the handover and status. Avoid listing sensitive contents in a public note.

### 8.4 Complaint and service case

Open Complaints or the member's case action. Record category, priority, description, owner and evidence. Monitor the 48-hour SLA indicator and escalate overdue or urgent cases. Close only after entering the resolution and confirming the member was informed. Keep a refund request in the approval workflow as well as the service case if money is involved.

## 9 Nutrition department

### 9.1 Set practitioner availability

In Nutrition, review Nutritionists and define active status, profile and working schedule. Appointments must fit within the practitioner's hours, avoid past slots and avoid overlapping existing appointments. Set a sensible appointment length in the booking form.

### 9.2 Book and manage an appointment

In Appointments, choose member, practitioner, date, start/end time and payment status. Review the resulting schedule. To reschedule or cancel, open the appointment, enter the required reason and confirm that the old slot is released and the new state appears for the member.

### 9.3 Consultation record and analytics

Open the appointment's consultation record to enter notes, dietary plan, body metrics and follow-up tasks. The BMR helper is an estimate; review clinical input before saving. Check whether Save should also mark the appointment Completed. Clients shows a member's consultation history; Analytics summarizes appointment activity. Private notes should be visible only to authorized practitioners and CEO roles.

## 10 Finance, debtors, reconciliation and payouts

### 10.1 Payment review

Filter Payments by date, member, method and status. Open the source member profile when an amount seems wrong. A revenue chart should reflect amount actually collected and exclude pending, failed, refunded and soft-deleted records. Confirm the report filter period and branch before comparing numbers.

### 10.2 Debtors and partial balances

Debtors helps staff find amounts still due. Review the original sale, amount received, remaining balance, payment method and follow-up history. Collect a later payment through the recorded payment workflow, then confirm the balance decreases. A debtor listing is a work queue, not a reason to deny access automatically without checking the member's active entitlement.

### 10.3 Shift reconciliation

[[FIG:reconciliation]]

For each method, enter actual cash or settlement totals and compare with expected collections and refunds. Check discounted sales, mixed-method transactions and partial payments before explaining variance. Export the CSV after review. Record unresolved differences in the handover with the transaction IDs and responsible owner.

### 10.4 Coach payout cycle

Authorized management configure payout rates, generate a Draft payout from PT sessions and class activity, review the components, approve it and mark Paid after settlement. Coaches can see their own resulting payout history in Earnings. Contract percentages and fixed rates must be confirmed by Inzan finance before financial sign-off.

## 11 Sales, tasks and communications

### 11.1 Call Center

Use the Active, Expired, Non-Attendees and Leads target lists. Apply date filters and check the last-call timestamp. Log each outcome against the member or lead. A Not Interested disposition enforces a cooldown; Call Later creates a task and reminder. A subsequent completed call closes the pending follow-up.

### 11.2 Tasks and recurring checklists

Tasks holds assigned work with status and due time. Complete tasks only after the action occurs. The recurring task service can generate daily instances idempotently from active templates and calculate completion and timeliness KPIs. If no template management interface is available in the current deployment, manage the visible Tasks queue and ask an administrator before promising automatic checklist generation.

### 11.3 Notification center

Review booking confirmations, reminders, waitlist promotions, cancellations, payment confirmations, expiry alerts, low PT balance and follow-up alerts. In-app events and delivery logs support investigation. Push can be attempted through the configured proxy. External SMS and WhatsApp delivery requires a provider integration; do not tell members a message was sent on those channels unless the delivery record confirms it.

## 12 Reporting and management dashboards

### 12.1 Dashboard views

Managers and CEO roles can use global filters for branch, date and staff where granted. Front desk, sales reps and departmental users get scoped views. Check the displayed period before interpreting revenue, conversion, attendance or utilization. The rep conversion denominator has a documented data limitation, so avoid treating it as a strict lead-only rate.

### 12.2 Standard and advanced reports

Reports and Advanced Reports provide operational and financial views for member activity, attendance, packages, payments, coach output and classes. Apply a date range and the relevant branch, coach, product or method filter. Review totals on screen, then export CSV, PDF or XLSX. Keep raw member exports in an approved location.

### 12.3 Class analytics

Class Manager offers schedule control and visual occupancy or heatmap views. Compare booked, attended, cancelled and no-show counts separately. A high booking count does not equal a high attendance count; use the roster as the source for a specific dispute.

## 13 Administration and configuration

### 13.1 Users and permissions

In Settings, manage Users and permission templates or the matrix according to your administrator role. Invite a staff member with the correct department, role, branch and phone. Remove or narrow access when duties change. Test with the affected role before assuming a menu change also changed server permissions.

### 13.2 Settings map

The Settings tabs include My Profile, Branding, Users, Branches, Packages, Coaches, Commission, Payouts, Notifications, Backup, Announcements, Points, Activity, Gamification and Storefront. A restricted Danger tab is available only where authorized. Save one setting group at a time and verify it after refresh. Inzan's visual identity is black, charcoal and white; the shared app's other tenant choices must not be copied into Inzan branding.

### 13.3 Branding, branch and announcements

Branding stores the company name, logo, splash and related design settings. Upload the Inzan logo, save, reload and verify both desktop and mobile displays. Branch settings define branch-specific operations. Announcements have a title, body, priority and start/end dates; preview the member-facing result before publishing.

### 13.4 Points, storefront and product controls

Points and Gamification govern eligible rewards, badges and bundles where enabled. Storefront settings control the member purchasing experience. Review the member view after a catalog or points change. Package prices and cancellation thresholds should be approved by management before use.

### 13.5 Backups, imports and audit

Settings Backup offers export and restore; restore merges records and may overwrite matching IDs, so only an authorized administrator should run it. The offline Backup Station can log check-ins, payments and leads for later import; reconcile those records against live entries before merging to prevent duplicates. Data import screens provide upload, column mapping and confirmation. Use Import History to inspect prior jobs. Audit shows actor, time, action and affected record; audit records are append-only and should not be edited.

## 14 Inventory, equipment and facilities

### 14.1 Stock movements and suppliers

Inventory support includes supplier and product records, stock receipts, sales, adjustments and returns. A sale cannot reduce stock below zero. Products are classified as in stock, low stock or out of stock against their reorder threshold. A dedicated Inventory screen is not available in the current staff navigation. Continue using the approved stock register until an operator interface is released.

### 14.2 Equipment register

Equipment support includes straight-line depreciation and service status calculations. A dedicated Equipment Register screen is not available in the current staff navigation. Record inspections, repairs and service dates in the approved facility register. Report an unsafe item to management immediately and follow the club's equipment isolation procedure.

## 15 Security, tenant isolation and offline operation

### 15.1 Data access

Every staff user should sign in with a personal account. The server uses the request hostname to select the tenant database and Firestore rules restrict direct reads and writes. Staff access is scoped by role and, where applicable, department, branch or assignment. An unexpected member or other tenant's branding is a critical incident: stop and report it.

### 15.2 Audit and sensitive information

Payments, refunds, date overrides, booking changes and other critical actions should carry an audit entry. Sensitive nutrition notes require tighter access. Do not paste full national IDs, medical details or payment evidence into broad task comments or unsecured exports.

### 15.3 Offline and mobile

The client uses persistent multi-tab Firestore caching when IndexedDB is available. On private browsers or restrictive mobile WebViews the SDK can fall back to memory without throwing. The offline banner indicates connectivity, but a saved local view is not proof that a financial action reached the server. On reconnect, verify the final server-backed payment or booking state before repeating the action. The mobile shell may cache old app files, so report a persistent version mismatch with the device and time.

## 16 Troubleshooting and escalation

### 16.1 Payment did not create access

Check payment status, member identity, package cycle and entitlement. Pending and failed payments deliberately do not activate access. If status says paid but entitlement is missing, preserve payment ID and time, stop retries and escalate to finance/administrator for reconciliation.

### 16.2 Duplicate transaction warning

The checkout has an operation ID lock and a short duplicate guard. Search Payments and the member profile for the existing result before submitting again. If money was charged twice, escalate immediately with both references.

### 16.3 Booking unavailable or calendar wrong

Check package eligibility, remaining credit, freeze or suspension, capacity, staff schedule and slot collision. For calendar export, confirm the booking has a valid start time and inspect the calendar timezone. Do not manually add a second booking to work around a missing display.

### 16.4 Notifications missing

Check the in-app notification center and the delivery log for the event and recipient. A successful in-app event does not prove an external SMS or WhatsApp was sent. Log the member's preferred contact method and escalate repeated failures.

### 16.5 Access or privacy issue

Wrong tenant data, unauthorized clinical notes, unexplained role escalation or an audit record that appears editable are critical. Stop using the affected account, capture the exact screen and timestamp, and contact the administrator. Avoid forwarding member data in a general chat.

## 17 Operational checklists

### 17.1 New member sale

- [ ] Search for an existing lead or client.
- [ ] Verify name, phone, ID/passport and required documents.
- [ ] Confirm branch, product, validity, sessions and sales owner.
- [ ] Verify gross amount, discount, net amount and collected amount.
- [ ] Submit once and inspect payment, package and entitlement.
- [ ] Provide receipt and contract where applicable.
- [ ] Schedule the next service or follow-up.

### 17.2 Class session

- [ ] Confirm instructor, room, time and capacity.
- [ ] Review booked and waitlisted members.
- [ ] Check in attendees and record accurate outcomes.
- [ ] Escalate instructor cancellation for approval.
- [ ] Confirm refunds or credits and notifications after cancellation.
- [ ] Investigate disputed no-shows using roster and check-in history.

### 17.3 Daily shift close

- [ ] Reconcile each payment method and document variance.
- [ ] Review pending payments, debtors, refunds and unconfirmed memberships.
- [ ] Review unresolved requests, complaints, reminders and stock or facility issues.
- [ ] Export approved reports and secure the files.
- [ ] Hand over open items with record IDs, owner and next action.

## 18 Feature availability and release notes

The core CRM, member and coach screens, class and PT booking logic, nutrition, payments, reporting, approvals, club operations and settings are present in the repository. Some functions are enabled only by role or tenant feature switches. Inventory, recurring task generation and equipment calculations have services and tests, but the inspected CRM navigation does not expose dedicated operator screens. External SMS/WhatsApp gateways, direct online payment gateway, physical turnstile hardware and final coach payout formulas depend on provider configuration or management decisions. Authenticated production smoke verification is still required for some Inzan workflows after deployment. Operators should verify the live screen and transaction result before treating a workflow as released.

## 19 Glossary

- Entitlement: the service access created for an eligible purchase, such as class or PT credits.
- Package cycle: one validity period of a membership or PT product; renewals keep earlier cycles in history.
- Waitlist: ordered queue for a full class; membership in the queue is not a confirmed reservation.
- Operation ID: identifier used to reject duplicate checkout submissions.
- Maker-checker: an exception requested by one person and approved by another authorized person.
- Shift variance: difference between expected collections and the actual drawer or settlement total.
- Audit log: append-only record of a critical change, actor, time and affected record.
- Tenant: the isolated Inzan Athletics data and configuration selected by the request domain.

## Source basis

Prepared from the repository's Inzan PRD compliance matrix, existing operational manuals, tenant theme and contract notes, GAPS status board, and current member, coach, CRM and settings components as of 7 October 2026. Live production behavior may differ until the pending deployment and authenticated checks are completed.
