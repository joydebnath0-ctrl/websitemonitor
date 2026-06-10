#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "
  cd /var/www/code
  npm install --legacy-peer-deps
"
