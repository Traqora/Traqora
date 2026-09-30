# syntax=docker/dockerfile:1.7
#
# packages/client — hardened multi-stage Next.js production image.

ARG NODE_VERSION=20

# ─── Development stage (used by docker-compose.yml hot-reload) ──────────────
FROM node:${NODE_VERSION}-alpine AS development

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .

EXPOSE 3000
ENV NODE_ENV=development

CMD ["npm", "run", "dev"]


# ─── Build stage — install + next build ────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS build

ARG NODE_VERSION
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts

COPY . .
RUN npm run build


# ─── Runner stage — minimal, non-root, healthchecked ───────────────────────
FROM node:${NODE_VERSION}-alpine AS production

ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

LABEL org.opencontainers.image.title="Traqora Client"
LABEL org.opencontainers.image.description="Traqora Next.js frontend"
LABEL org.opencontainers.image.vendor="Traqora"
LABEL org.opencontainers.image.version=${VERSION}
LABEL org.opencontainers.image.revision=${VCS_REF}
LABEL org.opencontainers.image.created=${BUILD_DATE}
LABEL org.opencontainers.image.source="https://github.com/anomalyco/traqora"
LABEL org.opencontainers.image.ref.name=${VERSION}
LABEL org.opencontainers.image.licenses="MIT"

RUN addgroup -g 1001 -S nextjs \
    && adduser -S -G nextjs -u 1001 nextjs

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts \
    && npm cache clean --force

COPY --from=build --chown=nextjs:nextjs /usr/src/app/next.config.mjs ./next.config.mjs
COPY --from=build --chown=nextjs:nextjs /usr/src/app/public ./public
COPY --from=build --chown=nextjs:nextjs /usr/src/app/.next ./.next

USER nextjs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["npm", "start"]
