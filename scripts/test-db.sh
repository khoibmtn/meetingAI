#!/usr/bin/env bash
# Chạy migration + kiểm thử phân quyền (RLS) và tạo hồ sơ bù trên PostgreSQL cục bộ.
# Dùng: DATABASE_ADMIN_URL=postgresql://postgres@localhost:5432/postgres scripts/test-db.sh
set -euo pipefail
ADMIN_URL="${DATABASE_ADMIN_URL:-postgresql://postgres@localhost:5432/postgres}"
DB="meetingai_test_$$"
DB2="meetingai_backfill_$$"
trap 'psql "$ADMIN_URL" -q -c "drop database if exists $DB" -c "drop database if exists $DB2" >/dev/null' EXIT
db_url() { echo "$ADMIN_URL" | sed -E "s#/[^/?]+(\?|$)#/$1\1#"; }

migrate() {
  for f in supabase/migrations/*.sql; do
    psql "$1" -v ON_ERROR_STOP=1 -q -f "$f"
  done
}

# 1) CSDL mới: migration + kiểm thử RLS, RPC, hàm giành quyền
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "create database $DB"
TEST_URL="$(db_url "$DB")"
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f tests/db/supabase-stub.sql 2>&1 | grep -v "wal_level\|HINT" || true
migrate "$TEST_URL"
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f tests/db/rls-test.sql | tail -3

# 2) Đã có tài khoản đăng ký TRƯỚC khi chạy migration → tạo hồ sơ bù, người sớm nhất là quản trị viên
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "create database $DB2"
TEST_URL2="$(db_url "$DB2")"
psql "$TEST_URL2" -v ON_ERROR_STOP=1 -q -f tests/db/supabase-stub.sql 2>&1 | grep -v "wal_level\|HINT" || true
psql "$TEST_URL2" -v ON_ERROR_STOP=1 -q -f tests/db/backfill-test.sql
migrate "$TEST_URL2"
psql "$TEST_URL2" -v ON_ERROR_STOP=1 -q -f tests/db/backfill-assert.sql | tail -3
