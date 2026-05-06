#!/bin/bash
# Auto-initialize DAON database schema when Postgres creates a fresh volume.
# Postgres runs scripts in /docker-entrypoint-initdb.d/ alphabetically on first init only.
set -e

echo "=== DAON: Initializing database schema ==="

# Load base schema
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /docker-entrypoint-initdb.d/schema.sql

# Run migrations in order
for f in /docker-entrypoint-initdb.d/migrations/*.sql; do
  if [ -f "$f" ]; then
    echo "=== Running migration: $(basename "$f") ==="
    psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
  fi
done

echo "=== DAON: Database schema initialized ==="
