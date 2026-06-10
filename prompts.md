# Conversation Prompts & Request History

Here is the log of requests and instructions executed in this deployment session:

1. **Error Diagnostics**: Getting error from login page.
2. **Error Debugging**: Client-side `TypeError: window.crypto.randomUUID is not a function` over HTTP (non-secure context) resolved using Nginx sub_filter injection.
3. **Infrastructure Clean up**: Destroyed old Terraform configurations.
4. **Target Server Check**: Query current active server connections.
5. **IP Re-association**: IP updated to management server `56.68.120.78`.
6. **Redeployment**: Redeployed previous infrastructure (Bastion, Elastic IP, Security Groups) using Terraform.
7. **Time Estimation**: Provided timeline estimation for deployment steps.
8. **MongoDB Configuration**: Configured MongoDB 7.0 database (port `27117`) and created admin and app users:
   - **Admin User**: `admin` / `adminpassword123`
   - **App User**: `rentio_admin` / `rentiopassword123`
9. **Codebase Migration**:
   - Cleared `/var/www/code/` directory.
   - Cloned new Gitlab backend repository `https://gitlab.webskitters.com/node/rentio.git`.
   - Setup `.env` configuration file pointing to local MongoDB on port `27117`.
   - Installed dependencies (`npm install --legacy-peer-deps`).
   - Started the application under PM2 as `rentio-api` on port `1625`.
   - Reconfigured Nginx reverse proxy routing port `14037` to `1625`.
10. **Database Restoration**:
    - Transferred database backup `stagingadmin.tar.gz` from the management server to the target server.
    - Extracted archive `/home/ubuntu/stagingadmin/` on the target host.
    - Restored dump into the `rentio` database on port `27117` via `mongorestore --gzip --drop`.
    - Verified all 59+ database collections successfully restored.
11. **Infrastructure Destruction**:
    - Ran `terraform destroy -auto-approve` on the management server.
    - Terminated all 29 AWS resources (including the EC2 target instance, VPC, subnets, and Elastic IP).
    - Verified termination by confirming target IP timeouts.
12. **LAMP & WordPress Deployment**:
    - Deployed new basic EC2 instance named `joy-test` (`52.202.107.85`) with public ingress for port 22 and 80.
    - Extracted the generated private key to [joy-test-wordpress.pem](file:///c:/Users/webskitters-usr/Documents/joy-test/joy-test/config/joy-test-wordpress.pem) for management access.
    - Wrote and executed an automated installation script `install_wordpress.sh` on the target host.
    - Installed Apache2, PHP, MySQL Server, and WP-CLI.
    - Configured a fresh WordPress site with title "RentWizz WordPress" and admin credentials:
      - **Username**: `joy-admin`
      - **Password**: `joy@123`
    - Verified successful login to the WordPress Admin dashboard at `http://52.202.107.85/wp-admin/`.
13. **WordPress Plugin Installation**:
    - Installed and activated the **"All-in-One WP Migration and Backup"** plugin on the EC2 instance using WP-CLI.
    - Verified that the plugin is active via a browser agent check on `http://52.202.107.85/wp-admin/plugins.php`.
14. **Permissions Fix**:
    - Resolved file creation permission errors (such as the inability to write to `ai1wm-backups` or plugins storage folders) by recursively changing ownership of all files and folders in `/var/www/html/` to `www-data:www-data`.
    - Verified that all permission error alerts at the top of the WordPress Plugins page disappeared after the fix.
15. **PHP Upload Limit Increase**:
    - Increased host upload limits to **2 GB** by modifying `/etc/php/8.1/apache2/php.ini` configuration rules:
      - `upload_max_filesize = 2048M`
      - `post_max_size = 2048M`
      - `memory_limit = 512M`
      - `max_execution_time = 600`
      - `max_input_time = 600`
    - Restarted the Apache web server (`sudo systemctl restart apache2`).
    - Verified that the maximum upload file size displays as **2 GB** on the WordPress All-in-One WP Migration import dashboard page.
16. **WordPress Codebase Deletion**:
    - Deleted the entire WordPress codebase (source files, uploads, and media folders) from `/var/www/html/` on the target server.
    - Verified that `/var/www/html/` is completely empty.
17. **EC2 Deployment Dashboard**:
    - Built a premium web control panel served from port 80 on the management host (`56.68.120.78`).
    - Handled dynamic config generation, multi-instance workspaces, process spawning, and real-time Server-Sent Events (SSE) log streaming.
    - Created a sleek dark-mode UI with form selects (Region, Instance Type, AMI mapping, Disk Size, Open Ports), active instances status cards, and a scrolling log terminal.
    - Verified page loading and interface controls in the browser.







