#!/usr/bin/env bash
# Chạy migration + kiểm thử RLS trên PostgreSQL cục bộ.
# Dùng: DATABASE_ADMIN_URL=postgresql://postgres@localhost:5432/postgres scripts/test-db.sh
set -euo pipefail
ADMIN_URL="${DATABASE_ADMIN_URL:-postgresql://postgres@localhost:5432/postgres}"
DB="meetingai_test_$$"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "create database $DB"
trap 'psql "$ADMIN_URL" -q -c "drop database if exists $DB" >/dev/null' EXIT
TEST_URL="$(echo "$ADMIN_URL" | sed -E "s#/[^/?]+(\?|$)#/$DB\1#")"
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f tests/db/supabase-stub.sql 2>&1 | grep -v "wal_level\|HINT" || true
for f in supabase/migrations/*.sql; do
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f tests/db/rls-test.sql | tail -3
