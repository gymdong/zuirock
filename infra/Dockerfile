# syntax=docker/dockerfile:1
# Single image: NestJS server + Expo web export (/app/public/web) + admin build (/app/public/admin).
# No secrets are baked in; only PUBLIC_ORIGIN is needed at build time (Expo reads it for app.config.ts).

# ---------- build ----------
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Build-time public origin (Render: set as an env var / Docker build arg named PUBLIC_ORIGIN).
ARG PUBLIC_ORIGIN=https://zuirock.onrender.com
ENV PUBLIC_ORIGIN=$PUBLIC_ORIGIN
ENV CI=1 EXPO_NO_TELEMETRY=1 NODE_OPTIONS=--max-old-space-size=1536

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY content ./content
RUN pnpm install --frozen-lockfile

# prisma generate needs placeholder URLs only; nothing connects at build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build DIRECT_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @zuirock/server exec prisma generate \
  && pnpm --filter @zuirock/shared --filter @zuirock/game-rules --filter @zuirock/server run build
RUN pnpm --filter @zuirock/mobile run export:web
RUN pnpm --filter @zuirock/admin run build

# Production dependency set for the server only (hoisted linker).
RUN pnpm --filter @zuirock/server deploy --prod --legacy /out/server \
  && cd /out/server && npm install --no-save --no-audit --no-fund prisma@6.19.3 \
  && rm -rf node_modules/.prisma && cp -r /repo/node_modules/.prisma node_modules/.prisma

# ---------- runtime ----------
FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/server/ ./
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/prisma ./prisma
COPY --from=build /repo/apps/server/config ./config
COPY --from=build /repo/apps/mobile/dist ./public/web
COPY --from=build /repo/apps/admin/dist ./public/admin
COPY infra/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]
