#!/bin/bash
set -e

# Connect to target server
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "
  echo '=== Stopping Old PM2 Process ==='
  pm2 delete rentio-ui || true
  
  echo '=== Cleaning /var/www/code ==='
  sudo rm -rf /var/www/code/*
  sudo rm -rf /var/www/code/.* || true

  echo '=== Cloning New Repository ==='
  git clone https://joy.debnath:glpat-gQN_ez5Sfa_rEAcahS73Pm86MQp1OmxjCA.01.0y1p40jgs@gitlab.webskitters.com/node/rentio.git /var/www/code

  echo '=== Chowning /var/www/code ==='
  sudo chown -R ubuntu:ubuntu /var/www/code

  echo '=== Listing Cloned Files ==='
  ls -la /var/www/code
"
