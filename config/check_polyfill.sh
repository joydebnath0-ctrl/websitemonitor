#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "curl -s http://localhost:14037 | grep -o 'window.crypto.randomUUID' || echo 'Polyfill NOT found in HTML'"
