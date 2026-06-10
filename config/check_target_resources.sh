#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "free -h && echo === && uptime && echo === && ps aux --sort=-%cpu | head -n 10"
