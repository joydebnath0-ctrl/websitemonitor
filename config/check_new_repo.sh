#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "
  rm -rf /home/ubuntu/temp_repo
  git clone https://joy.debnath:glpat-gQN_ez5Sfa_rEAcahS73Pm86MQp1OmxjCA.01.0y1p40jgs@gitlab.webskitters.com/node/rentio.git /home/ubuntu/temp_repo
  ls -la /home/ubuntu/temp_repo
"
