# syntax=docker/dockerfile:1.7
#
# packages/client — hardened multi-stage Next.js production image.
#
# Issue #162. Adds: non-root runtime user, HEALTHCHECK, --ignore-scripts
# during install (no untrusted lifecycle scripts on `npm install`),
# `npm ci` in the build stage for reproducible installs, and a final
# runner stage that drops every dev dependency from disk.

# ─── Development stage (used by docker-compose.yml hot-reload) ──────────────
FROM node:20-alpine AS development

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .

EXPOSE 3000
ENV NODE_ENV=development

CMD ["npm", "run", "dev"]


# ─── Build stage — install + next build ────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /usr/src/app

# Reproducible install from package-lock.json. --legacy-peer-deps matches
# the dev install for parity. --ignore-scripts blocks any untrusted
# lifecycle scripts during install; the Next.js build below runs the
# scripts we control.
COPY package*.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts

COPY . .
RUN npm run build


# ─── Runner stage — minimal, non-root, healthchecked ───────────────────────
FROM node:20-alpine AS production

# Non-root runtime user (issue #162). Node 20-alpine ships with a `node`
# user but it isn't reliably guaranteed across base-image rebuilds, so we
# create a dedicated group/user with a fixed UID for reproducibility.
RUN addgroup -g 1001 -S nextjs \
    && adduser -S -G nextjs -u 1001 nextjs

WORKDIR /usr/src/app

# Production dependencies only — no dev dependencies on the runtime image.
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts \
    && npm cache clean --force

# Built artefacts and the runtime config Next.js needs.
COPY --from=build --chown=nextjs:nextjs /usr/src/app/next.config.mjs ./next.config.mjs
COPY --from=build --chown=nextjs:nextjs /usr/src/app/public ./public
COPY --from=build --chown=nextjs:nextjs /usr/src/app/.next ./.next

USER nextjs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Liveness probe used by Docker / Kubernetes. `wget --spider` exits 0 on
# 2xx/3xx, so this only marks the container unhealthy on a hard
# next-start failure.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["npm", "start"]
