# Development stage
FROM node:20-alpine AS development

WORKDIR /usr/src/app

RUN npm install -g pnpm

COPY package*.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .

# Next.js dev server port
EXPOSE 3000

# Set environment to development
ENV NODE_ENV=development

# Run next dev for hot-reloading
CMD ["npm", "run", "dev"]

# Production stage
FROM node:20-alpine AS production

WORKDIR /usr/src/app

RUN npm install -g pnpm

COPY package*.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .
RUN pnpm run build

# Only copy necessary files for production
FROM node:20-alpine AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=production /usr/src/app/next.config.mjs ./
COPY --from=production /usr/src/app/public ./public
COPY --from=production /usr/src/app/.next ./.next
COPY --from=production /usr/src/app/node_modules ./node_modules
COPY --from=production /usr/src/app/package.json ./package.json

EXPOSE 3000

CMD ["npm", "start"]
