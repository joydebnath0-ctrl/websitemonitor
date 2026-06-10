#!/bin/bash
ssh -i /home/ubuntu/joy-test.pem -o StrictHostKeyChecking=no ubuntu@23.23.173.118 "
  sed -i 's/DB_HOST=192.168.2.16/DB_HOST=127.0.0.1/g' /var/www/code/.env
  sed -i 's/DB_DATABASE=ShareRoomDb/DB_DATABASE=rentio/g' /var/www/code/.env
  sed -i 's/DB_USERNAME=ShareRoomdeveloper/DB_USERNAME=rentio_admin/g' /var/www/code/.env
  sed -i 's/DB_PASSWORD=ShareRoomDbPWD@123/DB_PASSWORD=rentiopassword123/g' /var/www/code/.env
  cat /var/www/code/.env | grep -E 'DB_HOST|DB_PORT|DB_DATABASE|DB_USERNAME|DB_PASSWORD|PORT'
"
