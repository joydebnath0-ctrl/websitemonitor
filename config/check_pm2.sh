#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "sudo pm2 status; sudo pm2 show rentio-ui; sudo pm2 logs rentio-ui --lines 20 --no-colors"
