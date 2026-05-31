# syntax=docker/dockerfile:1.7
#
# packages/backend — hardened multi-stage Node image (issue #162).
#
# Mirrors the hardening already applied to packages/client/Dockerfile:
#   - Multi-stage build to drop dev deps and build toolchain from the
#     final image
#   - Non-root runtime user with a fixed UID
#   - `npm ci` in build stage (deterministic from package-lock.json)
#   - `--ignore-scripts` on install so npm lifecycle scripts can't
#     execute untrusted code while the build is laid down
#   - `--omit=dev` in the runner stage so devDependencies don't ship
#   - HEALTHCHECK for Docker / k8s liveness probes
#   - Slim alpine base, pinned to a major (use a digest in production
#     deploys when the build pipeline supports it).

# ─── Development stage (used by docker-compose.yml hot-reload) ──────────────
FROM node:20-alpine AS development

WORKDIR /usr/src/app

# Build tools required for native modules (sqlite3, bcrypt-style libs).
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .

EXPOSE 3001
ENV NODE_ENV=development

CMD ["npm", "run", "dev"]

# ─── Build stage — install + compile TypeScript ─────────────────────────────
FROM node:20-alpine AS build

WORKDIR /usr/src/app

RUN apk add --no-cache python3 make g++

# Reproducible install from package-lock.json. --ignore-scripts blocks
# any untrusted lifecycle scripts during install; the explicit `npm run
# build` below executes only the scripts we control.
COPY package*.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts

COPY . .
RUN npm run build

# ─── Runner stage — minimal, non-root, healthchecked ────────────────────────
FROM node:20-alpine AS production

# Non-root runtime user with a fixed UID for reproducibility across base
# image rebuilds.
RUN addgroup -g 1001 -S traqora \
    && adduser -S -G traqora -u 1001 traqora

WORKDIR /usr/src/app

# Production dependencies only — no dev toolchain on the runtime image.
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts \
    && npm cache clean --force

# Built artefacts owned by the runtime user so the container can run
# read-only-root-filesystem deployments down the road.
COPY --from=build --chown=traqora:traqora /usr/src/app/dist ./dist

USER traqora

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
