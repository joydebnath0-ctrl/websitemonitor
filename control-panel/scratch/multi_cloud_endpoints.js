// ===== AZURE & GCP MULTI-CLOUD INTEGRATION =====

const AZURE_DEPLOYMENTS_DIR = path.join(BASE_DIR, 'azure-deployments');
const AZURE_VM_DEPLOYMENTS_DIR = path.join(AZURE_DEPLOYMENTS_DIR, 'vms');
const AZURE_VNET_DEPLOYMENTS_DIR = path.join(AZURE_DEPLOYMENTS_DIR, 'vnets');
const AZURE_BLOB_DEPLOYMENTS_DIR = path.join(AZURE_DEPLOYMENTS_DIR, 'blobs');
const AZURE_SQL_DEPLOYMENTS_DIR = path.join(AZURE_DEPLOYMENTS_DIR, 'sql');

const GCP_DEPLOYMENTS_DIR = path.join(BASE_DIR, 'gcp-deployments');
const GCP_VM_DEPLOYMENTS_DIR = path.join(GCP_DEPLOYMENTS_DIR, 'vms');
const GCP_VPC_DEPLOYMENTS_DIR = path.join(GCP_DEPLOYMENTS_DIR, 'vpcs');
const GCP_GCS_DEPLOYMENTS_DIR = path.join(GCP_DEPLOYMENTS_DIR, 'buckets');
const GCP_SQL_DEPLOYMENTS_DIR = path.join(GCP_DEPLOYMENTS_DIR, 'sql');

const AZURE_DB_FILE = path.join(BASE_DIR, 'azure.json');
const GCP_DB_FILE = path.join(BASE_DIR, 'gcp.json');

[
  AZURE_DEPLOYMENTS_DIR, AZURE_VM_DEPLOYMENTS_DIR, AZURE_VNET_DEPLOYMENTS_DIR, AZURE_BLOB_DEPLOYMENTS_DIR, AZURE_SQL_DEPLOYMENTS_DIR,
  GCP_DEPLOYMENTS_DIR, GCP_VM_DEPLOYMENTS_DIR, GCP_VPC_DEPLOYMENTS_DIR, GCP_GCS_DEPLOYMENTS_DIR, GCP_SQL_DEPLOYMENTS_DIR
].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(AZURE_DB_FILE)) {
  fs.writeFileSync(AZURE_DB_FILE, JSON.stringify({ vms: [], vnets: [], blobs: [], sqls: [] }, null, 2));
}
if (!fs.existsSync(GCP_DB_FILE)) {
  fs.writeFileSync(GCP_DB_FILE, JSON.stringify({ vms: [], vpcs: [], buckets: [], sqls: [] }, null, 2));
}

function readAzureDB() {
  try { return JSON.parse(fs.readFileSync(AZURE_DB_FILE, 'utf8')); } catch (e) { return { vms: [], vnets: [], blobs: [], sqls: [] }; }
}
function writeAzureDB(data) { fs.writeFileSync(AZURE_DB_FILE, JSON.stringify(data, null, 2)); }

function readGcpDB() {
  try { return JSON.parse(fs.readFileSync(GCP_DB_FILE, 'utf8')); } catch (e) { return { vms: [], vpcs: [], buckets: [], sqls: [] }; }
}
function writeGcpDB(data) { fs.writeFileSync(GCP_DB_FILE, JSON.stringify(data, null, 2)); }

// ----- AZURE TERRAFORM TEMPLATES -----

function getAzureVmTemplate() {
  return `terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "vm_rg" {
  name     = "\${var.name}-rg"
  location = var.region
}

resource "azurerm_virtual_network" "vm_vnet" {
  name                = "\${var.name}-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.vm_rg.location
  resource_group_name = azurerm_resource_group.vm_rg.name
}

resource "azurerm_subnet" "vm_subnet" {
  name                 = "\${var.name}-subnet"
  resource_group_name  = azurerm_resource_group.vm_rg.name
  virtual_network_name = azurerm_virtual_network.vm_vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_public_ip" "vm_pip" {
  name                = "\${var.name}-pip"
  location            = azurerm_resource_group.vm_rg.location
  resource_group_name = azurerm_resource_group.vm_rg.name
  allocation_method   = "Dynamic"
}

resource "azurerm_network_interface" "vm_nic" {
  name                = "\${var.name}-nic"
  location            = azurerm_resource_group.vm_rg.location
  resource_group_name = azurerm_resource_group.vm_rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.vm_subnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.vm_pip.id
  }
}

resource "azurerm_linux_virtual_machine" "vm" {
  name                            = var.name
  resource_group_name             = azurerm_resource_group.vm_rg.name
  location                        = azurerm_resource_group.vm_rg.location
  size                            = var.size
  admin_username                  = var.admin_username
  admin_password                  = var.admin_password
  disable_password_authentication = false
  network_interface_ids           = [azurerm_network_interface.vm_nic.id]

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }
}

variable "name" { type = string }
variable "region" { type = string }
variable "size" { type = string }
variable "admin_username" { type = string }
variable "admin_password" { type = string }

output "public_ip" {
  value = azurerm_public_ip.vm_pip.ip_address
}
`;
}

function getAzureVnetTemplate() {
  return `terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "vnet_rg" {
  name     = "\${var.name}-rg"
  location = var.region
}

resource "azurerm_virtual_network" "vnet" {
  name                = var.name
  address_space       = [var.cidr]
  location            = azurerm_resource_group.vnet_rg.location
  resource_group_name = azurerm_resource_group.vnet_rg.name
}

variable "name" { type = string }
variable "region" { type = string }
variable "cidr" { type = string }

output "vnet_id" {
  value = azurerm_virtual_network.vnet.id
}
`;
}

function getAzureBlobTemplate() {
  return `terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "blob_rg" {
  name     = "\${var.name}-rg"
  location = var.region
}

resource "azurerm_storage_account" "sa" {
  name                     = var.name
  resource_group_name      = azurerm_resource_group.blob_rg.name
  location                 = azurerm_resource_group.blob_rg.location
  account_tier             = "Standard"
  account_replication_type = var.replication
}

variable "name" { type = string }
variable "region" { type = string }
variable "replication" { type = string }

output "primary_blob_endpoint" {
  value = azurerm_storage_account.sa.primary_blob_endpoint
}
`;
}

function getAzureSqlTemplate() {
  return `terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "sql_rg" {
  name     = "\${var.server_name}-rg"
  location = var.region
}

resource "azurerm_mssql_server" "sqlserver" {
  name                         = var.server_name
  resource_group_name          = azurerm_resource_group.sql_rg.name
  location                     = azurerm_resource_group.sql_rg.location
  version                      = "12.0"
  administrator_login          = var.admin_username
  administrator_login_password = var.admin_password
}

resource "azurerm_mssql_database" "sqldb" {
  name         = var.db_name
  server_id    = azurerm_mssql_server.sqlserver.id
  collation    = "SQL_Latin1_General_CP1_CI_AS"
  license_type = "BasePrice"
  max_size_gb  = 2
  sku_name     = var.sku
}

variable "server_name" { type = string }
variable "db_name" { type = string }
variable "region" { type = string }
variable "admin_username" { type = string }
variable "admin_password" { type = string }
variable "sku" { type = string }

output "sql_server_fqdn" {
  value = azurerm_mssql_server.sqlserver.fully_qualified_domain_name
}
`;
}

// ----- GCP TERRAFORM TEMPLATES -----

function getGcpVmTemplate() {
  return `terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

resource "google_compute_instance" "vm" {
  name         = var.name
  machine_type = var.machine_type
  zone         = var.zone

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
    }
  }

  network_interface {
    network = "default"
    access_config {
      // Ephemeral public IP
    }
  }
}

variable "project" { type = string }
variable "name" { type = string }
variable "machine_type" { type = string }
variable "region" { type = string }
variable "zone" { type = string }

output "public_ip" {
  value = google_compute_instance.vm.network_interface[0].access_config[0].nat_ip
}
`;
}

function getGcpVpcTemplate() {
  return `terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

resource "google_compute_network" "vpc" {
  name                    = var.name
  auto_create_subnetworks = true
}

variable "project" { type = string }
variable "name" { type = string }
variable "region" { type = string }

output "vpc_id" {
  value = google_compute_network.vpc.id
}
`;
}

function getGcpGcsTemplate() {
  return `terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project
}

resource "google_storage_bucket" "bucket" {
  name          = var.name
  location      = var.location
  storage_class = var.storage_class
  force_destroy = true
}

variable "project" { type = string }
variable "name" { type = string }
variable "location" { type = string }
variable "storage_class" { type = string }

output "bucket_url" {
  value = google_storage_bucket.bucket.url
}
`;
}

function getGcpSqlTemplate() {
  return `terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

resource "google_sql_database_instance" "instance" {
  name             = var.name
  database_version = var.database_version
  region           = var.region

  settings {
    tier = var.tier
  }
  deletion_protection = false
}

resource "google_sql_user" "root_user" {
  name     = "root"
  instance = google_sql_database_instance.instance.name
  password = var.root_password
}

variable "project" { type = string }
variable "name" { type = string }
variable "database_version" { type = string }
variable "root_password" { type = string }
variable "tier" { type = string }
variable "region" { type = string }

output "connection_name" {
  value = google_sql_database_instance.instance.connection_name
}
`;
}

// ----- AZURE API ENDPOINTS -----

app.get('/api/azure/vm', requirePermission('azure', 'read'), (req, res) => {
  res.json(readAzureDB().vms);
});

app.post('/api/azure/vm/preview', requirePermission('azure', 'write'), (req, res) => {
  res.json({
    mainTf: getAzureVmTemplate(),
    tfvars: JSON.stringify({
      name: req.body.name,
      region: req.body.region,
      size: req.body.size,
      admin_username: req.body.adminUsername,
      admin_password: req.body.adminPassword
    }, null, 2)
  });
});

app.post('/api/azure/vm/create', requirePermission('azure', 'write'), (req, res) => {
  const { name, size, region, adminUsername, adminPassword } = req.body;
  if (!name || !size || !region || !adminUsername || !adminPassword) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const db = readAzureDB();
  if (db.vms.find(v => v.name === name)) {
    return res.status(400).json({ error: `Azure VM "${name}" already exists` });
  }

  const targetDir = path.join(AZURE_VM_DEPLOYMENTS_DIR, name);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(path.join(targetDir, 'main.tf'), getAzureVmTemplate());
  const tfVars = { name, region, size, admin_username: adminUsername, admin_password: adminPassword };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newVm = {
    name,
    size,
    region,
    adminUsername,
    status: 'creating',
    publicIp: 'N/A',
    createdAt: new Date().toISOString()
  };
  db.vms.push(newVm);
  writeAzureDB(db);

  logHistory[name] = [];
  res.json({ message: 'Azure VM creation started', name });

  const execute = async () => {
    try {
      sendLog(name, `=== Initializing Terraform for Azure VM "${name}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, name);
      sendLog(name, `=== Applying Azure VM Terraform Plan for "${name}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, name);
      sendLog(name, `=== Fetching outputs for Azure VM "${name}" ===`);
      const outputs = await getOutput(targetDir);
      
      const currentDB = readAzureDB();
      const match = currentDB.vms.find(v => v.name === name);
      if (match) {
        match.status = 'active';
        match.publicIp = outputs.public_ip ? outputs.public_ip.value : 'N/A';
        writeAzureDB(currentDB);
      }
      sendLog(name, `=== Azure VM Successfully Created ===`);
    } catch (err) {
      sendLog(name, `=== Azure VM CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readAzureDB();
      const match = currentDB.vms.find(v => v.name === name);
      if (match) {
        match.status = 'failed';
        writeAzureDB(currentDB);
      }
    }
  };
  execute();
});

app.post('/api/azure/vm/destroy', requirePermission('azure', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readAzureDB();
  const match = db.vms.find(v => v.name === name);
  if (!match) return res.status(404).json({ error: 'Azure VM not found' });

  match.status = 'destroying';
  writeAzureDB(db);

  logHistory[name] = [];
  res.json({ message: 'Azure VM destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(AZURE_VM_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) {
            hasResources = true;
          }
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          sendLog(name, `=== Initializing Terraform for ${name} ===`);
          await runCmd('terraform', ['init', '-no-color'], targetDir, name);
        }
        sendLog(name, `=== Destroying Azure VM resource for ${name} ===`);
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name);
      } else {
        sendLog(name, `=== No resources found in state for Azure VM "${name}". Skipping Terraform execution. ===`);
      }

      sendLog(name, `=== Cleaning Deployment Files ===`);
      safeRmSync(targetDir);

      const currentDB = readAzureDB();
      currentDB.vms = currentDB.vms.filter(v => v.name !== name);
      writeAzureDB(currentDB);

      sendLog(name, `=== Azure VM DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== Azure VM DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readAzureDB();
      const match = currentDB.vms.find(v => v.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeAzureDB(currentDB);
      }
    }
  };
  execute();
});

// -- Azure VNet --
app.get('/api/azure/vnet', requirePermission('azure', 'read'), (req, res) => {
  res.json(readAzureDB().vnets);
});

app.post('/api/azure/vnet/preview', requirePermission('azure', 'write'), (req, res) => {
  res.json({
    mainTf: getAzureVnetTemplate(),
    tfvars: JSON.stringify({
      name: req.body.name,
      region: req.body.region,
      cidr: req.body.cidr
    }, null, 2)
  });
});

app.post('/api/azure/vnet/create', requirePermission('azure', 'write'), (req, res) => {
  const { name, region, cidr } = req.body;
  if (!name || !region || !cidr) return res.status(400).json({ error: 'Missing required parameters' });

  const db = readAzureDB();
  if (db.vnets.find(v => v.name === name)) return res.status(400).json({ error: `VNet "${name}" already exists` });

  const targetDir = path.join(AZURE_VNET_DEPLOYMENTS_DIR, name);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, 'main.tf'), getAzureVnetTemplate());
  const tfVars = { name, region, cidr };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newVnet = { name, region, cidr, status: 'creating', vnetId: 'N/A', createdAt: new Date().toISOString() };
  db.vnets.push(newVnet);
  writeAzureDB(db);

  logHistory[name] = [];
  res.json({ message: 'VNet creation started', name });

  const execute = async () => {
    try {
      sendLog(name, `=== Initializing Terraform for VNet "${name}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, name);
      sendLog(name, `=== Applying VNet Terraform Plan for "${name}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, name);
      const outputs = await getOutput(targetDir);
      
      const currentDB = readAzureDB();
      const match = currentDB.vnets.find(v => v.name === name);
      if (match) {
        match.status = 'active';
        match.vnetId = outputs.vnet_id ? outputs.vnet_id.value : 'N/A';
        writeAzureDB(currentDB);
      }
      sendLog(name, `=== VNet Successfully Created ===`);
    } catch (err) {
      sendLog(name, `=== VNet CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readAzureDB();
      const match = currentDB.vnets.find(v => v.name === name);
      if (match) {
        match.status = 'failed';
        writeAzureDB(currentDB);
      }
    }
  };
  execute();
});

app.post('/api/azure/vnet/destroy', requirePermission('azure', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readAzureDB();
  const match = db.vnets.find(v => v.name === name);
  if (!match) return res.status(404).json({ error: 'VNet not found' });

  match.status = 'destroying';
  writeAzureDB(db);

  logHistory[name] = [];
  res.json({ message: 'VNet destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(AZURE_VNET_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) hasResources = true;
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          await runCmd('terraform', ['init', '-no-color'], targetDir, name);
        }
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name);
      }
      safeRmSync(targetDir);

      const currentDB = readAzureDB();
      currentDB.vnets = currentDB.vnets.filter(v => v.name !== name);
      writeAzureDB(currentDB);
      sendLog(name, `=== VNet DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== VNet DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readAzureDB();
      const match = currentDB.vnets.find(v => v.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeAzureDB(currentDB);
      }
    }
  };
  execute();
});

// -- Azure Blob Storage --
app.get('/api/azure/blob', requirePermission('azure', 'read'), (req, res) => {
  res.json(readAzureDB().blobs);
});

app.post('/api/azure/blob/preview', requirePermission('azure', 'write'), (req, res) => {
  res.json({
    mainTf: getAzureBlobTemplate(),
    tfvars: JSON.stringify({
      name: req.body.name,
      region: req.body.region,
      replication: req.body.replication
    }, null, 2)
  });
});

app.post('/api/azure/blob/create', requirePermission('azure', 'write'), (req, res) => {
  const { name, region, replication } = req.body;
  if (!name || !region || !replication) return res.status(400).json({ error: 'Missing required parameters' });

  const db = readAzureDB();
  if (db.blobs.find(b => b.name === name)) return res.status(400).json({ error: `Storage Account "${name}" already exists` });

  const targetDir = path.join(AZURE_BLOB_DEPLOYMENTS_DIR, name);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, 'main.tf'), getAzureBlobTemplate());
  const tfVars = { name, region, replication };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newBlob = { name, region, replication, status: 'creating', primaryBlobEndpoint: 'N/A', createdAt: new Date().toISOString() };
  db.blobs.push(newBlob);
  writeAzureDB(db);

  logHistory[name] = [];
  res.json({ message: 'Storage Account creation started', name });

  const execute = async () => {
    try {
      sendLog(name, `=== Initializing Terraform for Storage Account "${name}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, name);
      sendLog(name, `=== Applying Storage Account Terraform Plan for "${name}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, name);
      const outputs = await getOutput(targetDir);
      
      const currentDB = readAzureDB();
      const match = currentDB.blobs.find(b => b.name === name);
      if (match) {
        match.status = 'active';
        match.primaryBlobEndpoint = outputs.primary_blob_endpoint ? outputs.primary_blob_endpoint.value : 'N/A';
        writeAzureDB(currentDB);
      }
      sendLog(name, `=== Storage Account Successfully Created ===`);
    } catch (err) {
      sendLog(name, `=== Storage Account CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readAzureDB();
      const match = currentDB.blobs.find(b => b.name === name);
      if (match) {
        match.status = 'failed';
        writeAzureDB(currentDB);
      }
    }
  };
  execute();
});

app.post('/api/azure/blob/destroy', requirePermission('azure', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readAzureDB();
  const match = db.blobs.find(b => b.name === name);
  if (!match) return res.status(404).json({ error: 'Storage Account not found' });

  match.status = 'destroying';
  writeAzureDB(db);

  logHistory[name] = [];
  res.json({ message: 'Storage Account destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(AZURE_BLOB_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) hasResources = true;
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          await runCmd('terraform', ['init', '-no-color'], targetDir, name);
        }
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name);
      }
      safeRmSync(targetDir);

      const currentDB = readAzureDB();
      currentDB.blobs = currentDB.blobs.filter(b => b.name !== name);
      writeAzureDB(currentDB);
      sendLog(name, `=== Storage Account DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== Storage Account DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readAzureDB();
      const match = currentDB.blobs.find(b => b.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeAzureDB(currentDB);
      }
    }
  };
  execute();
});

// -- Azure SQL --
app.get('/api/azure/sql', requirePermission('azure', 'read'), (req, res) => {
  res.json(readAzureDB().sqls);
});

app.post('/api/azure/sql/preview', requirePermission('azure', 'write'), (req, res) => {
  res.json({
    mainTf: getAzureSqlTemplate(),
    tfvars: JSON.stringify({
      server_name: req.body.serverName,
      db_name: req.body.dbName,
      admin_username: req.body.adminUsername,
      admin_password: req.body.adminPassword,
      sku: req.body.sku,
      region: req.body.region
    }, null, 2)
  });
});

app.post('/api/azure/sql/create', requirePermission('azure', 'write'), (req, res) => {
  const { serverName, dbName, adminUsername, adminPassword, sku, region } = req.body;
  if (!serverName || !dbName || !adminUsername || !adminPassword || !sku || !region) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const db = readAzureDB();
  if (db.sqls.find(s => s.serverName === serverName)) {
    return res.status(400).json({ error: `SQL Server "${serverName}" already exists` });
  }

  const targetDir = path.join(AZURE_SQL_DEPLOYMENTS_DIR, serverName);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, 'main.tf'), getAzureSqlTemplate());
  const tfVars = { server_name: serverName, db_name: dbName, admin_username: adminUsername, admin_password: adminPassword, sku, region };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newSql = {
    name: serverName,
    serverName,
    dbName,
    adminUsername,
    sku,
    region,
    status: 'creating',
    sqlServerFqdn: 'N/A',
    createdAt: new Date().toISOString()
  };
  db.sqls.push(newSql);
  writeAzureDB(db);

  logHistory[serverName] = [];
  res.json({ message: 'SQL Database creation started', name: serverName });

  const execute = async () => {
    try {
      sendLog(serverName, `=== Initializing Terraform for SQL Server "${serverName}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, serverName);
      sendLog(serverName, `=== Applying SQL Database Terraform Plan for "${serverName}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, serverName);
      const outputs = await getOutput(targetDir);
      
      const currentDB = readAzureDB();
      const match = currentDB.sqls.find(s => s.serverName === serverName);
      if (match) {
        match.status = 'active';
        match.sqlServerFqdn = outputs.sql_server_fqdn ? outputs.sql_server_fqdn.value : 'N/A';
        writeAzureDB(currentDB);
      }
      sendLog(serverName, `=== SQL Database Successfully Created ===`);
    } catch (err) {
      sendLog(serverName, `=== SQL Database CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readAzureDB();
      const match = currentDB.sqls.find(s => s.serverName === serverName);
      if (match) {
        match.status = 'failed';
        writeAzureDB(currentDB);
      }
    }
  };
  execute();
});

app.post('/api/azure/sql/destroy', requirePermission('azure', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readAzureDB();
  const match = db.sqls.find(s => s.serverName === name);
  if (!match) return res.status(404).json({ error: 'SQL database not found' });

  match.status = 'destroying';
  writeAzureDB(db);

  logHistory[name] = [];
  res.json({ message: 'SQL database destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(AZURE_SQL_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) hasResources = true;
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          await runCmd('terraform', ['init', '-no-color'], targetDir, name);
        }
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name);
      }
      safeRmSync(targetDir);

      const currentDB = readAzureDB();
      currentDB.sqls = currentDB.sqls.filter(s => s.serverName !== name);
      writeAzureDB(currentDB);
      sendLog(name, `=== SQL database DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== SQL database DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readAzureDB();
      const match = currentDB.sqls.find(s => s.serverName === name);
      if (match) {
        match.status = 'destroy-failed';
        writeAzureDB(currentDB);
      }
    }
  };
  execute();
});


// ----- GCP API ENDPOINTS -----

app.get('/api/gcp/vm', requirePermission('gcp', 'read'), (req, res) => {
  res.json(readGcpDB().vms);
});

app.post('/api/gcp/vm/preview', requirePermission('gcp', 'write'), (req, res) => {
  const [region, zone] = (req.body.region || '').split('|');
  res.json({
    mainTf: getGcpVmTemplate(),
    tfvars: JSON.stringify({
      project: req.body.project,
      name: req.body.name,
      machine_type: req.body.machineType,
      region: region || 'us-central1',
      zone: zone || 'us-central1-a'
    }, null, 2)
  });
});

app.post('/api/gcp/vm/create', requirePermission('gcp', 'write'), (req, res) => {
  const { name, project, machineType, region: rawRegion } = req.body;
  if (!name || !project || !machineType || !rawRegion) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  const [region, zone] = rawRegion.split('|');

  const db = readGcpDB();
  if (db.vms.find(v => v.name === name)) {
    return res.status(400).json({ error: `Google Compute VM "${name}" already exists` });
  }

  const targetDir = path.join(GCP_VM_DEPLOYMENTS_DIR, name);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(path.join(targetDir, 'main.tf'), getGcpVmTemplate());
  const tfVars = { project, name, machine_type: machineType, region: region || 'us-central1', zone: zone || 'us-central1-a' };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newVm = {
    name,
    project,
    machineType,
    region: region || 'us-central1',
    zone: zone || 'us-central1-a',
    status: 'creating',
    publicIp: 'N/A',
    createdAt: new Date().toISOString()
  };
  db.vms.push(newVm);
  writeGcpDB(db);

  logHistory[name] = [];
  res.json({ message: 'GCP VM creation started', name });

  const execute = async () => {
    try {
      sendLog(name, `=== Initializing Terraform for GCP VM "${name}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, name);
      sendLog(name, `=== Applying GCP VM Terraform Plan for "${name}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, name);
      sendLog(name, `=== Fetching outputs for GCP VM "${name}" ===`);
      const outputs = await getOutput(targetDir);
      
      const currentDB = readGcpDB();
      const match = currentDB.vms.find(v => v.name === name);
      if (match) {
        match.status = 'active';
        match.publicIp = outputs.public_ip ? outputs.public_ip.value : 'N/A';
        writeGcpDB(currentDB);
      }
      sendLog(name, `=== GCP VM Successfully Created ===`);
    } catch (err) {
      sendLog(name, `=== GCP VM CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readGcpDB();
      const match = currentDB.vms.find(v => v.name === name);
      if (match) {
        match.status = 'failed';
        writeGcpDB(currentDB);
      }
    }
  };
  execute();
});

app.post('/api/gcp/vm/destroy', requirePermission('gcp', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readGcpDB();
  const match = db.vms.find(v => v.name === name);
  if (!match) return res.status(404).json({ error: 'GCP VM not found' });

  match.status = 'destroying';
  writeGcpDB(db);

  logHistory[name] = [];
  res.json({ message: 'GCP VM destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(GCP_VM_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) hasResources = true;
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          await runCmd('terraform', ['init', '-no-color'], targetDir, name);
        }
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name);
      }
      safeRmSync(targetDir);

      const currentDB = readGcpDB();
      currentDB.vms = currentDB.vms.filter(v => v.name !== name);
      writeGcpDB(currentDB);
      sendLog(name, `=== GCP VM DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== GCP VM DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readGcpDB();
      const match = currentDB.vms.find(v => v.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeGcpDB(currentDB);
      }
    }
  };
  execute();
});

// -- GCP VPC --
app.get('/api/gcp/vpc', requirePermission('gcp', 'read'), (req, res) => {
  res.json(readGcpDB().vpcs);
});

app.post('/api/gcp/vpc/preview', requirePermission('gcp', 'write'), (req, res) => {
  res.json({
    mainTf: getGcpVpcTemplate(),
    tfvars: JSON.stringify({
      project: req.body.project,
      name: req.body.name,
      region: req.body.region
    }, null, 2)
  });
});

app.post('/api/gcp/vpc/create', requirePermission('gcp', 'write'), (req, res) => {
  const { name, project, region } = req.body;
  if (!name || !project || !region) return res.status(400).json({ error: 'Missing required parameters' });

  const db = readGcpDB();
  if (db.vpcs.find(v => v.name === name)) return res.status(400).json({ error: `VPC Network "${name}" already exists` });

  const targetDir = path.join(GCP_VPC_DEPLOYMENTS_DIR, name);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, 'main.tf'), getGcpVpcTemplate());
  const tfVars = { project, name, region };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newVpc = { name, project, region, status: 'creating', vpcId: 'N/A', createdAt: new Date().toISOString() };
  db.vpcs.push(newVpc);
  writeGcpDB(db);

  logHistory[name] = [];
  res.json({ message: 'VPC Network creation started', name });

  const execute = async () => {
    try {
      sendLog(name, `=== Initializing Terraform for VPC Network "${name}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, name);
      sendLog(name, `=== Applying VPC Network Terraform Plan for "${name}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, name);
      const outputs = await getOutput(targetDir);
      
      const currentDB = readGcpDB();
      const match = currentDB.vpcs.find(v => v.name === name);
      if (match) {
        match.status = 'active';
        match.vpcId = outputs.vpc_id ? outputs.vpc_id.value : 'N/A';
        writeGcpDB(currentDB);
      }
      sendLog(name, `=== VPC Network Successfully Created ===`);
    } catch (err) {
      sendLog(name, `=== VPC Network CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readGcpDB();
      const match = currentDB.vpcs.find(v => v.name === name);
      if (match) {
        match.status = 'failed';
        writeGcpDB(currentDB);
      }
    }
  };
  execute();
});

app.post('/api/gcp/vpc/destroy', requirePermission('gcp', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readGcpDB();
  const match = db.vpcs.find(v => v.name === name);
  if (!match) return res.status(404).json({ error: 'VPC Network not found' });

  match.status = 'destroying';
  writeGcpDB(db);

  logHistory[name] = [];
  res.json({ message: 'VPC Network destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(GCP_VPC_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) hasResources = true;
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          await runCmd('terraform', ['init', '-no-color'], targetDir, name);
        }
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name);
      }
      safeRmSync(targetDir);

      const currentDB = readGcpDB();
      currentDB.vpcs = currentDB.vpcs.filter(v => v.name !== name);
      writeGcpDB(currentDB);
      sendLog(name, `=== VPC Network DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== VPC Network DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readGcpDB();
      const match = currentDB.vpcs.find(v => v.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeGcpDB(currentDB);
      }
    }
  };
  execute();
});

// -- GCP GCS Bucket --
app.get('/api/gcp/gcs', requirePermission('gcp', 'read'), (req, res) => {
  res.json(readGcpDB().buckets);
});

app.post('/api/gcp/gcs/preview', requirePermission('gcp', 'write'), (req, res) => {
  res.json({
    mainTf: getGcpGcsTemplate(),
    tfvars: JSON.stringify({
      project: req.body.project,
      name: req.body.name,
      location: req.body.location,
      storage_class: req.body.storageClass
    }, null, 2)
  });
});

app.post('/api/gcp/gcs/create', requirePermission('gcp', 'write'), (req, res) => {
  const { name, project, location, storageClass } = req.body;
  if (!name || !project || !location || !storageClass) return res.status(400).json({ error: 'Missing required parameters' });

  const db = readGcpDB();
  if (db.buckets.find(b => b.name === name)) return res.status(400).json({ error: `Storage Bucket "${name}" already exists` });

  const targetDir = path.join(GCP_GCS_DEPLOYMENTS_DIR, name);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, 'main.tf'), getGcpGcsTemplate());
  const tfVars = { name, project, location, storage_class: storageClass };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newBucket = { name, project, location, storageClass, status: 'creating', bucketUrl: 'N/A', createdAt: new Date().toISOString() };
  db.buckets.push(newBucket);
  writeGcpDB(db);

  logHistory[name] = [];
  res.json({ message: 'Storage Bucket creation started', name });

  const execute = async () => {
    try {
      sendLog(name, `=== Initializing Terraform for Storage Bucket "${name}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, name);
      sendLog(name, `=== Applying Storage Bucket Terraform Plan for "${name}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, name);
      const outputs = await getOutput(targetDir);
      
      const currentDB = readGcpDB();
      const match = currentDB.buckets.find(b => b.name === name);
      if (match) {
        match.status = 'active';
        match.bucketUrl = outputs.bucket_url ? outputs.bucket_url.value : 'N/A';
        writeGcpDB(currentDB);
      }
      sendLog(name, `=== Storage Bucket Successfully Created ===`);
    } catch (err) {
      sendLog(name, `=== Storage Bucket CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readGcpDB();
      const match = currentDB.buckets.find(b => b.name === name);
      if (match) {
        match.status = 'failed';
        writeGcpDB(currentDB);
      }
    }
  };
  execute();
});

app.post('/api/gcp/gcs/destroy', requirePermission('gcp', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readGcpDB();
  const match = db.buckets.find(b => b.name === name);
  if (!match) return res.status(404).json({ error: 'Storage Bucket not found' });

  match.status = 'destroying';
  writeGcpDB(db);

  logHistory[name] = [];
  res.json({ message: 'Storage Bucket destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(GCP_GCS_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) hasResources = true;
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          await runCmd('terraform', ['init', '-no-color'], targetDir, name);
        }
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name);
      }
      safeRmSync(targetDir);

      const currentDB = readGcpDB();
      currentDB.buckets = currentDB.buckets.filter(b => b.name !== name);
      writeGcpDB(currentDB);
      sendLog(name, `=== Storage Bucket DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== Storage Bucket DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readGcpDB();
      const match = currentDB.buckets.find(b => b.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeGcpDB(currentDB);
      }
    }
  };
  execute();
});

// -- GCP Cloud SQL --
app.get('/api/gcp/sql', requirePermission('gcp', 'read'), (req, res) => {
  res.json(readGcpDB().sqls);
});

app.post('/api/gcp/sql/preview', requirePermission('gcp', 'write'), (req, res) => {
  res.json({
    mainTf: getGcpSqlTemplate(),
    tfvars: JSON.stringify({
      project: req.body.project,
      name: req.body.name,
      database_version: req.body.databaseVersion,
      root_password: req.body.rootPassword,
      tier: req.body.tier,
      region: req.body.region
    }, null, 2)
  });
});

app.post('/api/gcp/sql/create', requirePermission('gcp', 'write'), (req, res) => {
  const { name, project, databaseVersion, rootPassword, tier, region } = req.body;
  if (!name || !project || !databaseVersion || !rootPassword || !tier || !region) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const db = readGcpDB();
  if (db.sqls.find(s => s.name === name)) {
    return res.status(400).json({ error: `Cloud SQL Instance "${name}" already exists` });
  }

  const targetDir = path.join(GCP_SQL_DEPLOYMENTS_DIR, name);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, 'main.tf'), getGcpSqlTemplate());
  const tfVars = { project, name, database_version: databaseVersion, root_password: rootPassword, tier, region };
  fs.writeFileSync(path.join(targetDir, 'terraform.tfvars.json'), JSON.stringify(tfVars, null, 2));

  const newSql = {
    name,
    project,
    databaseVersion,
    tier,
    region,
    status: 'creating',
    connectionName: 'N/A',
    createdAt: new Date().toISOString()
  };
  db.sqls.push(newSql);
  writeGcpDB(db);

  logHistory[name] = [];
  res.json({ message: 'Cloud SQL creation started', name });

  const execute = async () => {
    try {
      sendLog(name, `=== Initializing Terraform for Cloud SQL "${name}" ===`);
      await runCmd('terraform', ['init', '-no-color'], targetDir, name);
      sendLog(name, `=== Applying Cloud SQL Terraform Plan for "${name}" ===`);
      await runCmd('terraform', ['apply', '-auto-approve', '-no-color'], targetDir, name);
      const outputs = await getOutput(targetDir);
      
      const currentDB = readGcpDB();
      const match = currentDB.sqls.find(s => s.name === name);
      if (match) {
        match.status = 'active';
        match.connectionName = outputs.connection_name ? outputs.connection_name.value : 'N/A';
        writeGcpDB(currentDB);
      }
      sendLog(name, `=== Cloud SQL Successfully Created ===`);
    } catch (err) {
      sendLog(name, `=== Cloud SQL CREATION FAILED ===\nError: ${err.message}`);
      const currentDB = readGcpDB();
      const match = currentDB.sqls.find(s => s.name === name);
      if (match) {
        match.status = 'failed';
        writeGcpDB(currentDB);
      }
    }
  };
  execute();
});

app.post('/api/gcp/sql/destroy', requirePermission('gcp', 'execute'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const db = readGcpDB();
  const match = db.sqls.find(s => s.name === name);
  if (!match) return res.status(404).json({ error: 'Cloud SQL instance not found' });

  match.status = 'destroying';
  writeGcpDB(db);

  logHistory[name] = [];
  res.json({ message: 'Cloud SQL destroy started', name });

  const execute = async () => {
    try {
      const targetDir = path.join(GCP_SQL_DEPLOYMENTS_DIR, name);
      const statePath = path.join(targetDir, 'terraform.tfstate');
      let hasResources = false;
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.resources && state.resources.length > 0) hasResources = true;
        } catch (e) {}
      }

      if (hasResources) {
        if (!fs.existsSync(path.join(targetDir, '.terraform'))) {
          await runCmd('terraform', ['init', '-no-color'], targetDir, name);
        }
        await runCmd('terraform', ['destroy', '-auto-approve', '-no-color'], targetDir, name);
      }
      safeRmSync(targetDir);

      const currentDB = readGcpDB();
      currentDB.sqls = currentDB.sqls.filter(s => s.name !== name);
      writeGcpDB(currentDB);
      sendLog(name, `=== Cloud SQL DESTRUCTION COMPLETE ===`);
    } catch (err) {
      sendLog(name, `=== Cloud SQL DESTRUCTION FAILED ===\nError: ${err.message}`);
      const currentDB = readGcpDB();
      const match = currentDB.sqls.find(s => s.name === name);
      if (match) {
        match.status = 'destroy-failed';
        writeGcpDB(currentDB);
      }
    }
  };
  execute();
});
