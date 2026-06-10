# .dockerignore pattern:
# node_modules
# npm-debug.log
# .git
# .env

FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port 4000
EXPOSE 4000

# Start the application
CMD ["node", "src/index.js"]
