#!/usr/bin/env bash
# IskolarAid run script.   Usage: ./run.sh <command>
#
#   demo     API + web with a throw-away SQLite database (no MySQL/Docker needed). Admin: admin / Admin#12345
#   dev      API + web against the real database (reads .env; starts the local MariaDB in .run/ if it is not up)
#            Both serve https://localhost:4200. Add --lan to let phones/laptops on your network open it too.
#   cert     create or refresh the HTTPS certificate (done automatically by demo/dev)
#   share-ca let another device trust this machine's certificates (shows a link and QR code)
#   db       start a user-space MariaDB in .run/ (no sudo; creates the DB and app user from .env)
#   mailpit  download Mailpit into .run/bin. demo/dev then catch every email (with SMTP_HOST empty) at http://localhost:8025
#   docker   docker compose up --build (API + MySQL + web)
#   test     run the API and web test suites
#   stop     stop anything started by this script, including the local MariaDB
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$PWD"
RUN_DIR="$ROOT/.run"
CERT_DIR="$RUN_DIR/certs"
API_URL="http://localhost:5080"   # only the dev server talks to the API; browsers go through the dev server's proxy
LAN=0; for arg in "$@"; do [[ $arg == --lan ]] && LAN=1; done
SCHEME=https; [[ "${NO_HTTPS:-0}" == 1 ]] && SCHEME=http   # NO_HTTPS=1 ./run.sh dev for plain HTTP
WEB_URL="$SCHEME://localhost:4200"
mkdir -p "$RUN_DIR"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1 ($2)" >&2; exit 1; }; }

load_env() {
  if [[ -f .env ]]; then set -a; source .env; set +a; fi
}

web_deps() {
  [[ -d web/node_modules ]] || (cd web && npm install --no-audit --no-fund)
}

stop_all() {
  for f in "$RUN_DIR"/api.pid "$RUN_DIR"/web.pid "$RUN_DIR"/ca.pid "$RUN_DIR"/mailpit.pid; do
    if [[ -f $f ]]; then
      pid=$(cat "$f")
      # kill the whole process group so dotnet/ng children die too
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      rm -f "$f"
    fi
  done
  if [[ -f "$RUN_DIR/mariadb.pid" && "${1:-}" == "--db" ]]; then kill "$(cat "$RUN_DIR/mariadb.pid")" 2>/dev/null || true; fi
  # fallback: anything still listening on our ports (dotnet/ng can outlive the wrapper process)
  for port in 5080 4200 8025 1025; do
    for pid in $(ss -ltnp "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
      kill "$pid" 2>/dev/null || true
    done
  done
  sleep 1
}

wait_for() {  # url, name
  for _ in $(seq 1 60); do
    curl -kfs -m 2 "$1" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "$2 did not start; see $RUN_DIR/*.log" >&2
  return 1
}

# ---------- HTTPS certificates ----------
# mkcert creates a certificate authority (CA) for THIS machine once and adds it to the system and browser trust
# stores, then signs a certificate for localhost, this machine's name and its network addresses. Everything lives
# in .run/certs (git-ignored). The CA's private key stays in "$(mkcert -CAROOT)" and must never be copied anywhere.

host_name() { cat /etc/hostname 2>/dev/null || uname -n; }
lan_ips() { ip -4 -o addr show scope global 2>/dev/null | awk '{split($4, a, "/"); print a[1]}'; }
cert_names() { echo localhost; echo 127.0.0.1; local h; h=$(host_name); [[ -n $h ]] && { echo "$h"; echo "$h.local"; }; lan_ips; }

cert_covers() {  # the certificate exists, is valid for 30+ more days, and names every current host/address
  [[ -f $CERT_DIR/dev.pem && -f $CERT_DIR/dev-key.pem ]] || return 1
  openssl x509 -checkend 2592000 -noout -in "$CERT_DIR/dev.pem" >/dev/null 2>&1 || return 1
  local san n; san=$(openssl x509 -noout -ext subjectAltName -in "$CERT_DIR/dev.pem" 2>/dev/null | tr ',' '\n' | sed 's/^ *//')
  for n in $(cert_names); do grep -qxF -e "DNS:$n" -e "IP Address:$n" <<<"$san" || return 1; done
}

ensure_certs() {  # [--force]
  [[ $SCHEME == https ]] || return 0
  mkdir -p "$CERT_DIR"
  [[ "${1:-}" != --force ]] && cert_covers && return 0
  local names; names=$(cert_names | tr '\n' ' ')
  if command -v mkcert >/dev/null 2>&1; then
    echo "Creating the HTTPS certificate (the first time on a machine this may ask for your password to trust the local CA)..."
    mkcert -install
    # shellcheck disable=SC2086
    mkcert -cert-file "$CERT_DIR/dev.pem" -key-file "$CERT_DIR/dev-key.pem" $names >/dev/null 2>&1
  else
    need openssl "OpenSSL"
    echo "mkcert not found, so the certificate is self-signed and browsers will warn about it."
    echo "For a trusted certificate install mkcert (Arch: pacman -S mkcert nss · macOS: brew install mkcert nss · Windows: choco install mkcert), then: ./run.sh cert"
    local san; san=$(for n in $names; do [[ $n =~ ^[0-9.]+$ ]] && printf 'IP:%s,' "$n" || printf 'DNS:%s,' "$n"; done)
    openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=IskolarAid dev" -addext "subjectAltName=${san%,}" \
      -keyout "$CERT_DIR/dev-key.pem" -out "$CERT_DIR/dev.pem" >/dev/null 2>&1
  fi
  chmod 600 "$CERT_DIR/dev-key.pem"
  echo "HTTPS certificate valid for: $names"
}

# Prepares the public CA file and prints how to trust it. Sets CA_DIR / CA_IP / CA_PORT_USED for the caller.
ca_share_info() {  # "full" = every step (share-ca) | "short" = link, QR and fingerprint (dev --lan)
  need mkcert "mkcert (the self-signed fallback has no CA to share)"; need python3 "Python 3"
  local root url fp
  root="$(mkcert -CAROOT)/rootCA.pem"; [[ -f $root ]] || mkcert -install
  CA_IP=$(lan_ips | head -n1); [[ -n $CA_IP ]] || { echo "No network address found. Connect to Wi-Fi/LAN first." >&2; exit 1; }
  CA_PORT_USED="${CA_PORT:-8000}"
  CA_DIR="$CERT_DIR/share"; rm -rf "$CA_DIR"; mkdir -p "$CA_DIR"
  cp "$root" "$CA_DIR/IskolarAid-dev-CA.crt"   # the public certificate only, never rootCA-key.pem
  # The link uses this computer's current IP, so it changes when the network does. The file itself does not.
  url="http://$CA_IP:$CA_PORT_USED/IskolarAid-dev-CA.crt"
  fp=$(openssl x509 -in "$root" -noout -fingerprint -sha256 | cut -d= -f2)
  echo
  echo "  New device? Trust this computer's certificates once (same network):"
  echo "    1. On the device open  $url"
  command -v qrencode >/dev/null 2>&1 && { echo "       or scan:"; qrencode -t ANSIUTF8 -m 2 "$url" | sed 's/^/       /'; }
  if [[ ${1:-full} == full ]]; then
    cat <<MSG
    2. Install it as a trusted certificate authority:
         Android   Settings > Security > More security settings > Encryption & credentials > Install a certificate > CA certificate
         iPhone    Allow the profile download, then Settings > Profile Downloaded > Install,
                   then Settings > General > About > Certificate Trust Settings > turn it on
         Windows   Double-click the file > Install Certificate > Local Machine > Trusted Root Certification Authorities
         macOS     Double-click to add it to the System keychain, open it, set Trust > When using this certificate: Always Trust
         Linux     sudo trust anchor IskolarAid-dev-CA.crt   (Firefox: Settings > Certificates > Import, trust for websites)
    3. Check the SHA-256 fingerprint the device shows matches:
         $fp
    4. Start the app with  ./run.sh dev --lan  and open  https://$CA_IP:4200  on the device.

  Remove it later from the same settings screen.
MSG
  else
    echo "    2. Install it as a trusted CA (steps for each phone/OS: README > HTTPS)"
    echo "    3. Fingerprint must match: $fp"
  fi
}

share_ca() {  # serve the CA certificate in the foreground until Ctrl+C
  ca_share_info full
  echo "  Ctrl+C stops sharing."; echo
  exec python3 -I -m http.server "$CA_PORT_USED" --bind "$CA_IP" --directory "$CA_DIR"
}

MAILPIT_VERSION=v1.33.1
MAILPIT_BIN="$RUN_DIR/bin/mailpit"
MAIL_URL=""

install_mailpit() {  # official release from github.com/axllent/mailpit into .run/bin (no sudo)
  need curl "curl"; need tar "tar"
  local arch; case "$(uname -m)" in x86_64) arch=amd64;; aarch64|arm64) arch=arm64;; armv7l) arch=arm;; *) echo "No Mailpit build for $(uname -m)" >&2; exit 1;; esac
  local url="https://github.com/axllent/mailpit/releases/download/$MAILPIT_VERSION/mailpit-linux-$arch.tar.gz"
  mkdir -p "$RUN_DIR/bin"
  echo "Downloading Mailpit $MAILPIT_VERSION ..."
  curl -fsSL "$url" | tar -xz -C "$RUN_DIR/bin" mailpit
  chmod +x "$MAILPIT_BIN"
  echo "Installed Mailpit $MAILPIT_VERSION at $MAILPIT_BIN"
}

# With no real SMTP server configured, point the API at Mailpit so emails (welcome passwords etc.) can be read locally.
use_mail_catcher() {
  [[ -n "${SMTP_HOST:-}" || "${MAIL_CATCHER:-1}" == 0 ]] && return 0
  local bin; bin=$(command -v mailpit 2>/dev/null || true); [[ -z $bin && -x $MAILPIT_BIN ]] && bin=$MAILPIT_BIN
  if [[ -z $bin ]]; then
    echo "Note: emails are off (SMTP_HOST empty). Run ./run.sh mailpit once to read them at http://localhost:8025."
    return 0
  fi
  MAILPIT_CMD=$bin
  export Smtp__Host=127.0.0.1 Smtp__Port=1025 Smtp__User="" Smtp__Password=""
  export Smtp__FromAddress="${SMTP_FROM_ADDRESS:-no-reply@iskolaraid.local}"
  MAIL_URL="http://localhost:8025"
}

start_mail_catcher() {  # localhost only: the inbox shows passwords, so it is never exposed with --lan
  [[ -n $MAIL_URL ]] || return 0
  (setsid "$MAILPIT_CMD" --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 \
     --database "$RUN_DIR/mailpit.db" >"$RUN_DIR/mailpit.log" 2>&1 & echo $! >"$RUN_DIR/mailpit.pid")
}

start_stack() {  # assumes API env vars are exported
  need dotnet ".NET 10 SDK"; need node "Node 22+"; need npm "Node 22+"; need curl "curl"
  stop_all
  start_mail_catcher
  web_deps
  (cd api && dotnet build src/IskolarAid.Api -v q --nologo >"$RUN_DIR/build.log" 2>&1) || { cat "$RUN_DIR/build.log"; exit 1; }

  export ASPNETCORE_URLS="$API_URL"
  (cd api && setsid dotnet run --project src/IskolarAid.Api --no-build --no-launch-profile >"$RUN_DIR/api.log" 2>&1 & echo $! >"$RUN_DIR/api.pid")
  ensure_certs
  local serve=(--port 4200)
  [[ $SCHEME == https ]] && serve+=(--ssl --ssl-cert "$CERT_DIR/dev.pem" --ssl-key "$CERT_DIR/dev-key.pem")
  # --lan: listen on every network interface so other devices can connect (they must trust the CA: ./run.sh share-ca)
  [[ $LAN == 1 ]] && serve+=(--host 0.0.0.0 --allowed-hosts "$(host_name)" --allowed-hosts "$(host_name).local")
  (cd web && setsid npx ng serve "${serve[@]}" >"$RUN_DIR/web.log" 2>&1 & echo $! >"$RUN_DIR/web.pid")

  trap 'echo; echo "Stopping..."; stop_all; exit 0' INT TERM
  wait_for "$API_URL/health" "API"
  wait_for "$WEB_URL" "Web"
  echo
  echo "  Web : $WEB_URL"
  if [[ $LAN == 1 ]]; then for ip in $(lan_ips); do echo "        $SCHEME://$ip:4200   (other devices on this network)"; done; fi
  echo "  API : $API_URL/health"
  [[ -n $MAIL_URL ]] && echo "  Mail: $MAIL_URL   (every email the app sends lands here, not in real inboxes)"
  echo "  Logs: $RUN_DIR/api.log, $RUN_DIR/web.log"
  # --lan with mkcert: also share the CA certificate so a new device can trust the app (stops with the app)
  if [[ $LAN == 1 && $SCHEME == https ]] && command -v mkcert >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    ca_share_info short
    (setsid python3 -I -m http.server "$CA_PORT_USED" --bind "$CA_IP" --directory "$CA_DIR" >"$RUN_DIR/ca.log" 2>&1 & echo $! >"$RUN_DIR/ca.pid")
  fi
  echo
  echo "  Ctrl+C to stop."
  while true; do sleep 3600 & wait $!; done
}

start_db() {  # user-space MariaDB in .run/ (no sudo); creates the database and app user from .env
  need mariadbd "MariaDB server"; need mariadb-install-db "MariaDB server"; load_env
  D="$RUN_DIR/mariadb"; SOCK="$RUN_DIR/mysql.sock"
  if [[ ! -d $D/mysql ]]; then mkdir -p "$D"; mariadb-install-db --no-defaults --datadir="$D" --auth-root-authentication-method=normal --skip-test-db >/dev/null; fi
  if ! mariadb --no-defaults -S "$SOCK" -uroot -e 'select 1' >/dev/null 2>&1; then
    (setsid mariadbd --no-defaults --datadir="$D" --socket="$SOCK" --port="${MYSQL_PORT:-3306}" --bind-address=127.0.0.1 --pid-file="$RUN_DIR/mariadb.pid" >"$RUN_DIR/mariadb.log" 2>&1 &)
    for _ in $(seq 1 30); do mariadb --no-defaults -S "$SOCK" -uroot -e 'select 1' >/dev/null 2>&1 && break; sleep 1; done
  fi
  : "${MYSQL_PASSWORD:?set MYSQL_PASSWORD in .env}"
  u="${MYSQL_USER:-skolaraid}"; d="${MYSQL_DATABASE:-iskolaraid}"
  mariadb --no-defaults -S "$SOCK" -uroot -e "CREATE DATABASE IF NOT EXISTS \`$d\` CHARACTER SET utf8mb4;
    CREATE USER IF NOT EXISTS '$u'@'localhost' IDENTIFIED BY '$MYSQL_PASSWORD'; CREATE USER IF NOT EXISTS '$u'@'127.0.0.1' IDENTIFIED BY '$MYSQL_PASSWORD';
    GRANT ALL ON \`$d\`.* TO '$u'@'localhost'; GRANT ALL ON \`$d\`.* TO '$u'@'127.0.0.1'; FLUSH PRIVILEGES;"
  echo "MariaDB running on 127.0.0.1:${MYSQL_PORT:-3306}; database '$d', user '$u'. Stop with: ./run.sh stop"
}

db_reachable() {  # can the app's account log in to its database?
  command -v mariadb >/dev/null 2>&1 || return 0  # no client to check with: let the API report it
  MYSQL_PWD="${MYSQL_PASSWORD:-}" mariadb --no-defaults -h "${MYSQL_HOST:-127.0.0.1}" -P "${MYSQL_PORT:-3306}" \
    -u "${MYSQL_USER:-root}" -e 'select 1' "${MYSQL_DATABASE:-iskolaraid}" >/dev/null 2>&1
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
    export Seed__DemoLogins=true
    export Seed__HistoricalData="${SEED_HISTORICAL_DATA:-false}"
    echo "Demo mode: SQLite at $RUN_DIR/demo.db (delete it to reset). Login: $Seed__AdminUsername / $Seed__AdminPassword"
    use_mail_catcher
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
    # One command: if the database is not up yet and it is local, start the user-space MariaDB first.
    if ! db_reachable; then
      if [[ "${MYSQL_HOST:-localhost}" =~ ^(localhost|127\.0\.0\.1)$ ]] && command -v mariadbd >/dev/null 2>&1; then
        echo "Database not reachable; starting the local MariaDB in .run/ ..."
        start_db
      else
        echo "Cannot reach MySQL at ${MYSQL_HOST:-localhost}:${MYSQL_PORT:-3306} as ${MYSQL_USER:-root}. Start it, or check .env." >&2
        exit 1
      fi
    fi
    export ASPNETCORE_ENVIRONMENT=Development
    export ConnectionStrings__Default="${ConnectionStrings__Default:-Server=${MYSQL_HOST:-localhost};Port=${MYSQL_PORT:-3306};Database=${MYSQL_DATABASE:-iskolaraid};User=${MYSQL_USER:-root};Password=${MYSQL_PASSWORD};}"
    export Jwt__Key="$JWT_KEY"
    export Database__AutoMigrate=true
    export Database__ServerType="${DB_SERVER_TYPE:-MySql}" Database__ServerVersion="${DB_SERVER_VERSION:-8.0.36}"
    export Cors__Origins="${CORS_ORIGINS:-$WEB_URL}"
    export Seed__AdminUsername="${SEED_ADMIN_USERNAME:-admin}"
    export Seed__AdminPassword="${SEED_ADMIN_PASSWORD:-}"
    export Seed__SampleData="${SEED_SAMPLE_DATA:-false}"
    export Seed__DemoLogins="${SEED_DEMO_LOGINS:-true}"
    export Seed__HistoricalData="${SEED_HISTORICAL_DATA:-false}"
    export Smtp__Host="${SMTP_HOST:-}" Smtp__Port="${SMTP_PORT:-587}" Smtp__User="${SMTP_USER:-}" Smtp__Password="${SMTP_PASSWORD:-}"
    export Smtp__FromAddress="${SMTP_FROM_ADDRESS:-}" Smtp__LoginUrl="${SMTP_LOGIN_URL:-$WEB_URL/login}"
    export Uploads__Directory="$RUN_DIR/uploads"
    use_mail_catcher
    start_stack
    ;;
  mailpit)
    install_mailpit
    ;;
  import)
    # ./run.sh import "<file.xlsx>" [--purge-seed]
    # Loads the real scholar list from the Excel file into the real (dev) database. See ScholarImportService.cs.
    need dotnet ".NET 10 SDK"
    file="${2:-}"; [[ -f "$file" ]] || { echo "Usage: ./run.sh import \"<file.xlsx>\" [--purge-seed]" >&2; exit 1; }
    file="$(realpath "$file")"
    load_env
    : "${MYSQL_PASSWORD:?Set MYSQL_PASSWORD in .env}"; : "${JWT_KEY:?Set JWT_KEY in .env}"
    if ! db_reachable; then
      if [[ "${MYSQL_HOST:-localhost}" =~ ^(localhost|127\.0\.0\.1)$ ]] && command -v mariadbd >/dev/null 2>&1; then start_db; else echo "Cannot reach the database. Check .env." >&2; exit 1; fi
    fi
    mkdir -p "$RUN_DIR"
    # Back the database up first, so the import can be undone.
    backup="$RUN_DIR/backup-before-import-$(date +%Y%m%d-%H%M%S).sql"
    if command -v mariadb-dump >/dev/null 2>&1; then
      mariadb-dump -h "${MYSQL_HOST:-127.0.0.1}" -P "${MYSQL_PORT:-3306}" -u "${MYSQL_USER:-root}" -p"$MYSQL_PASSWORD" "${MYSQL_DATABASE:-iskolaraid}" > "$backup" 2>/dev/null && echo "Backup: $backup" || echo "Warning: could not back up the database." >&2
    fi
    export ASPNETCORE_ENVIRONMENT=Development
    export ConnectionStrings__Default="${ConnectionStrings__Default:-Server=${MYSQL_HOST:-localhost};Port=${MYSQL_PORT:-3306};Database=${MYSQL_DATABASE:-iskolaraid};User=${MYSQL_USER:-root};Password=${MYSQL_PASSWORD};}"
    export Jwt__Key="$JWT_KEY" Database__AutoMigrate=true
    export Database__ServerType="${DB_SERVER_TYPE:-MySql}" Database__ServerVersion="${DB_SERVER_VERSION:-8.0.36}"
    export Seed__AdminUsername="${SEED_ADMIN_USERNAME:-admin}" Seed__AdminPassword="${SEED_ADMIN_PASSWORD:-}"
    # Never add fake data while importing the real list.
    export Seed__SampleData=false Seed__HistoricalData=false Seed__DemoLogins=false
    export IMPORT_LIST_DIR="$RUN_DIR"
    cd api && dotnet run --project src/IskolarAid.Api -- "--import-scholars=$file" "${@:3}"
    ;;
  db)
    start_db
    ;;
  cert)
    ensure_certs --force
    ;;
  share-ca)
    share_ca
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
    stop_all --db; echo "Stopped (including the local MariaDB if ./run.sh db started it)."
    ;;
  *)
    sed -n '2,/^set -euo/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
    ;;
esac
