#!/bin/sh
# Apply migrations over the direct (non-pooled) connection, then start the server.
set -eu

if [ -z "${DIRECT_URL:-}" ]; then
  echo "DIRECT_URL is not set; refusing to start (migrations need the direct connection)." >&2
  exit 1
fi

echo "[entrypoint] prisma migrate deploy"
DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma

echo "[entrypoint] starting server on :${PORT:-3000}"
exec node dist/main.js
