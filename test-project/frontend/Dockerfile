# .dockerignore pattern:
# node_modules
# build
# dist
# .git
# .env

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build static assets
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx configuration or build assets
COPY --from=builder /app/build /usr/share/nginx/html

# Configure nginx to listen on port 3000 instead of default 80
RUN sed -i 's/listen       80;/listen       3000;/g' /etc/nginx/conf.d/default.conf

# Expose port 3000
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
