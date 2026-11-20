# IskolarAid

Manage scholars, scholarships, payroll and compliance for Legacy College of Compostela.

The app began as a WinForms + MySQL desktop program (the `/SkolarAid` folder, kept as it was, old spelling included). The web version lives on the `migrate/angular-aspnet` branch.

| Part | Stack |
| --- | --- |
| [web/](web) | Angular 22, Tailwind CSS 4 |
| [api/](api) | ASP.NET Core 10, EF Core 9 with Pomelo, JWT |
| Database | MySQL 8 or MariaDB, same schema as the desktop app |

More background: [MIGRATION_PLAN.md](MIGRATION_PLAN.md) explains the decisions, and [PARITY_CHECKLIST.md](PARITY_CHECKLIST.md) maps each old feature to its new place.

## Try it

```bash
./run.sh demo
```

Starts the API and the web app on a throw-away SQLite database. Sign in as `admin` / `Admin#12345`. Needs no MySQL and no Docker, but it is for looking around only.

The other commands:

```bash
./run.sh dev      # API + web against your MySQL or MariaDB, configured in .env
./run.sh db       # start a MariaDB in .run/ without sudo, using the names in .env
./run.sh docker   # build and start API, MySQL and web with Docker
./run.sh test     # run the API and web tests
./run.sh stop     # stop whatever the script started
```

## Run with Docker

```bash
cp .env.example .env
docker compose up --build
```

Fill in `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `JWT_KEY` and `SEED_ADMIN_PASSWORD` in `.env` first. Then open <http://localhost:4200> and sign in with `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD`.

On start the API applies the EF migrations and creates the first admin if there is none. Set `SEED_SAMPLE_DATA=true` to add three sample scholarship types.

## Run without Docker

You need the .NET 10 SDK, Node 22+ and a MySQL 8 server.

```bash
mysql -u root -p -e "CREATE DATABASE iskolaraid CHARACTER SET utf8mb4;"

cd api
export ConnectionStrings__Default="Server=localhost;Port=3306;Database=iskolaraid;User=root;Password=YOUR_PASSWORD;"
export Jwt__Key="$(openssl rand -base64 48)"
export Database__AutoMigrate=true
export Seed__AdminUsername=admin Seed__AdminPassword='pick-a-strong-one' Seed__SampleData=true
dotnet run --project src/IskolarAid.Api      # http://localhost:5080

cd ../web
npm install
npm start                                    # http://localhost:4200, proxies /api to :5080
```

In `Development` the API makes up a JWT key when `Jwt__Key` is empty, so tokens stop working after a restart. Any other environment refuses to start without one.

## Fill a dev database with fake data

Set these in `.env` before `./run.sh dev`:

| Variable | Effect |
| --- | --- |
| `SEED_DEMO_LOGINS=true` | Creates `Adachi` (admin, `adachi123`) and `Shimamura` (scholar, `shimamura123`) on every start. On by default in dev, so turn it off anywhere real. |
| `SEED_HISTORICAL_DATA=true` | Adds two years of scholars, registrations, payroll, notifications and logs once. Seeded scholars sign in with their student ID and `Scholar#123`. |

## Keep an existing desktop database

Back it up, then run [db/existing-database.sql](db/existing-database.sql) once. It widens `users.password`, adds the nullable `scholar_registrations.student_id` column and records the EF baseline so the API leaves the existing tables alone. Old plaintext passwords keep working and get hashed the first time each user signs in.

## Configure

ASP.NET reads `Section__Key` as `Section:Key`. Docker reads the names in [.env.example](.env.example).

| Variable | Needed | What it does |
| --- | --- | --- |
| `ConnectionStrings__Default` | yes | Connects to the database |
| `Jwt__Key` | outside Development | Signs tokens (32+ characters) |
| `Jwt__ExpiryMinutes` | no, 480 | Sets how long a token lasts |
| `Cors__Origins` | no, `http://localhost:4200` | Lists the browser origins allowed, comma separated |
| `Database__AutoMigrate` | no, false | Applies EF migrations on start |
| `Database__ServerType` / `Database__ServerVersion` | no, MySql / 8.0.36 | Tells Pomelo which server to expect (use `MariaDb` for MariaDB) |
| `Seed__AdminUsername` / `Seed__AdminPassword` | first run | Creates the first admin if none exists |
| `Seed__SampleData` | no | Adds sample scholarship types to an empty table |
| `Smtp__Host`, `Port`, `User`, `Password`, `FromAddress`, `LoginUrl` | no | Sends email (welcome, approval, rejection, payroll). No host, no email |
| `Sms__ApiKey` / `Sms__SenderName` | no | Sends texts through Semaphore. No key, no texts |
| `Uploads__Directory` / `Uploads__MaxBytes` | no, `uploads` and 10 MB | Stores registration documents |

> The desktop app's public source contains a Gmail app password and a Semaphore API key. This version does not use them, but they are still exposed upstream, so revoke them.

## Build and test

```bash
cd api
dotnet build
dotnet test       # 74 tests: rules, services and HTTP end to end on SQLite
dotnet dotnet-ef migrations add <Name> --project src/IskolarAid.Data --startup-project src/IskolarAid.Data
dotnet dotnet-ef database update --project src/IskolarAid.Data --startup-project src/IskolarAid.Data

cd ../web
npm test -- --watch=false    # 17 Vitest tests
npm run build                # bundle goes to web/dist
```

## Find your way around

```text
api/src/IskolarAid.Api    controllers, JWT, startup and seeding
api/src/IskolarAid.Core   services, DTOs and the business rules ported from WinForms
api/src/IskolarAid.Data   entities, DbContext, migrations
api/tests                 xUnit unit tests and end-to-end tests
web/src/app/core          API client, auth, dialogs, formatting
web/src/app/layout        the admin and scholar shells
web/src/app/pages         one component per original WinForms screen
web/src/app/shared        icons, modals, summary strip, form errors, chart setup
```

## Know who can do what

* `ADMIN` reaches every `/api/admin/*` endpoint and `/admin/*` route.
* `SCHOLAR` reaches `/api/scholar/*` only. The API reads the scholar from the JWT and never trusts an id from the client.
* Passwords go through ASP.NET's `PasswordHasher` (PBKDF2). Login errors never say whether a username exists, and login and public registration are rate limited.
* Uploads accept PDF, Word, JPG and PNG up to 10 MB, and registration files are saved under generated names.
* CSV exports defuse spreadsheet formula injection.

## Known gaps

[PARITY_CHECKLIST.md](PARITY_CHECKLIST.md) lists what was and was not tested.
