#!/bin/bash
set -e
sudo apt-get update
sudo apt-get install -y gnupg software-properties-common curl unzip awscli
sudo rm -f /usr/share/keyrings/hashicorp-archive-keyring.gpg
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com jammy main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update
sudo apt-get install -y terraform
