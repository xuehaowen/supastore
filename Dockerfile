FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
RUN apk add --no-cache libc6-compat && corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /app
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/shipping/package.json ./packages/shipping/package.json
COPY patches ./patches
RUN pnpm install --frozen-lockfile
FROM deps AS demo-tools
COPY . .
ENV DEMO_SEED=true DISABLE_OUTBOUND_DELIVERY=true ENABLE_OUTBOX_WORKER=false
USER node
CMD ["node", "--import", "tsx", "scripts/seed-demo.ts"]
FROM deps AS backend-builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 STANDALONE=true NODE_ENV=production DATABASE_URL=postgresql://build:build@127.0.0.1:1/build_only BETTER_AUTH_URL=http://localhost:3000
RUN BETTER_AUTH_SECRET=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))") node scripts/backend.mjs build
RUN mkdir -p /app/apps/backend/public
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS backend
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=256 PORT=3000 HOSTNAME=0.0.0.0 SERVICE_ROLE=backend ENABLE_OUTBOX_WORKER=true
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=backend-builder --chown=nextjs:nodejs /app/apps/backend/.next/standalone ./
COPY --from=backend-builder --chown=nextjs:nodejs /app/apps/backend/.next/static ./apps/backend/.next/static
COPY --from=backend-builder --chown=nextjs:nodejs /app/apps/backend/public ./apps/backend/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/backend/server.js"]
FROM deps AS storefront-builder
COPY . .
ARG BACKEND_URL=http://backend:3000
ARG NEXT_PUBLIC_ANALYTICS_ENDPOINT=
ENV NEXT_TELEMETRY_DISABLED=1 STANDALONE=true NODE_ENV=production BACKEND_URL=$BACKEND_URL
ENV NEXT_PUBLIC_ANALYTICS_ENDPOINT=$NEXT_PUBLIC_ANALYTICS_ENDPOINT
RUN node node_modules/next/dist/bin/next build apps/storefront
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS storefront
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=256 PORT=3000 HOSTNAME=0.0.0.0 BACKEND_URL=http://backend:3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=storefront-builder --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=storefront-builder --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "Promise.all(['/en','/api/health/ready'].map(p=>fetch('http://127.0.0.1:3000'+p))).then(rs=>process.exit(rs.every(r=>r.ok)?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/storefront/server.js"]
FROM deps AS migration-builder
COPY scripts/migrate.mjs scripts/runtime-role.mjs scripts/build-migrations.mjs ./scripts/
RUN node scripts/build-migrations.mjs
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS migrations
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=migration-builder --chown=nextjs:nodejs /app/migrate.mjs ./migrate.mjs
COPY --chown=nextjs:nodejs apps/backend/src/infrastructure/db/migrations ./apps/backend/src/infrastructure/db/migrations
USER nextjs
CMD ["node", "migrate.mjs"]
