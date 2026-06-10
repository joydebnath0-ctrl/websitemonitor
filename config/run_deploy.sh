#!/bin/bash
# Copy updated install_node_app.sh to target server
scp -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no /home/ubuntu/install_node_app.sh ubuntu@23.23.173.118:/home/ubuntu/install_node_app.sh

# Execute deployment on target server
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "chmod +x /home/ubuntu/install_node_app.sh && /home/ubuntu/install_node_app.sh"
