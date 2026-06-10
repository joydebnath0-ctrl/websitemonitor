#!/bin/bash
set -e

echo "=== Installing Nginx ==="
sudo apt-get update
sudo apt-get install -y nginx

echo "=== Creating Nginx Configuration ==="
sudo tee /etc/nginx/sites-available/rentio-ui << 'EOF'
server {
    listen 14037 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:14038;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable compression from backend so sub_filter works
        proxy_set_header Accept-Encoding "";

        # Inject polyfill for window.crypto.randomUUID
        sub_filter '<head>' '<head><script>if(!window.crypto){window.crypto={};}if(!window.crypto.randomUUID){window.crypto.randomUUID=function(){return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c=="x"?r:(r&0x3|0x8);return v.toString(16);});};}</script>';
        sub_filter_once on;
    }
}
EOF

# Enable the config and disable the default site
sudo ln -sf /etc/nginx/sites-available/rentio-ui /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo "=== Stopping PM2 App & Freeing Port 14037 ==="
# Stop both root and ubuntu PM2 instances if they exist
pm2 delete rentio-ui || true
sudo pm2 delete rentio-ui || true
# Kill any remaining process holding port 14037
sudo fuser -k 14037/tcp || true

echo "=== Restarting Nginx ==="
sudo systemctl restart nginx

echo "=== Starting PM2 App on Port 14038 ==="
cd /var/www/code
pm2 start npm --name "rentio-ui" -- start -- -p 14038

echo "=== PM2 Status ==="
pm2 list

echo "=== Setup completed successfully ==="
