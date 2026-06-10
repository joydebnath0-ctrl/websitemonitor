#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "mongosh -u admin -p adminpassword123 --authenticationDatabase admin --eval 'db.getMongo().getDBs()'"
