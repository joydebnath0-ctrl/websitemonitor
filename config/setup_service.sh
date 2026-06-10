#!/bin/bash
set -e

echo "=== Installing NPM packages ==="
cd /home/ubuntu/control-panel
npm install

echo "=== Creating systemd service file ==="
sudo tee /etc/systemd/system/control-panel.service > /dev/null <<'EOF'
[Unit]
Description=EC2 Deployment Control Panel
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/control-panel
ExecStart=/usr/bin/node server.js
Restart=always
User=root
Environment=PORT=80

[Install]
WantedBy=multi-user.target
EOF

echo "=== Starting control panel service ==="
sudo systemctl daemon-reload
sudo systemctl enable --now control-panel

echo "=== Service status ==="
sudo systemctl status control-panel --no-pager
