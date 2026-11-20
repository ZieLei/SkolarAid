# Parity checklist: old feature → new location

Legend: ✅ same behaviour · 🔧 same feature, deliberately improved/fixed · ➕ needed by the web (no desktop equivalent) · ⛔ not ported (with reason).
"UI" columns refer to the Angular page; "API" to the controller. All admin routes require `ADMIN`, all scholar routes `SCHOLAR`.

## Login / Register
| Legacy (WinForms) | Web | Status |
|---|---|---|
| `Login` — Student ID + password, inactive/locked account blocked, scholar must be Active | `/login` → `POST /api/auth/login` | ✅ (same background, heading, card, LOG IN button) |
| Login updates `last_login`, logs LOGIN / LOGOUT | `AuthService` | ✅ |
| Plaintext password compare | PBKDF2 hash; legacy plaintext accepted once then re-hashed | 🔧 |
| "Sign up" link, "Forgot password?" label (no handler in the desktop app) | link to `/register`; label kept, no handler | ✅ |
| Hard-coded DB connection / `TestConnection` popups | `ConnectionStrings__Default`, `/health` | ➕ |
| `Register` — all fields, 3 required + 2 optional documents, stipend panel auto-filled from scholarship type, email/required validation, "Pending" status, activity log | `/register` → `GET /api/scholarship-types/active`, `POST /api/registrations` (multipart) | ✅ |
| Student ID validated but not stored | stored in `scholar_registrations.student_id` and used on approval | 🔧 |
| Files copied into a local `uploads/registrations` folder | `Uploads__Directory`, generated file names, type/size limits | 🔧 |

## Admin
| Legacy | Web | Status |
|---|---|---|
| `FrmAdminDashboard` — 4 KPI cards, recent activity (10), upcoming payments (10), scholarship pie, monthly disbursement line | `/admin/dashboard` → `DashboardController` | ✅ |
| Header (IskolarAid Admin, Administrator, Logout) + 280px teal sidebar with 6 sections | `AdminShell` | ✅ |
| `FrmScholarManagement` — grid (ID, Scholar #, Student ID, Name, Course, Year, Scholarship, Status), search, scholarship/status filters | `/admin/scholars` → `GET /api/admin/scholars` | ✅ |
| Scholar form (basic, academic, scholarship, bank, status, scholar number, 5 file attachments), Add / Update / View / Deactivate-Reactivate / Clear Fields | same page → `POST/PUT /api/admin/scholars`, `POST …/toggle-status` | ✅ |
| Add creates user (username = Student ID) + 5 compliance rows (Submitted if file attached), numbers `SCH-yyyy-nnn` | `ScholarService.CreateAsync` | ✅; numbering uses MAX not COUNT; password is random 12 chars (the old `Name@Cru#` pattern was guessable); password shown once in a dialog + emailed | 🔧 |
| Welcome email + SMS | `IEmailSender` / `ISmsSender` | ✅ when SMTP / Semaphore are configured; the hard-coded test CC address was dropped |
| `FrmScholarDetailsView` dialog | "View" button / double-click row | ✅ |
| Compliance tab — pick scholar, update status + remarks, upload / view / delete file, mark missing, remind, add requirement (incl. "Others"), delete requirement | tab "Compliance Management" → `ComplianceController` | ✅; default 5 requirements created on first open |
| "View Scholarships Management" dialog — list, add, activate / deactivate | `ScholarshipTypesDialog` → `ScholarshipTypesController` | ✅ (still no edit/delete, as before) |
| `FrmPayrollProcessing` — 4 stat cards, search/type/year filters, Select All Eligible / Clear, period + method, Preview, Process Payroll, Release Payments, Batch Summary, Disbursement History | `/admin/payroll` → `PayrollController` | ✅ (same eligibility, amount from scholarship type, +3 days skipping weekends, `PAY-…` reference, duplicate-period guard, release only when due) |
| "Mobile Wallet" saved as "Bank Transfer" | saved as selected | 🔧 |
| Payroll emails/SMS after commit | same (best effort, never rolls back) | ✅ |
| `FrmReports&Analytics` — Generate Reports (6 types, date range, 3 filters), Export PDF, Export Excel (CSV), Print, report templates, disbursement receipt with amount in words | `/admin/reports` → `ReportsController` | ✅ PDF/Print use the browser print dialog ("Save as PDF"); templates are printable blank HTML forms |
| Analytics tab — 4 stat cards + 3 charts | same page, "Analytics Dashboard" tab | ✅ |
| `UpdateScholarCourses()` rewrote `scholars.course` on every Reports open | — | ⛔ destructive, lossy mapping |
| `FrmActivityLogs` — 3 stat cards, filters, paged grid, details pane, CSV export | `/admin/activity-logs` → `ActivityLogsController` | ✅; role column now comes from `users.role` (was guessed from the name) |
| `FrmNotifications` — stats, filters, compose (all/one), list, details, mark read, delete, delete all read, resend | `/admin/notifications` → `NotificationsController` | ✅ stat card labels kept as in the original (see note) |
| Notifications → registration review: approve (creates scholar + user, emails), reject (reason, optional email) | tab "Registrations" → `RegistrationsController` | 🔧 approval now marks the registration Approved (it could be approved repeatedly before), carries the applicant's documents into compliance, blocks double approval |

> Note: the original "Pending SMS / Delivered / Failed SMS" cards actually counted unread / read notifications and pending registrations. Labels are kept (UI parity); hover text explains the real meaning.

## Scholar
| Legacy | Web | Status |
|---|---|---|
| `FrmScholarDashboard` — total stipend, next payment, scholarship, compliance rate, 5 recent payments, compliance overview, 3 notifications | `/scholar/dashboard` | ✅ |
| `FrmScholarProfile` (read-only) | `/scholar/profile` | ✅ |
| `FrmPaymentHistory` — summary cards, status/period filters, grid, detail pane, CSV export | `/scholar/payments` | ✅ |
| `FrmScholarCompliance` — summary cards, filters, grid, detail pane, upload for Pending/Rejected, auto-Overdue | `/scholar/compliance` | ✅; upload now actually stores the file (the desktop app only saved the file *name*); Overdue items can also be uploaded |
| `FrmScholarNotifications` — cards, type/unread filters, list, detail, mark read / all read | `/scholar/notifications` | ✅ |
| 300px sidebar "Iskolar Portal" + Logout | `ScholarShell` | ✅ |

## Added because the web needs them
JWT auth + role guards, DTO validation (400 with messages), ProblemDetails errors, explicit CORS, rate limiting on login/registration, env-based config, EF migrations, admin seeding, Dockerfiles + `docker-compose.yml`.

## What was and wasn't tested

**Tested (automated, all passing)**
* API: 74 xUnit tests — pure rules (eligibility, release date, numbering, next-payment date, amount in words…), services against SQLite (login/rehash, scholar creation, compliance upload/overdue, payroll process/release/double-pay guard, registration approve/reject, CSV, dashboard) and HTTP end-to-end through `WebApplicationFactory` (401/403 role separation, admin→scholar flow, public registration).
* Web: 16 Vitest tests — login, register validation/auto-fill/multipart post, auth + guards, payroll selection/totals, scholar compliance upload rules.
* Manual browser run (headless Chromium against the real API on SQLite): public registration → admin approval → scholar creation form → compliance tab; screenshots of every admin and scholar page, no console errors.

**Not tested**
* **MySQL / Pomelo at runtime.** No MySQL server or Docker daemon was available. The EF migration was generated and its DDL read, but never executed; all runtime tests used SQLite. Run the stack once with `docker compose up` before trusting it.
* `docker-compose.yml` and both Dockerfiles (not built; compose file not linted).
* Running the SQL in `db/existing-database.sql` against a real legacy database. The legacy schema had to be **inferred from the code** (there is no schema file), so column names/types may differ from the live DB.
* Real email and SMS delivery (SMTP / Semaphore) — only the "disabled" and fake-sender paths ran.
* Pixel-level comparison with the WinForms app (it can't run here). Colours, fonts, sizes and layouts were taken from the Designer files and `Resources` images; some layouts (e.g. the notification list column widths) are adapted to browser widths.
* Mobile/narrow screens: the layout is desktop-first, like the original.
