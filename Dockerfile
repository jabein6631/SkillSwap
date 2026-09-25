# SkillSwap Production Dockerfile - Node 20 Debian GLIBC Image
FROM node:20

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy application source code
COPY frontend/ ./frontend/
COPY backend/ ./backend/

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production

# Start server
CMD ["node", "backend/server.js"]
