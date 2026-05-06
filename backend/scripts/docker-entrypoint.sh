#!/bin/sh
set -e

# shared/src is volume-mounted so its source is always current, but dist/ was
# compiled at image-build time. Rebuild it here so any source changes are
# reflected before the backend starts.
echo "📦 Building shared package..."
cd /app/shared && npm run build
cd /app/backend

echo "🔄 Running database migrations..."
npm run migrate || echo "⚠️  Migration failed or no migrations to run"

echo "🌱 Running database seed..."
npm run seed || echo "⚠️  Seed failed or already seeded"

echo "🚀 Starting application..."
exec "$@"
