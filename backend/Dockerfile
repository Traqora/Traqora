# Development stage
FROM node:20-alpine AS development

WORKDIR /usr/src/app

# Install build dependencies for native modules (like sqlite3)
RUN apk add --no-cache python3 make g++

# Install dependencies separately for better caching
COPY package*.json ./
RUN npm install

# Copy source code (though it will be overridden by volume in docker-compose)
COPY . .

# Expose the API port
EXPOSE 3001

# Run the development server with hot-reload
CMD ["npm", "run", "dev"]

# Build stage
FROM node:20-alpine AS build

WORKDIR /usr/src/app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Security: Add a non-root user
RUN addgroup -S traqora && adduser -S traqora -G traqora

WORKDIR /usr/src/app

COPY package*.json ./
# Use npm ci for clean, reproducible production installs
RUN npm ci --only=production && npm cache clean --force

# Copy only the compiled output and necessary assets
COPY --from=build /usr/src/app/dist ./dist

# Set production environment
ENV NODE_ENV=production

# Switch to non-root user for security
USER traqora

EXPOSE 3001

# Healthcheck for Docker/K8s
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]

