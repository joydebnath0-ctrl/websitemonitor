#!/bin/bash
set -e

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== Node and NPM versions ==="
node -v
npm -v

echo "=== Installing PM2 globally ==="
sudo npm install -g pm2

echo "=== Stopping root PM2 if running ==="
sudo pm2 kill || true

echo "=== Chowning /var/www/code to ubuntu:ubuntu ==="
sudo chown -R ubuntu:ubuntu /var/www/code

echo "=== Building and running the application as ubuntu user ==="
cd /var/www/code

# Set Node Options to increase heap limit for Next.js build
export NODE_OPTIONS="--max-old-space-size=2048"

npm install --legacy-peer-deps
npm run build

echo "=== Starting application with PM2 ==="
pm2 delete rentio-ui || true
pm2 start npm --name "rentio-ui" -- start

echo "=== PM2 List ==="
pm2 list

echo "=== Setup completed successfully ==="
