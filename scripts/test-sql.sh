#!/usr/bin/env bash
set -e

# Disable MSYS path conversion on Windows for Docker paths
export MSYS_NO_PATHCONV=1

CONTAINER_NAME="cb-sqltest"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running."
  exit 1
fi

cleanup

echo "Starting Postgres 16 test container..."
docker run --rm -d --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:16

echo "Waiting for Postgres to become ready..."
ready=0
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "Postgres failed to start within 30 seconds."
  exit 1
fi

echo "Copying test and migration files..."
docker exec "$CONTAINER_NAME" mkdir -p /workspace/supabase/migrations /workspace/test/sql
docker cp supabase/migrations/20261031120000_corporate_menu_links.sql "$CONTAINER_NAME":/workspace/supabase/migrations/
docker cp supabase/migrations/20261031130000_corporate_menu_links_revoke_anon.sql "$CONTAINER_NAME":/workspace/supabase/migrations/
docker cp supabase/migrations/20261101090000_add_corporativo_plan.sql "$CONTAINER_NAME":/workspace/supabase/migrations/
docker cp supabase/migrations/20261101100000_menu_link_limits.sql "$CONTAINER_NAME":/workspace/supabase/migrations/
docker cp test/sql/corporate_menu_links.test.sql "$CONTAINER_NAME":/workspace/test/sql/

echo "Executing test suite..."
docker exec -w /workspace -i "$CONTAINER_NAME" psql -U postgres -v ON_ERROR_STOP=1 -f test/sql/corporate_menu_links.test.sql

echo "SQL test suite completed successfully."
