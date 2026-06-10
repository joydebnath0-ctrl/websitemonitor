#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@52.202.107.85 "grep -E '^(upload_max_filesize|post_max_size|memory_limit|max_execution_time|max_input_time)' /etc/php/8.1/apache2/php.ini"
