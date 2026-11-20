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
