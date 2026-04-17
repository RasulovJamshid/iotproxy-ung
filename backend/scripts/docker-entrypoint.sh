#!/bin/sh
set -e

echo "🔄 Running database migrations..."
npm run migrate || echo "⚠️  Migration failed or no migrations to run"

echo "🌱 Running database seed..."
npm run seed || echo "⚠️  Seed failed or already seeded"

echo "🚀 Starting application..."
exec "$@"
