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

# Production stage
FROM node:20-alpine AS production

WORKDIR /usr/src/app

COPY package*.json ./
# Only install production dependencies
RUN npm ci --only=production

COPY --from=development /usr/src/app/dist ./dist

EXPOSE 3001

CMD ["npm", "start"]
