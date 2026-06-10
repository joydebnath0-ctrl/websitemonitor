#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "mongosh --port 27117 -u rentio_admin -p rentiopassword123 --authenticationDatabase rentio --eval \"db.getSiblingDB('rentio').getCollectionNames()\""
