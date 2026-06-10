#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "cd /home/ubuntu && mongorestore --gzip --port 27117 -u admin -p adminpassword123 --authenticationDatabase admin -d rentio --drop stagingadmin"
