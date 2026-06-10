#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "curl -sI http://localhost:1625 || echo 'Failed to connect to local api port'"
