#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "
  cd /var/www/code
  NODE_ENV=prod pm2 start shareroom.js --name 'rentio-api'
  sleep 3
  pm2 status
  pm2 show rentio-api
"
