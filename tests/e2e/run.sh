#!/usr/bin/env bash
# Kiểm thử pipeline phiên âm trọn vẹn trên máy / CI, không cần Supabase, Google hay khoá AI thật.
# Dựng: PostgreSQL (DB tạm) → PostgREST → gateway Supabase giả lập → máy chủ giả lập Google/Gemini/Soniox
#       → Next.js (build với cấu hình e2e) → chạy tests/e2e/run-pipeline.mjs.
#
# Cần:
#   DATABASE_ADMIN_URL  kết nối TCP tới PostgreSQL 16, vd postgresql://postgres:postgres@127.0.0.1:5432/postgres
#   POSTGREST_BIN       đường dẫn tệp chạy PostgREST (v14), vd tải từ
#                       https://github.com/PostgREST/postgrest/releases/download/v14.1/postgrest-v14.1-linux-static-x86-64.tar.xz
# Tuỳ chọn: E2E_SKIP_BUILD=1 (dùng bản build sẵn — phải build với NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#           và khoá anon của gateway), E2E_KEEP=1 (giữ DB và log để xem lại).
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
OUT="$ROOT/tests/e2e/.out"
mkdir -p "$OUT"

: "${DATABASE_ADMIN_URL:?Cần DATABASE_ADMIN_URL (TCP)}"
: "${POSTGREST_BIN:?Cần POSTGREST_BIN}"
export JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters}"
export APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-$(openssl rand -base64 32)}"
DB="meetingai_e2e_$$"
url_with_db() { node -e 'const u=new URL(process.argv[1]); if (process.argv[3]) { u.username=process.argv[3]; u.password=process.argv[3]; } u.pathname="/"+process.argv[2]; console.log(u.toString())' "$DATABASE_ADMIN_URL" "$@"; }
E2E_DB_URL="$(url_with_db "$DB")"
AUTH_DB_URL="$(url_with_db "$DB" authenticator)"
PIDS=()

cleanup() {
  local code=$?
  # Next chạy trong nhóm tiến trình riêng (setsid) → dừng cả nhóm, không để máy chủ cũ sót lại giữ cổng
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && { kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; }; done
  if [ "$code" -ne 0 ]; then
    for f in postgrest gateway mock next; do
      echo "----- $f.log (cuối) -----"; tail -n 40 "$OUT/$f.log" 2>/dev/null || true
    done
  fi
  if [ -z "${E2E_KEEP:-}" ]; then psql "$DATABASE_ADMIN_URL" -q -c "drop database if exists $DB with (force)" >/dev/null 2>&1 || true; fi
  exit "$code"
}
trap cleanup EXIT

wait_for() { # url, tên
  for _ in $(seq 1 120); do
    if curl -s -o /dev/null "$1"; then return 0; fi
    sleep 0.5
  done
  echo "Không khởi động được $2 ($1)"; return 1
}

# Cổng bận (thường do lần chạy trước còn sót) → dừng ngay, tránh kiểm thử nhầm vào máy chủ cũ
for port in 3001 54321 4010 3100; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then echo "Cổng $port đang bận — hãy dừng tiến trình cũ rồi chạy lại"; exit 1; fi
done

echo "▶ Sinh dữ liệu tổng hợp"
MOCK_URL=http://127.0.0.1:4010 node tests/e2e/synthetic.mjs "$OUT"

echo "▶ Tạo CSDL $DB (stub Supabase + migration + seed)"
psql "$DATABASE_ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "create database $DB"
psql "$E2E_DB_URL" -q -v ON_ERROR_STOP=1 -f tests/db/supabase-stub.sql >/dev/null 2>&1
for f in supabase/migrations/*.sql; do psql "$E2E_DB_URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
psql "$E2E_DB_URL" -q -v ON_ERROR_STOP=1 -f "$OUT/seed.sql" >/dev/null

echo "▶ PostgREST, gateway Supabase giả lập, máy chủ giả lập Google/Gemini/Soniox"
PGRST_DB_URI="$AUTH_DB_URL" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
  PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=3001 "$POSTGREST_BIN" > "$OUT/postgrest.log" 2>&1 &
PIDS+=($!)
wait_for http://127.0.0.1:3001/ PostgREST
rm -rf "$OUT/storage"
POSTGREST_URL=http://127.0.0.1:3001 DATABASE_URL="$E2E_DB_URL" STORAGE_DIR="$OUT/storage" \
  node tests/e2e/gateway.mjs > "$OUT/gateway.log" 2>&1 &
PIDS+=($!)
AUDIO="$OUT/audio.m4a" GT="$OUT/gt.json" OMIT="1:60:150" FAIL_ONCE="2:500" LATENCY_MS=300 \
  OVERLOAD="gemini-3.8-flash:0:2" OVERLOAD_MODELS="gemini-9-overloaded" FILE_GONE="1" ECHO_REFS="1" \
  node tests/e2e/mock-google.mjs > "$OUT/mock.log" 2>&1 &
PIDS+=($!)
wait_for http://127.0.0.1:54321/auth/v1/settings gateway
wait_for http://127.0.0.1:4010/v1beta/models "máy chủ giả lập"
eval "$(node tests/e2e/gateway.mjs --print-keys)"

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
if [ -z "${E2E_SKIP_BUILD:-}" ]; then
  echo "▶ Build Next.js với cấu hình e2e"
  npm run build > "$OUT/build.log" 2>&1 || { tail -n 40 "$OUT/build.log"; exit 1; }
fi

echo "▶ Khởi động ứng dụng"
SUPABASE_SECRET_KEY="$SERVICE_KEY" WORKER_SECRET=e2e-worker-secret APP_URL=http://127.0.0.1:3100 TRANSCRIBE_RETRY_BASE_MS=1000 \
  GOOGLE_CLIENT_ID=e2e GOOGLE_CLIENT_SECRET=e2e GOOGLE_DRIVE_REFRESH_TOKEN=e2e \
  GOOGLE_API_BASE_URL=http://127.0.0.1:4010 GOOGLE_OAUTH_TOKEN_URL=http://127.0.0.1:4010/token \
  setsid npx next start -p 3100 -H 127.0.0.1 > "$OUT/next.log" 2>&1 &
PIDS+=($!)
wait_for http://127.0.0.1:3100/login "ứng dụng"

echo "▶ Chạy kiểm thử pipeline"
APP_URL=http://127.0.0.1:3100 SUPABASE_URL=http://127.0.0.1:54321 DATABASE_URL="$E2E_DB_URL" GT="$OUT/gt.json" \
  AUDIO="$OUT/audio.m4a" STORAGE_DIR="$OUT/storage" node tests/e2e/run-pipeline.mjs
