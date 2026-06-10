#!/bin/bash
# Copy setup_nginx_proxy.sh to target server
scp -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no /home/ubuntu/setup_nginx_proxy.sh ubuntu@23.23.173.118:/home/ubuntu/setup_nginx_proxy.sh

# Run setup_nginx_proxy.sh on target server
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "chmod +x /home/ubuntu/setup_nginx_proxy.sh && /home/ubuntu/setup_nginx_proxy.sh"
