#!/usr/bin/env bash
# SkolarAid run script.   Usage: ./run.sh <command>
#
#   demo     API + web with a throw-away SQLite database (no MySQL/Docker needed). Admin: admin / Admin#12345
#   dev      API + web against a local MySQL (reads .env, see .env.example)
#   docker   docker compose up --build (API + MySQL + web)
#   test     run the API and web test suites
#   stop     stop anything started by this script
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$PWD"
RUN_DIR="$ROOT/.run"
API_URL="http://localhost:5080"
WEB_URL="http://localhost:4200"
mkdir -p "$RUN_DIR"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1 ($2)" >&2; exit 1; }; }

load_env() {
  if [[ -f .env ]]; then set -a; source .env; set +a; fi
}

web_deps() {
  [[ -d web/node_modules ]] || (cd web && npm install --no-audit --no-fund)
}

stop_all() {
  for f in "$RUN_DIR"/api.pid "$RUN_DIR"/web.pid; do
    if [[ -f $f ]]; then
      pid=$(cat "$f")
      # kill the whole process group so dotnet/ng children die too
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      rm -f "$f"
    fi
  done
  # fallback: anything still listening on our ports (dotnet/ng can outlive the wrapper process)
  for port in 5080 4200; do
    for pid in $(ss -ltnp "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
      kill "$pid" 2>/dev/null || true
    done
  done
  sleep 1
}

wait_for() {  # url, name
  for _ in $(seq 1 60); do
    curl -fs -m 2 "$1" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "$2 did not start; see $RUN_DIR/*.log" >&2
  return 1
}

start_stack() {  # assumes API env vars are exported
  need dotnet ".NET 10 SDK"; need node "Node 22+"; need npm "Node 22+"; need curl "curl"
  stop_all
  web_deps
  (cd api && dotnet build src/SkolarAid.Api -v q --nologo >"$RUN_DIR/build.log" 2>&1) || { cat "$RUN_DIR/build.log"; exit 1; }

  export ASPNETCORE_URLS="$API_URL"
  (cd api && setsid dotnet run --project src/SkolarAid.Api --no-build --no-launch-profile >"$RUN_DIR/api.log" 2>&1 & echo $! >"$RUN_DIR/api.pid")
  (cd web && setsid npx ng serve --port 4200 >"$RUN_DIR/web.log" 2>&1 & echo $! >"$RUN_DIR/web.pid")

  trap 'echo; echo "Stopping..."; stop_all; exit 0' INT TERM
  wait_for "$API_URL/health" "API"
  wait_for "$WEB_URL" "Web"
  echo
  echo "  Web : $WEB_URL"
  echo "  API : $API_URL/health"
  echo "  Logs: $RUN_DIR/api.log, $RUN_DIR/web.log"
  echo "  Ctrl+C to stop."
  while true; do sleep 3600 & wait $!; done
}

cmd="${1:-help}"
case "$cmd" in
  demo)
    export ASPNETCORE_ENVIRONMENT=Development
    export Database__Provider=Sqlite
    export ConnectionStrings__Default="Data Source=$RUN_DIR/demo.db"
    export Uploads__Directory="$RUN_DIR/uploads"
    export Seed__AdminUsername="${SEED_ADMIN_USERNAME:-admin}"
    export Seed__AdminPassword="${SEED_ADMIN_PASSWORD:-Admin#12345}"
    export Seed__SampleData=true
    echo "Demo mode: SQLite at $RUN_DIR/demo.db (delete it to reset). Login: $Seed__AdminUsername / $Seed__AdminPassword"
    start_stack
    ;;
  dev)
    if [[ ! -f .env ]]; then
      cp .env.example .env
      key=$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | head -c 48)
      sed -i "s|^JWT_KEY=.*|JWT_KEY=$key|" .env
      cat <<MSG
Created .env with a random JWT_KEY. Now edit it and set:
  MYSQL_USER / MYSQL_PASSWORD   a MySQL account that can create tables (e.g. root for local dev)
  MYSQL_DATABASE                database name (create it first: CREATE DATABASE iskolaraid CHARACTER SET utf8mb4;)
  SEED_ADMIN_PASSWORD           password for the first admin login
Optional: MYSQL_HOST / MYSQL_PORT if MySQL is not on localhost:3306.
Then run ./run.sh dev again.
MSG
      exit 0
    fi
    load_env
    : "${MYSQL_PASSWORD:?Copy .env.example to .env and set MYSQL_PASSWORD, JWT_KEY, SEED_ADMIN_PASSWORD}"
    : "${JWT_KEY:?Set JWT_KEY in .env}"
    export ASPNETCORE_ENVIRONMENT=Development
    export ConnectionStrings__Default="${ConnectionStrings__Default:-Server=${MYSQL_HOST:-localhost};Port=${MYSQL_PORT:-3306};Database=${MYSQL_DATABASE:-iskolaraid};User=${MYSQL_USER:-root};Password=${MYSQL_PASSWORD};}"
    export Jwt__Key="$JWT_KEY"
    export Database__AutoMigrate=true
    export Database__ServerType="${DB_SERVER_TYPE:-MySql}" Database__ServerVersion="${DB_SERVER_VERSION:-8.0.36}"
    export Cors__Origins="${CORS_ORIGINS:-http://localhost:4200}"
    export Seed__AdminUsername="${SEED_ADMIN_USERNAME:-admin}"
    export Seed__AdminPassword="${SEED_ADMIN_PASSWORD:-}"
    export Seed__SampleData="${SEED_SAMPLE_DATA:-false}"
    export Smtp__Host="${SMTP_HOST:-}" Smtp__Port="${SMTP_PORT:-587}" Smtp__User="${SMTP_USER:-}" Smtp__Password="${SMTP_PASSWORD:-}"
    export Smtp__FromAddress="${SMTP_FROM_ADDRESS:-}" Smtp__LoginUrl="${SMTP_LOGIN_URL:-$WEB_URL/login}"
    export Sms__ApiKey="${SMS_API_KEY:-}" Sms__SenderName="${SMS_SENDER_NAME:-}"
    export Uploads__Directory="$RUN_DIR/uploads"
    start_stack
    ;;
  docker)
    need docker "Docker with the compose plugin"
    [[ -f .env ]] || { echo "Create .env first: cp .env.example .env (set passwords and JWT_KEY)" >&2; exit 1; }
    exec docker compose up --build
    ;;
  test)
    need dotnet ".NET 10 SDK"; need npm "Node 22+"
    web_deps
    (cd api && dotnet test --nologo)
    (cd web && npm test -- --watch=false)
    ;;
  stop)
    stop_all; echo "Stopped."
    ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
