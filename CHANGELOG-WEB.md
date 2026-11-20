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
