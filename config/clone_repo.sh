#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "
  sudo mkdir -p /var/www/code
  sudo chown -R ubuntu:ubuntu /var/www/code
  git clone https://joy.debnath:glpat-gQN_ez5Sfa_rEAcahS73Pm86MQp1OmxjCA.01.0y1p40jgs@gitlab.webskitters.com/react-projects/rentio2-ui.git /var/www/code
"
