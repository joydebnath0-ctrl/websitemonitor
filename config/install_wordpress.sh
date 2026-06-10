#!/bin/bash
set -e

echo "=== Updating Package Cache ==="
sudo apt-get update -y

echo "=== Installing Apache, PHP, and Extensions ==="
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y apache2 php php-mysql php-curl php-gd php-mbstring php-xml php-xmlrpc php-soap php-intl php-zip wget curl

echo "=== Installing MySQL Server ==="
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server

echo "=== Starting Services ==="
sudo systemctl enable --now apache2
sudo systemctl enable --now mysql

echo "=== Configuring MySQL Database ==="
sudo mysql -e "CREATE DATABASE IF NOT EXISTS wordpress DEFAULT CHARACTER SET utf8 COLLATE utf8_unicode_ci;"
sudo mysql -e "CREATE USER IF NOT EXISTS 'wordpress_user'@'localhost' IDENTIFIED BY 'wppassword123';"
sudo mysql -e "GRANT ALL PRIVILEGES ON wordpress.* TO 'wordpress_user'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"

echo "=== Downloading and Installing WP-CLI ==="
curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar
sudo mv wp-cli.phar /usr/local/bin/wp

echo "=== Preparing Web Directory ==="
sudo rm -rf /var/www/html/*
cd /var/www/html

echo "=== Downloading WordPress ==="
sudo wp core download --allow-root

echo "=== Configuring WordPress ==="
sudo wp config create --dbname=wordpress --dbuser=wordpress_user --dbpass=wppassword123 --allow-root

echo "=== Running WordPress Installation ==="
# Retrieve dynamic public IP
PUBLIC_IP=$(curl -s --timeout 5 http://169.254.169.254/latest/meta-data/public-ipv4 || curl -s --timeout 5 ifconfig.me || echo "localhost")
echo "WordPress dynamic URL: http://$PUBLIC_IP"
sudo wp core install --url="http://$PUBLIC_IP" --title="RentWizz WordPress" --admin_user="joy-admin" --admin_password="joy@123" --admin_email="admin@rentwizz.com" --allow-root

echo "=== Configuring File Permissions ==="
sudo chown -R www-data:www-data /var/www/html/
sudo find /var/www/html/ -type d -exec chmod 755 {} \;
sudo find /var/www/html/ -type f -exec chmod 644 {} \;

echo "=== Restarting Services ==="
sudo systemctl restart apache2
sudo systemctl restart mysql

echo "=== Installation Finished Successfully ==="
