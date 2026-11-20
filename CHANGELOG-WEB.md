# Web Changes Log

Tracks changes made from the web interface onward (branch: `migrate/angular-aspnet`).
Add new entries at the top, newest first.

## Entry format

```
### YYYY-MM-DD — short title
- What changed (files/areas)
- Why
- Notes / follow-ups
```

## Log

### 2026-11-20 — Consistent text styling in the scholar portal
- The scholar pages mixed point and pixel sizes (9pt to 22pt plus 11–24px), several greys, and a nav item that changed size when active. Now one scale: page title 24px, section titles 18px, body 14px, labels 13px, small 12px; table text 13px (all tables). `pt` sizes are gone from the scholar pages.
- One secondary text colour (`#4b5563`) and one body colour instead of five greys; section headings share one bottom margin.
- Sidebar items keep a fixed size (only bold changes when active) in both portals, so the menu no longer jumps; user name 14px.
- "Showing 1 records" now reads "1 record".

### 2026-11-20 — Emoji purge
- Removed every emoji and decorative symbol from the web app source and from the API strings the web displays (searched `web/src` and `api/src` for emoji, arrows, dingbats and geometric symbols: none remain).
- Registrations: the "approved" and "rejected" pop-ups are now dialogs with icon tiles (scholar, scholar number, student ID), a status line with a mail/warning icon for whether the email went out, and a Done button. The Reject button uses the reject icon instead of "✗".
- Smaller: "→" in the registration detail is now "to"; the profile status uses a drawn dot instead of "●"; the release notification title is "Payment Released!" without the party emoji.
- Existing database rows had no emoji, so no data changes were needed.

### 2026-11-20 — Payroll dialogs: icons and tables instead of emoji text
- `web/src/app/pages/admin/payroll.ts`: Preview, Confirm payroll, Payroll processed, Release payments, Payments released and "Nothing to release yet" are now proper dialogs (icon tiles for period / method / counts / total, a table of the scholars in the batch with a per-row result, a warning banner for already-paid scholars, clear primary/cancel buttons) instead of emoji-filled text pop-ups.
- New `shared/fact-grid.ts` (icon + label + value tiles); icons added: calendar, mail, phone, info.
- Process Payroll now opens the confirm dialog with the full batch table; nothing is paid until "Process N payments" is pressed. Release likewise lists the payments before releasing.
- Other pop-ups that still carry emoji in their text (registration approval/rejection results) are unchanged.

### 2026-11-20 — Scholar Management: list first, form in a dialog
- `web/src/app/pages/admin/scholars.ts`: the add/edit form no longer sits beside or under the table. **Add scholar** (toolbar) opens it in a dialog; every row has an **Edit** button that opens the same dialog filled with that scholar (Save changes / Deactivate / Compliance / Cancel in a sticky footer). Clicking a row opens the full details view (which also has an "Edit this scholar" button).
- With the form gone the table gets the full width: dropped the internal ID column, tightened column widths, and all of Scholar #, Student ID, name, course, year, scholarship, status and actions fit without sideways scrolling at normal desktop widths.
- Closing/saving the dialog resets the form; add still shows the temporary-password summary.

### 2026-11-20 — Fix: table header overlapped by rows while scrolling
- `web/src/styles.css`: payroll rows that can't be selected are dimmed with `opacity`, which makes each such row its own stacking layer; those rows painted over the sticky header when scrolled under it, so the header looked washed out and the text bled through. The sticky header now has `z-index: 2` (applies to every table).

### 2026-11-20 — Made-up documents for file attachments
- New `api/src/SkolarAid.Api/Infrastructure/SampleDocuments.cs`: five generated, valid one-page PDFs (PSA Birth Certificate, Certificate of Enrollment, Certificate of Registration, Report of Grades, Scholarship Contract), each stamped "SAMPLE DOCUMENT". Runs with `SEED_HISTORICAL_DATA=true`.
- Every compliance record that is Submitted / Approved / Rejected now has the matching file attached, for everyone in the database (the original 5 scholars included): same 5 files shared by all, 66/66/66/55/55 attachments. Pending/Overdue records stay empty on purpose. Replaces the tiny placeholder PDFs from the history seeder (which no longer creates files). Anything a real user uploaded is left alone; re-running does nothing.

### 2026-11-20 — Remove duplicate Notifications/Registrations tabs
- `web/src/app/pages/admin/notifications.ts`: the in-page "Notifications | Registrations" tab strip is gone. The sidebar already has both entries, so each is now reached one way only (`/admin/notifications` and `/admin/notifications?tab=reg`). The notification stat strip shows only on the Notifications view.
- Removed an unused import warning in the admin dashboard.

### 2026-11-20 — Fix: scholar list rendered only a few rows
- `web/src/app/pages/admin/scholars.ts`: the virtual-scroll viewport's height depends on the loaded data, but the CDK only measured it once (while empty), so it kept rendering rows for a tiny window. Now re-measures (`checkViewportSize`) whenever the height changes. The list is also capped to the visible screen height (`max-h`) and scrolls inside itself, so all rows are reachable.

### 2026-11-20 — Two years of dummy data
- New `api/src/SkolarAid.Api/Infrastructure/HistorySeeder.cs`, switched on by `Seed:HistoricalData` (env `SEED_HISTORICAL_DATA=true`, wired in `run.sh` for `dev` and `demo`, documented in `.env.example`). Off by default. Idempotent (skips if seeded scholars exist) and deterministic (fixed random seed).
- Fills Nov 2024 – Nov 2026 with: 64 scholars (with login accounts), their approved registrations plus 8 pending/rejected ones, 5 compliance requirements each (placeholder PDFs attached where submitted), 862 monthly/semi-annual Released payments (~₱3.9M), ~930 notifications and ~1,800 activity-log entries. Mix of Active, Probation, Inactive and Dropped scholars.
- All seeded scholars log in with their Student ID (e.g. 2025-000044) and password `Scholar#123`; their emails end in `@seed.iskolaraid.test`.
- Existing records (the original 5 scholars, Adachi, Shimamura) are untouched. Applied to the local dev DB via `SEED_HISTORICAL_DATA=true` in `.env`. To remove the data, delete rows whose scholar email ends in `@seed.iskolaraid.test` (or reset the database).

### 2026-11-20 — Fewer cards, no dead zones
- New `StatStrip` (`shared/stat-strip.ts`): every page's row of big icon cards is now one slim summary bar; zero values are muted grey, only attention-worthy numbers get colour. Used on both dashboards, Payroll, Activity Log, Notifications and the scholar Payments / Compliance / Notifications pages.
- Payroll: the "Batch Summary" card and the Selected / Total Amount cards are gone; "N selected · Total ₱X for <period>" sits in the action bar. The side panel no longer exists, so the table gets full width.
- Detail panels ("Select a payment…", "Select a log entry…", compliance, notifications, registrations) only appear once something is selected; before that the list uses the full width. Grids use `items-start`, so cards no longer stretch to match a taller neighbour (dashboards, reports, scholars, notifications).
- One page rhythm: every page's top-level blocks sit in a single column with a 16px gap (global rule in styles.css), replacing the random mix of mb-3/4/5/6.
- Tests updated for the new payroll summary; screenshots/ refreshed.

### 2026-11-20 — UX fixes 4–7 + medium/small issues
**4. Payroll safeguards**
- Buttons now follow the workflow: Preview (Step 1) → Process Payroll (Step 2) → Release Payments (Step 3, outlined, set apart). Disabled buttons say why, in a visible line and a tooltip; Release is off until something is actually due.
- Notifications: "Delete All Read…" is separated from "Mark All Read" and styled as danger-outline. Both ask for confirmation with counts (danger-styled confirm button). Deletes now have an **Undo** toast (8s grace before the permanent API delete; also for single deletes). New `ToastService`/`ToastHost`.
**5. Colour semantics**
- One meaning per colour, all ≥4.5:1: amber = pending, blue = processed/submitted, green = done, red = problems only. Pending ≠ Processed now. Dashboard "Pending Payments" no longer red; Logout and Export PDF no longer red; Clear/Cancel are outlined, not faded gray. Distinct icons for Overdue (alarm clock), Alert (warning) and Rejected (X).
**6. Registration form**
- Rebuilt as 5 numbered sections (About you, Your school, Scholarship and payout, Documents, Review and send) in one column, Submit at the end as a full-width primary button; uploads are outlined "Choose file" rows with required/optional tags. Consistent `*` required / "(optional)" marking, explanation that no password is needed now (emailed after approval), required Data Privacy Act consent checkbox (frontend-enforced; consent is not stored server-side yet). Bank is a list. Logo overlap fixed (background pinned, content starts below it); login simplified (one greeting, dimmed photo).
**7. Empty states** — Scholar Payments and Notifications show a single guidance card (next expected payment, what to do) instead of zero cards + empty panel.
**Medium / small**
- Typos & naming: "Send email", "Manage scholarships", brand unified to IskolarAid (UI, print, emails/SMS), admin nav "Notifications", new "Registrations" sidebar item with a pending badge, page titles on every admin page, COR/COE spelled out, status filter labelled. Fixed "3nd/4nd Year" data in the local DB.
- Scholar Management form: no preselected gender or stipend, required markers, darker labels, bank list, attach buttons look like buttons, sticky Save bar, clear Add vs Edit mode.
- Scholar Profile: editable contact/address/bank with Save (new `PUT /api/scholar/profile`, with test), read-only facts as plain text, "—" for missing, "Finish your profile" prompt.
- Dashboard recent activity hides logins; notification lists sort by date then id and show exact time on hover; one money format (₱0.00) everywhere; larger pagination buttons; emoji icons in templates replaced with line icons; low-contrast gray text darkened; stat cards slimmed.
- Demo Shimamura now has a normal Student ID (2026-000099).
- **Not done:** native date pickers (kept), manual Refresh buttons, duplicate "Total Logs/Today" numbers (they're real data), dialog text still contains emoji.

### 2026-11-20 — UX fixes: consistent data, unclipped tables, visible scholar task
**1. Data no longer contradicts itself**
- Status wording unified: a queued payment is **Processed** everywhere (dashboard used to say "Processing"). Dashboard "Total Disbursed" now explains itself ("Released only · ₱8,500 processed, awaiting release"); API adds `queuedAmount` to dashboard stats. Pending Payments card says "Processed, not yet released".
- Scholar dashboard "Next Payment" now uses the real queued payment (same release date and amount the admin sees) and says whether it's estimated; the frequency-based guess is only a fallback. API: `ScholarDashboardDto` gained `nextPaymentNote`, `nextPaymentAmount`, `documentsDue`, `documentsDueDate` (all optional/trailing).
- Payroll: "Eligible Scholars" card shows "of N listed"; every non-eligible row now states why (compliance status, no stipend, already paid).
- Admin Notifications cards were mislabeled (Pending SMS / Delivered / Failed SMS were really unread / read / pending registrations). Relabeled to Unread, Read, Awaiting Approval; hints say they ignore the filters.
**2. Tables no longer clip**
- Long text columns (course, scholarship, activity details, notification titles) wrap instead of cutting mid-word (`.wrap` in styles.css). Scholar list rows are 2 lines tall.
- New `ScrollCue` directive (`shared/scroll-cue.ts`) fades the edge of any table that scrolls sideways so hidden columns are visible. Applied to every `.grid-wrap`.
- Payroll and Scholar Management put the side panel beside the table only on screens ≥1800px wide; below that it stacks, so the table has room. Notifications panel widths tightened.
**3. Scholar's main task is visible**
- Compliance list has an Action column with an Upload / Re-upload button per row (View file once submitted), plus a banner "N requirements still need your document".
- Scholar dashboard shows a banner "5 documents need to be submitted by Dec 20, 2026" with an Upload documents button.
- Registration explains that documents are saved to the account once approved (approval already carries them into Compliance as Submitted); compliance details for Submitted items say it's awaiting review.
- Tests updated for the new inline upload buttons; screenshots/ refreshed.

### 2026-11-20 — Refreshed screenshots/
- `screenshots/` now holds only the 13 current UI screenshots (login, register, 6 admin pages, 5 scholar pages), 1600px wide, taken with headless Chromium against the running app using the Adachi/Shimamura demo logins. No console errors on any page.
- Removed the `original/` folder (it only held a README) and the `web/` subfolder; the PNGs now sit directly in `screenshots/`.
- Note: the folder is git-ignored (pending `.gitignore` change), so these files aren't in the repo. Screenshots show the demo scholar "Shimamura Demo".

### 2026-11-20 — Main font: Nimbus Sans
- Replaced Century Gothic/Questrial with **Nimbus Sans** (URW++ Helvetica clone, real Regular/Bold/Italic/Bold Italic) in `web/src/styles.css` (`@font-face` + `--font-sans`), chart legends (`shared/charts.ts`) and print/PDF output (`shared/print.ts`, now waits for the font before opening the print dialog).
- Font files self-hosted in `web/public/fonts/` (from ArtifexSoftware/urw-base35-fonts) with their license text (`NIMBUS-LICENSE.txt`). Removed the Google Fonts links from `index.html`; preloads the Regular and Bold files instead.
- Fallback is Arial: Nimbus Sans has no peso sign (₱), so the browser takes just that glyph from Arial.
- Licence note: these fonts are AGPL-3.0 with an exception that only covers embedding in PDF/PostScript documents. Worth a check if the project is ever distributed commercially.

### 2026-11-20 — Fix print dialog opening twice
- `web/src/app/shared/print.ts` (`printHtml`): printing was triggered by both the iframe `onload` and a 400ms fallback timer, so the dialog appeared twice (Cancel only dismissed the first). Now guarded so it runs exactly once. Affects every print/PDF button (reports, templates, receipts).

### 2026-11-20 — Scholar list: virtual scrolling, no stretching
- `web/src/app/pages/admin/scholars.ts`: the scholar table is now a CSS-grid list inside `cdk-virtual-scroll-viewport` (30px rows), so only visible rows render. Its height fits the content (up to 24 rows) instead of stretching to match the edit form beside it (`items-start` on the grid).
- Added `@angular/cdk` (web/package.json); added `.cell` style in `styles.css`.
- Behavior kept: click selects, double-click opens details, same columns/colors. Dropped the row hover tint.

### 2026-11-20 — Collapsible sidebar + original logo restored
- `web/src/app/layout/admin-shell.ts`, `scholar-shell.ts`: hamburger button collapses the sidebar to an icon-only rail (72px admin / 76px scholar); labels become hover tooltips. State is remembered per portal in localStorage. Colors/sizes otherwise unchanged. Admin toggle sits in the top bar; scholar toggle sits beside the page title.
- Restored the original `scholar.png` logo in both shells (it had been swapped for a Hugeicon in the icon change); file brought back to `web/public/assets/`.
- Added `menu` to the icon map in `shared/icon.ts`.

### 2026-11-20 — Hugeicons replace all icons
- Added `@hugeicons/angular` + `@hugeicons/core-free-icons` (web/package.json).
- New `web/src/app/shared/icon.ts`: `<app-icon name="bell">` component and the `ICONS` name→Hugeicon map. To change an icon, edit the map.
- Replaced every `<img src="assets/*.png">` icon (sidebars, stat cards, buttons, profile/avatar) and the emoji/✓/⚠ icons in templates (register upload slots, report templates, approve/attached/already-paid markers) with `<app-icon>`.
- Card icons are now white on the brand teal tile (`.card-icon` in styles.css).
- Deleted the unused icon PNGs from `web/public/assets/` (kept `lcc-logo.png`, `login-bg.png`).
- Not changed: emoji inside pop-up dialog message text (plain strings) and the favicon.

### 2026-11-20 — Easy demo logins
- `api/src/SkolarAid.Api/Infrastructure/DbSeeder.cs`: new `Seed:DemoLogins` flag upserts two accounts on every start (password re-applied, account set Active). Student also gets a linked Scholar profile (required to log in).
- `run.sh`: `demo` always enables it; `dev` enables it unless `SEED_DEMO_LOGINS=false` in `.env`.
- Logins: admin `Adachi` / `adachi123`; student `Shimamura` / `shimamura123`.
- Local dev only: set `SEED_DEMO_LOGINS=false` for any real deployment.

### 2026-11-20 — Start tracking
- Created this file to record changes made from the web from this point on.
- Baseline: commit `7aca13c` (feat: add run.sh db for a user-space MariaDB).
