#!/bin/sh
# Docker entrypoint hook: runs once, when the data volume is empty. It prepares the main database and a
# second `<name>_test` database that the API e2e tests use, so they never touch development data.
# See infra/postgres/init-roles.sql.
set -eu

prepare() {
  psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" --dbname "$1" \
    -v dbname="$1" \
    -v migrator_password="$FLAGBOARD_MIGRATOR_PASSWORD" \
    -v app_password="$FLAGBOARD_APP_PASSWORD" \
    -f /opt/flagboard/init-roles.sql
}

TEST_DB="${POSTGRES_DB}_test"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE \"$TEST_DB\""

prepare "$POSTGRES_DB"
prepare "$TEST_DB"
