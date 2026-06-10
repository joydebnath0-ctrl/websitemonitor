#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "pwd && whoami && ls -ld /home/ubuntu/stagingadmin && ls -l /home/ubuntu/stagingadmin | head -n 5"
