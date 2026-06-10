#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "grep -rn '27017' /var/www/code/ --exclude-dir=.git --exclude-dir=node_modules || echo 'No 27017 found'"
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "grep -rn 'mongodb://' /var/www/code/ --exclude-dir=.git --exclude-dir=node_modules || echo 'No mongodb connection URI found'"
