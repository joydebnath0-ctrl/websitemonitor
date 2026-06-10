#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "grep -rn 'randomUUID' /home/ubuntu/temp_repo/ || echo 'No randomUUID found'"
