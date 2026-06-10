#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "
  sudo tee /etc/nginx/sites-available/rentio-ui << 'EOF'
server {
    listen 14037 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:1625;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  sudo systemctl restart nginx
"
