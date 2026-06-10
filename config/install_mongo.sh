#!/bin/bash
set -e

echo "=== Installing MongoDB 7.0 ==="
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

echo "=== Starting MongoDB ==="
sudo systemctl daemon-reload
sudo systemctl enable mongod
sudo systemctl start mongod

echo "=== Waiting for MongoDB to start ==="
for i in {1..15}; do
  if pgrep -x "mongod" > /dev/null; then
    echo "MongoDB is running."
    break
  fi
  echo "Waiting..."
  sleep 2
done

# Wait extra seconds for socket connection
sleep 5

echo "=== Creating database and users ==="
mongosh --eval '
db.getSiblingDB("admin").createUser({
  user: "admin",
  pwd: "adminpassword123",
  roles: [ { role: "root", db: "admin" } ]
});
db.getSiblingDB("rentio").createUser({
  user: "rentio_admin",
  pwd: "rentiopassword123",
  roles: [ { role: "dbOwner", db: "rentio" } ]
});
db.getSiblingDB("rentio").createCollection("init");
'
echo "=== MongoDB Setup Completed successfully ==="
