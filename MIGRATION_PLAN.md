# IskolarAid: WinForms to Angular + ASP.NET Core migration plan

Status: **Phase 1 (analysis)**. Nothing in `/SkolarAid` (the legacy WinForms project) is modified. The new code goes in `/api` and `/web` beside it.

## 1. What the legacy app is

- WinForms on .NET Framework 4.8, using `MySql.Data` with **raw SQL in form code-behind** (about 28k lines across 14 screens).
- There is **no data layer, no service layer and no DbContext**. The `Models/` classes are not used by the forms, and some disagree with the SQL (see 3.3).
- Database `iskolaraid` (MySQL, XAMPP, `root` with an empty password).
- **There is no SQL dump or schema file in the repo.** The schema in section 3 is *inferred from every INSERT/UPDATE/SELECT in the code*. Column types, lengths, enums, indexes and FKs are not knowable from code. See risk R1.
- Two roles: `ADMIN` and `SCHOLAR` (`users.role`). Desktop forms never check the role. The role only decides which dashboard opens after login.

## 2. Screen inventory

| # | WinForm | Role | Purpose | Reads | Writes |
|---|---|---|---|---|---|
| 1 | `Login` | public | Username (the Student ID for scholars) and password. Checks account status. Routes to the right dashboard. | users, scholars | users.last_login, activity_logs |
| 2 | `Register` | public | Scholar self-registration: personal, academic, bank, 3 required and 2 optional document uploads. Auto-fills stipend info from the chosen scholarship type. | scholarship_types | scholar_registrations, activity_logs, files on disk |
| 3 | `FrmAdminDashboard` | admin | KPI cards, scholarship distribution chart, monthly disbursement chart, recent activity, upcoming payments grid. | scholars, scholarship_types, payments, activity_logs | none (logout is logged) |
| 4 | `FrmScholarManagement` (2954 lines) | admin | Scholar CRUD, activate/deactivate, 5 document attachments at creation, **compliance tab** (list, update status, upload/download/delete file, add/delete requirement, mark missing, send reminder), **scholarship type dialog** (add, activate, deactivate), summary panel, welcome email/SMS. | scholars, scholarship_types, compliance_records, file_attachments | scholars, users, compliance_records, file_attachments, scholarship_types, notifications, activity_logs |
| 5 | `FrmScholarDetailsView` | admin | Read-only scholar profile dialog with payment and compliance totals and a compliance list. Opened from #4. | scholars, scholarship_types, payments, compliance_records, file_attachments | none |
| 6 | `FrmPayrollProcessing` (1685 lines) | admin | Pick eligible scholars, preview, process payroll, release payments, disbursement history, filters. Email, SMS and in-app notifications. | scholars, scholarship_types, compliance_records, payments, users | payments, notifications, activity_logs |
| 7 | `FrmReports&Analytics` (1698 lines) | admin | Analytics charts. 6 report types (census, payroll summary, compliance, payment history, activity log, default). CSV export, HTML print/PDF, **disbursement receipt** with amount-in-words, downloadable form templates. | all tables | **scholars.course (see 3.4)**, activity_logs |
| 8 | `FrmActivityLogs` | admin | Filter (date range, action, user, search), paginate, details pane, CSV export, stats. | activity_logs | activity_logs (EXPORT) |
| 9 | `FrmNotifications` | admin | Tab 1: sent notifications (filter, mark read, delete, resend). Tab 2: compose (all active scholars or one). Tab 3: **registration review: approve or reject**. Email on approve/reject. | notifications, scholars, users, scholar_registrations, scholarship_types | notifications, scholars, users, scholar_registrations |
| 10 | `FrmScholarDashboard` | scholar | Scholarship name, stipend, next payment date, total received, compliance rate, last 5 payments, compliance list, last 3 notifications. | scholars, scholarship_types, payments, compliance_records, notifications | none |
| 11 | `FrmScholarProfile` | scholar | Read-only profile (the form has no UPDATE). | scholars, scholarship_types | none |
| 12 | `FrmPaymentHistory` | scholar | Own payments, filters, CSV export. | payments, users | none |
| 13 | `FrmScholarCompliance` | scholar | Own requirements, filter, detail, upload a document for Pending or Rejected items. | compliance_records | compliance_records |
| 14 | `FrmScholarNotifications` | scholar | Own notifications, filter, mark one or all read. | notifications, users | notifications |

## 3. Database

### 3.1 Inferred tables (all names `snake_case`, kept as-is)

| Table | Columns seen in code |
|---|---|
| `users` | id, username, password, role (`ADMIN`/`SCHOLAR`), name, account_status (`Active`/`Inactive`/`Locked`), last_login, created_at, updated_at |
| `scholars` | id, user_id, student_id, scholar_number, first_name, middle_name, last_name, email, contact_number, date_of_birth, gender, address, program, hei, degree_program, course, year_level, scholarship_type_id, stipend_amount, stipend_frequency, scholarship_fund_source, renewal_conditions, bank_name, bank_account_number, enrollment_date, expected_graduation, status, created_at, updated_at |
| `scholarship_types` | id, name, description, stipend_amount, payment_frequency, fund_source, renewal_conditions, requirements, is_active, status(?), created_at, updated_at |
| `scholar_registrations` | id, first/middle/last_name, suffix, email, contact_number, date_of_birth, gender, address, program, hei, degree_program, course, year_level, scholarship_type_id, stipend_amount, stipend_frequency, scholarship_fund_source, renewal_conditions, enrollment_date, expected_graduation, bank_name, bank_account_number, file_psa/coe/cor/grades/contract, notes, status (`Pending`/`Approved`/`Rejected`), rejection_reason, created_at |
| `payments` | id, scholar_id, payment_period (text like `March 2026`), amount, computation_date, release_date, status (`Pending`/`Processed`/`Released`/`Failed`), payment_method, reference_number, processed_by, remarks, created_at, updated_at |
| `compliance_records` | id, scholar_id, requirement_type, description, due_date, date_submitted, status (`Pending`/`Submitted`/`Approved`/`Rejected`/`Overdue`), remarks, checked_by, file_path, created_at, updated_at |
| `file_attachments` | id, scholar_id, compliance_id, file_name, original_name, file_type, file_size, **file_data (BLOB)**, uploaded_by, uploaded_at |
| `notifications` | id, sender_id (users.id, NULL means system), **recipient_id (scholars.id, not users.id)**, title, message, notification_type (`Reminder`/`Alert`/`Update`/`Announcement`; `Payment` also appears in colour mapping), date_created, is_read, read_at |
| `activity_logs` | id, user_id, user_name, action_type, table_affected, record_id, details, ip_address (never written), created_at |

Relations: scholars.user_id→users, scholars.scholarship_type_id→scholarship_types, payments/compliance_records/file_attachments.scholar_id→scholars, file_attachments.compliance_id→compliance_records, notifications.recipient_id→scholars, notifications.sender_id→users, payments.processed_by→users.

### 3.2 Database decision: **keep MySQL**

The brief says to keep MySQL unless there is a strong reason. There isn't one. The schema is plain relational, the app is already on MySQL, and Pomelo is a mature EF Core provider. See R2 for the provider-version risk.

### 3.3 Inconsistencies between code, models and schema

1. `Models/*.cs` is dead code. It omits dozens of columns the SQL uses (date_of_birth, gender, bank_*, stipend_*, file_*, etc.) and mislists `payment_method` values. **EF entities are built from the SQL, not from `Models/`.**
2. `Register` selects scholarship types with `WHERE status = 'Active'`. Every other screen uses `is_active = TRUE`, and the admin "add type" dialog only sets `is_active`. Either both columns exist or one of these queries is broken against the real DB. **Needs the real schema.**
3. Payroll's payment-method list is Bank Transfer / Cash / Mobile Wallet. `ProcessPayroll` then maps anything except bank transfer, cheque and cash to **Bank Transfer**. So "Mobile Wallet" is silently stored as "Bank Transfer".
4. `FrmReports&Analytics_Load` runs `UpdateScholarCourses()` on every open. It **rewrites `scholars.course` and `degree_program` in bulk** using a hard-coded map. Some mappings are lossy: Nursing, Civil Engineering, Agriculture and Medical Technology all become the BS IT course. It is a leftover one-off data fix.

### 3.4 Business rules buried in code-behind

**Auth**
- Login matches `users.username` and compares the **plaintext password** to `users.password`. Passwords are stored in plaintext. An unused `HashPassword` (SHA-256) exists in `FrmScholarManagement` but is never applied.
- `account_status != 'Active'` blocks login. A scholar login also needs a linked scholars row with `status = 'Active'`. An admin has no such requirement.
- Success updates `last_login` and writes a LOGIN activity log. Logout writes LOGOUT.

**Registration to scholar**
- Required fields: student ID, first and last name, email (valid), contact number, scholarship type, gender, year level, degree program, plus **PSA, COE and COR uploads** (Grades and Contract are optional).
- The suffix is appended to `last_name` when stored (`"Reyes Jr."`).
- Stipend amount, frequency, fund source and renewal conditions are **copied from the chosen scholarship type** at registration time.
- Registration inserts with `status = 'Pending'`. The **student ID is validated but never saved** (it only appears in the activity log text).
- **Approve** (Notifications tab): creates a `scholars` row (`status = 'Active'`) and a `users` row (role `SCHOLAR`, username = student ID, generated password), links them, and sends a welcome email. **It never sets the registration to `Approved`**, so the same registration can be approved repeatedly. It also does not create compliance rows or copy the uploaded files. Student ID is generated as `{year}-{n:D6}` because the real one was never saved.
- **Reject**: needs a reason, sets `status = 'Rejected'` and `rejection_reason`, and optionally emails the applicant.
- Scholar number = `SCH-{year}-{count+1:D3}`, where count is rows already matching `SCH-{year}-%` (race-prone; breaks after deletes).
- Generated password = Cap(first 3 of first name) + special + Cap(first 3 of last name) + special (8 characters, `System.Random`, guessable).

**Scholar management**
- Add: required first name, last name, email, course, year level and scholarship type. Blank student ID is generated as `{year}-{n:D6}`. Transaction: scholars row, user account (reuses an existing user if the username exists), link, **5 compliance records** (PSA Birth Certificate, Enrollment Form, COR, Grades, Scholarship Contract, due in 1 month; `Submitted` plus a file_attachments row if a file was attached, else `Pending`). Afterwards sends welcome email and SMS and shows the password on screen.
- Update: writes every field plus status. Deactivate/reactivate toggles `Active`/`Inactive`. Scholar statuses offered: Active, Inactive, Probation, Suspended, Graduated, Terminated, Withdrawn, Expelled, Completed, Dropped.
- Opening the compliance tab for a scholar with no compliance rows creates the 5 default rows.
- Compliance status update: sets status and remarks, and sets `date_submitted = today` when moving to Submitted/Approved. Adding or deleting a requirement is allowed (types: the 5, Good Moral Certificate, Others/custom). Deleting a requirement deletes its files first. Uploading replaces any existing file for that record and sets the status to Submitted. Deleting a file resets the status to Pending.
- "Remind" inserts an in-app notification. "Mark Missing" sets a status (code at `FrmScholarManagement.cs:1441`; confirm exact status during the build).
- Scholarship types: add (name, stipend, frequency of Monthly, Quarterly, Semi-Annual or Annual), activate, deactivate (soft). No edit and no delete.

**Payroll**
- A scholar is eligible when `scholars.status = 'Active'` **and** compliance is complete **and** the scholarship type's stipend is greater than 0 **and** there is no `Released` or `Processed` payment for that period. Period text is the `MMMM yyyy` string (e.g. `March 2026`).
- "Complete" differs between the two places that compute it. The grid says complete when at least one record is Approved and none are Pending, Overdue or Submitted. `IsScholarEligible` (the real gate) says all records are Approved. This is a Rejected-record edge case. The strict rule is the one actually enforced, and the plan uses it.
- Amount = **`scholarship_types.stipend_amount`**, not `scholars.stipend_amount`.
- Process creates `Processed` payments and a notification each. Reference = `PAY-yyyyMMdd-{scholarId:D4}-HHmmssfff`. Expected release date = today+3 rolled forward past Saturday and Sunday. Processing silently skips scholars who fail the eligibility re-check. A duplicate-payment warning is shown in the preview and before processing.
- Release: `Processed` to `Released`, `release_date = today`, one notification each (only `WHERE status = 'Processed'`), then release emails.
- Email and SMS go out after commit and are not part of the transaction. Failures do not roll back anything.

**Reports and dashboards**
- Dashboard KPIs: active scholars, active scholarship types, SUM(Released), COUNT(Pending or Processed).
- Receipt printing includes an amount-in-words function (`AmountToWords`) and writes a PRINT_RECEIPT log.
- The Activity Logs "role" column is faked: `user_name LIKE '%Admin%'`.

**Scholar side**
- Compliance view auto-sets `Pending` to `Overdue` when `due_date < today`, and backfills `date_submitted` for Submitted/Approved rows.
- Scholar uploads only record the **file name**. The bytes are never stored, so admins cannot actually see scholar uploads. This is an existing defect.
- "Next payment date" is computed from the scholar's `stipend_frequency` (weekly, bi-weekly, monthly, quarterly, semester/semi-annual, annual).

**Config and secrets**
- `FrmScholarManagement`, `FrmPayrollProcessing` and `FrmNotifications` contain a **hard-coded Gmail app password, Semaphore SMS API key and sender address** in public source. The welcome email is also CC'd to a hard-coded personal test address.
- Email-to-SMS gateway code exists alongside the Semaphore constants.

## 4. Target architecture

```
/SkolarAid        legacy WinForms (untouched, reference only)
/api              ASP.NET Core 10 (LTS) Web API
  IskolarAid.Api            controllers, auth, DI, middleware (thin)
  IskolarAid.Core           services, DTOs, business rules (no EF types)
  IskolarAid.Data           DbContext, entities, EF migrations, seed
  IskolarAid.Tests          xUnit tests for ported rules
/web              Angular (latest stable, standalone, strict TS) + Tailwind CSS
docker-compose.yml  API + MySQL
```

- EF Core + Pomelo, snake_case mapped to the existing tables and columns. A baseline migration for fresh DBs, and an `ExistingDatabase` note for baselining the live one.
- JWT bearer (role claim `ADMIN`/`SCHOLAR`), `[Authorize(Roles=...)]` on every endpoint except login, register and the public scholarship type list. Scholar endpoints derive the scholar from the token and **never accept a scholar id from the client**.
- Passwords: ASP.NET `PasswordHasher` (PBKDF2). Legacy plaintext values are accepted once at login and rehashed. See R3.
- Validation via DataAnnotations and FluentValidation. `ProblemDetails` for errors. Global exception handler. CORS from config. All config from environment variables (`.env.example` only, no secrets).
- Email (SMTP) and SMS (Semaphore) behind `IEmailSender` and `ISmsSender`, configured by environment variables and **disabled with a log line when unset**.
- File storage: compliance files stay in `file_attachments.file_data` (schema compatible). Registration files go to a configured upload directory (path stored in `scholar_registrations.file_*`), with type and size limits.

## 5. Screen to route mapping

| Legacy screen | Angular route | Guard |
|---|---|---|
| Login | `/login` | public |
| Register | `/register` | public |
| Admin Dashboard | `/admin/dashboard` | ADMIN |
| Scholar Management (+ Details dialog) | `/admin/scholars`, `/admin/scholars/:id`, `/admin/scholars/new` | ADMIN |
| Compliance tab | `/admin/scholars/:id/compliance` (plus a scholar picker at `/admin/compliance`) | ADMIN |
| Scholarship types dialog | `/admin/scholarship-types` | ADMIN |
| Payroll Processing | `/admin/payroll` | ADMIN |
| Reports & Analytics | `/admin/reports` | ADMIN |
| Activity Logs | `/admin/activity-logs` | ADMIN |
| Notifications: sent and compose | `/admin/notifications` | ADMIN |
| Notifications: registrations | `/admin/registrations` | ADMIN |
| Scholar Dashboard | `/scholar/dashboard` | SCHOLAR |
| Scholar Profile | `/scholar/profile` | SCHOLAR |
| Payment History | `/scholar/payments` | SCHOLAR |
| Scholar Compliance | `/scholar/compliance` | SCHOLAR |
| Scholar Notifications | `/scholar/notifications` | SCHOLAR |

## 6. Entities (EF)

`User`, `Scholar`, `ScholarshipType`, `ScholarRegistration`, `Payment`, `ComplianceRecord`, `FileAttachment`, `Notification`, `ActivityLog`. Nine tables, all existing.

## 7. API endpoints

**Auth** `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (logs only)
**Public** `GET /api/scholarship-types/active`, `POST /api/registrations` (multipart)
**Admin: dashboard** `GET /api/admin/dashboard/stats`, `/recent-activity`, `/upcoming-payments`, `/scholarship-distribution`, `/monthly-disbursement`
**Admin: scholars** `GET /api/admin/scholars` (search, status, scholarship filters, paging), `GET /{id}`, `GET /{id}/details`, `POST`, `PUT /{id}`, `POST /{id}/toggle-status`, `GET /api/admin/scholars/filters`
**Admin: compliance** `GET /api/admin/scholars/{id}/compliance`, `POST` (add requirement), `PUT /api/admin/compliance/{id}/status`, `DELETE /api/admin/compliance/{id}`, `POST /{id}/file`, `GET /{id}/file`, `DELETE /{id}/file`, `POST /{id}/remind`
**Admin: scholarship types** `GET`, `POST`, `POST /{id}/activate`, `POST /{id}/deactivate`
**Admin: payroll** `GET /api/admin/payroll/candidates?period&type&yearLevel&search`, `POST /preview`, `POST /process`, `GET /processed`, `POST /release`, `GET /history`, `GET /stats`
**Admin: reports** `GET /api/admin/reports/analytics`, `GET /api/admin/reports/{type}` (JSON, filters), `GET /{type}/csv`, `GET /api/admin/payments/{id}/receipt`
**Admin: activity logs** `GET /api/admin/activity-logs` (paged, filters), `GET /{id}`, `GET /stats`, `GET /csv`
**Admin: notifications** `GET /api/admin/notifications`, `POST` (compose; all or one), `POST /{id}/read`, `POST /read-all`, `DELETE /{id}`, `DELETE /read`, `GET /stats`
**Admin: registrations** `GET /api/admin/registrations`, `GET /{id}`, `GET /{id}/files/{key}`, `POST /{id}/approve`, `POST /{id}/reject`
**Scholar** `GET /api/scholar/dashboard`, `/profile`, `/payments`, `/payments/csv`, `GET /compliance`, `POST /compliance/{id}/file`, `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`

## 8. Decisions I made (reversible; tell me if you disagree)

1. **.NET 10 (LTS), EF Core 10, Pomelo** (see R2), **Angular latest stable** with standalone components, strict TypeScript and **Tailwind CSS** (as requested).
2. **Legacy code stays untouched.** Everything is added in `/api` and `/web`.
3. **Password hashing.** Hash with PBKDF2 (`PasswordHasher`). Plaintext legacy passwords still work at first login and are rehashed. The `password` column is widened to 255 chars if needed (compatible).
4. **Secrets are not ported.** Email and SMS credentials come from env vars, and the hard-coded CC address is dropped.
5. **Bug fixes that the web version needs, listed here so they aren't a surprise:**
   - approving a registration sets it to `Approved` (stops duplicate approvals);
   - `scholar_registrations` gets one **additive nullable `student_id` column** so the entered Student ID is kept and used on approval (generated only if blank);
   - scholar uploads store the file bytes in `file_attachments` as admin uploads do;
   - the Activity Logs role column is read from `users.role` (not guessed from the name);
   - `UpdateScholarCourses` is **not** run on report load. It is provided as an optional manual SQL script;
   - scholar numbers use `MAX(suffix)+1` inside the transaction with a unique index, not `COUNT+1`;
   - "Mobile Wallet" is stored as selected rather than becoming Bank Transfer (if the live column is an ENUM without it, the migration adds it).
6. Payroll eligibility uses the **strict** rule (every compliance record Approved), because that is what the legacy app enforced when processing.
7. The first admin comes from a seed script using env vars (`SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD`). The legacy code has no admin bootstrap, and I never saw the admin's credentials.
8. Reports: JSON for the grid, a CSV download, and a print-friendly page (`window.print()` for PDF) replace the HTML export. The "templates" panel becomes static downloadable HTML forms. Charts use a small chart library via npm.
9. Email-to-SMS gateway code is dropped. Only the Semaphore SMS path is ported, behind config.

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **No schema file.** Column types, enums, indexes and FKs are inferred. The live DB may differ (e.g. `status` vs `is_active` on `scholarship_types`). | Entities mapped defensively. The baseline migration is for fresh DBs. **Run `mysqldump --no-data iskolaraid` and give it to me, and I'll reconcile before Phase 2 completes.** |
| R2 | Pomelo's EF Core 10 support may lag or be a pre-release. | Check on NuGet at build time. Fall back to the latest stable Pomelo with EF 9 on .NET 10, and record it in the README. |
| R3 | Plaintext to hashed passwords on a live DB. | Lazy rehash at login. Leaves unknown `password` column length as a risk, so the migration widens it. |
| R4 | **The Gmail app password and Semaphore key are public in upstream.** | **Rotate both now** regardless of this migration. |
| R5 | Parity is defined by 28k lines of code-behind with no tests and no spec. Details such as "Mark Missing" are only confirmable by reading each handler during the build. | Parity checklist in the repo, and API tests for the ported rules. |
| R6 | BLOB file storage in MySQL grows the DB and loads large rows. | Kept for compatibility. Size and type limits on upload (10 MB, PDF/image/Word). |
| R7 | The public registration endpoint is an unauthenticated file upload. | Rate limiting, type, size and content-type checks, and generated file names. |
| R8 | Race conditions on scholar numbers and payroll duplicates. | Transactions, a unique index on scholar_number, and a check inside the transaction for duplicate period payments. |
| R9 | Cannot run MySQL natively here (no `mysql` binary), so there is no manual testing against a real DB without Docker. | Use docker-compose MySQL. EF tests use an in-memory or SQLite provider for pure logic. |
| R10 | Dates and money. Legacy uses `DateTime.Now` (local) and `decimal`. | Use `DateOnly` and UTC where meaningful. Keep `decimal(18,2)`. Document the timezone assumption. |

## 10. Build order (Phase 2)

1. Scaffold `/api` and `/web`, docker-compose, `.env.example`.
2. Entities, DbContext, baseline migration, seed.
3. Auth (JWT, hashing, role guards, logging) plus the Angular shell, login and guards.
4. Public: scholarship types and registration. Admin: registration review (approve/reject).
5. Scholar management, compliance, scholarship types.
6. Payroll.
7. Dashboard, reports, activity logs, notifications.
8. Scholar portal (5 screens).
9. Tests, README, parity checklist.

## 11. Phase 2 outcome (updates to the plan above)

* **R2 materialised:** Pomelo's newest stable release (9.0.0) targets EF Core 9, so the API runs on **.NET 10 with EF Core 9 + Pomelo 9.0.0**. Revisit when Pomelo ships EF Core 10 support.
* C# 14 note: `string[].Contains()` binds to a span overload that EF Core 9 can't translate; the code uses `List<string>` in queries (covered by a test).
* All decisions in section 8 were implemented as written. Additional fixes found while porting: failed activity-log writes could poison the next `SaveChanges` (now detached); payroll status counts and scholar numbering use client-safe/`MAX` logic; registration approval carries documents across.
* UI fidelity: colours (`#00444F`, `#005A69`, `#0A5C5C`, `#F3F4F6`…), sizes (80px header, 280/300px sidebars, 55/60px nav rows) and text were read from the Designer files; the login/register background and icons are the original resources.
* `Database__Provider=Sqlite` exists only for throw-away demos/UI checks without a MySQL server; MySQL is the supported database.
* Deliverables: [README.md](README.md), [PARITY_CHECKLIST.md](PARITY_CHECKLIST.md), `docker-compose.yml`, `db/existing-database.sql`.
