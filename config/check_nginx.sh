#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "which nginx && systemctl status nginx || echo 'Nginx not running/installed'"
