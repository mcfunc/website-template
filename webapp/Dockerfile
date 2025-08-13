# Single stage build with React build capability
FROM node:18-alpine

# Install dumb-init and curl for health checks
RUN apk add --no-cache dumb-init curl

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY --chown=nodejs:nodejs package*.json ./

# Install all dependencies (including dev deps for build)
RUN npm install

# Copy source code with proper ownership
COPY --chown=nodejs:nodejs . .

# Ensure nodejs user can write to /app and create build directory
RUN chown -R nodejs:nodejs /app && chmod -R 755 /app

# Switch to non-root user before building
USER nodejs

# Build the React application 
RUN npm run build

# Clean up dev dependencies to reduce image size
USER root
RUN npm prune --omit=dev
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]