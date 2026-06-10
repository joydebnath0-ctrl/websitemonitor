#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "
  sudo sed -i 's/port: 27017/port: 27117/g' /etc/mongod.conf
  sudo systemctl restart mongod
  sleep 3
  sudo systemctl status mongod --no-pager
  mongosh --port 27117 -u admin -p adminpassword123 --authenticationDatabase admin --eval 'db.getMongo().getDBs()'
"
