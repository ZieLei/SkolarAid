# SkolarAid — web edition

Scholarship management for Legacy College of Compostela. This repository started as a WinForms + MySQL desktop app
(`/SkolarAid`, kept untouched for reference) and is being migrated to a web app on the `migrate/angular-aspnet` branch:

| Part | Tech | Folder |
|---|---|---|
| Frontend | Angular 22 (standalone components, strict TypeScript) + Tailwind CSS 4 | [web/](web) |
| Backend | ASP.NET Core 10 (LTS) Web API, EF Core 9 + Pomelo MySQL, JWT auth | [api/](api) |
| Database | MySQL 8 (same schema as the desktop app) | — |

Docs: [MIGRATION_PLAN.md](MIGRATION_PLAN.md) (analysis, decisions, risks) · [PARITY_CHECKLIST.md](PARITY_CHECKLIST.md) (old feature → new location).

## Quick start with Docker

```bash
cp .env.example .env        # then set MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD, JWT_KEY, SEED_ADMIN_PASSWORD
docker compose up --build
```

Open http://localhost:4200 and sign in with `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`.
The API runs the EF migrations on start (`Database__AutoMigrate=true`) and creates the first admin if none exists.
Set `SEED_SAMPLE_DATA=true` to also get three sample scholarship types.

## Run locally (without Docker)

Requirements: .NET 10 SDK, Node 22+, a MySQL 8 server.

```bash
# 1. database
mysql -u root -p -e "CREATE DATABASE iskolaraid CHARACTER SET utf8mb4;"

# 2. API  (http://localhost:5080)
cd api
export ConnectionStrings__Default="Server=localhost;Port=3306;Database=iskolaraid;User=root;Password=YOUR_PASSWORD;"
export Jwt__Key="$(openssl rand -base64 48)"
export Database__AutoMigrate=true
export Seed__AdminUsername=admin Seed__AdminPassword='choose-a-strong-one' Seed__SampleData=true
dotnet run --project src/SkolarAid.Api

# 3. web  (http://localhost:4200, /api is proxied to :5080)
cd web && npm install && npm start
```

In `Development` the API generates a throw-away JWT key if `Jwt__Key` is unset (tokens die on restart). In any other environment the key is required.

### Using an existing desktop database

Back it up, then run [db/existing-database.sql](db/existing-database.sql) once. It widens `users.password`
(old plaintext passwords still work and are re-hashed on each user's first login), adds the nullable
`scholar_registrations.student_id` column and records the EF baseline so the API does not try to create existing tables.

## Environment variables

ASP.NET maps `Section__Key` to `Section:Key`. In Docker use the `.env` names in [.env.example](.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `ConnectionStrings__Default` | yes | MySQL connection string |
| `Jwt__Key` | yes (outside Development) | HMAC signing key, 32+ chars |
| `Jwt__ExpiryMinutes` | no (480) | Token lifetime |
| `Cors__Origins` | no (`http://localhost:4200`) | Comma-separated browser origins |
| `Database__AutoMigrate` | no (false) | Apply EF migrations on startup |
| `Database__ServerVersion` | no (8.0.36) | MySQL version hint for Pomelo |
| `Seed__AdminUsername` / `Seed__AdminPassword` | first run | Creates the first ADMIN if none exists |
| `Seed__SampleData` | no | Insert sample scholarship types if the table is empty |
| `Smtp__Host/Port/User/Password/FromAddress/LoginUrl` | no | Email (welcome, approval/rejection, payroll). Empty host disables email |
| `Sms__ApiKey` / `Sms__SenderName` | no | SMS through Semaphore. Empty key disables SMS |
| `Uploads__Directory` / `Uploads__MaxBytes` | no (`uploads`, 10 MB) | Registration document storage |

> **Rotate your old credentials.** The desktop app shipped a Gmail app password and a Semaphore API key in its public source.
> They are *not* used here, but they remain exposed upstream and should be revoked.

## Commands

```bash
# API
cd api
dotnet build
dotnet test                                   # 74 tests (rules, services, HTTP end-to-end on SQLite)
dotnet dotnet-ef migrations add <Name> --project src/SkolarAid.Data --startup-project src/SkolarAid.Data
dotnet dotnet-ef database update --project src/SkolarAid.Data --startup-project src/SkolarAid.Data

# Web
cd web
npm start                                     # dev server with /api proxy
npm test -- --watch=false                       # 16 component/service tests (Vitest)
npm run build                                 # production bundle in web/dist
```

## Layout

```
api/src/SkolarAid.Api    controllers (thin), JWT, validation, error handling, startup/seed
api/src/SkolarAid.Core   services + DTOs + pure business rules (ported from the WinForms code-behind)
api/src/SkolarAid.Data   EF Core entities, DbContext (snake_case mapping of the legacy schema), migrations
api/tests                xUnit tests (unit + WebApplicationFactory end-to-end)
web/src/app/core         API client, auth, guards, dialogs, formatting
web/src/app/layout       admin shell (header + 280px sidebar) and scholar shell (300px sidebar)
web/src/app/pages        one component per original WinForms screen
```

## Roles and security

* `ADMIN` — every `/api/admin/*` endpoint and `/admin/*` route.
* `SCHOLAR` — `/api/scholar/*` only; the scholar is taken from the JWT and **never** from a client-supplied id.
* Passwords hashed with ASP.NET `PasswordHasher` (PBKDF2); login errors don't reveal whether a username exists; login and public registration are rate limited.
* Uploads are limited to PDF/Word/JPG/PNG up to 10 MB; registration files are stored under generated names.
* CSV exports neutralise spreadsheet formula injection.

## Known limitations

See "What was and wasn't tested" in [PARITY_CHECKLIST.md](PARITY_CHECKLIST.md).
