# syntax=docker/dockerfile:1.7
#
# packages/backend — hardened multi-stage Node image.

ARG NODE_VERSION=20

# ─── Development stage (used by docker-compose.yml hot-reload) ──────────────
FROM node:${NODE_VERSION}-alpine AS development

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
FROM node:${NODE_VERSION}-alpine AS build

ARG NODE_VERSION
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

WORKDIR /usr/src/app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts

COPY . .
RUN npm run build

# ─── Runner stage — minimal, non-root, healthchecked ────────────────────────
FROM node:${NODE_VERSION}-alpine AS production

ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

LABEL org.opencontainers.image.title="Traqora Backend"
LABEL org.opencontainers.image.description="Traqora backend API server"
LABEL org.opencontainers.image.vendor="Traqora"
LABEL org.opencontainers.image.version=${VERSION}
LABEL org.opencontainers.image.revision=${VCS_REF}
LABEL org.opencontainers.image.created=${BUILD_DATE}
LABEL org.opencontainers.image.source="https://github.com/anomalyco/traqora"
LABEL org.opencontainers.image.ref.name=${VERSION}
LABEL org.opencontainers.image.licenses="MIT"

RUN addgroup -g 1001 -S traqora \
    && adduser -S -G traqora -u 1001 traqora

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts \
    && npm cache clean --force

COPY --from=build --chown=traqora:traqora /usr/src/app/dist ./dist

USER traqora

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
