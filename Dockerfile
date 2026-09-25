# SkillSwap Production Dockerfile v2.0 - Clean Build (No .env Dependency)
FROM node:20-alpine AS base

WORKDIR /app

# Install build dependencies for native modules (sqlite3)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source code
COPY frontend/ ./frontend/
COPY backend/ ./backend/

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Seed database and start server
CMD ["sh", "-c", "node backend/database/seed.js && node backend/server.js"]
