###############################################################
#  Multi-Cloud Infrastructure Template
#  Services: VPC · EC2 · Elastic IP · S3 · ECR · ECS · CloudFront
#  Provider : AWS (extensible to Azure/GCP via additional providers)
###############################################################

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to store state remotely
  # backend "s3" {
  #   bucket         = "your-tf-state-bucket"
  #   key            = "infra/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

###############################################################
# Data Sources
###############################################################

data "aws_availability_zones" "available" { state = "available" }
data "aws_caller_identity" "current" {}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

###############################################################
# Modules
###############################################################

resource "tls_private_key" "joy_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "joy_key" {
  key_name   = "joy-key"
  public_key = tls_private_key.joy_key.public_key_openssh
}

module "vpc" {
  source               = "./modules/vpc"
  project_name         = var.project_name
  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  azs                  = slice(data.aws_availability_zones.available.names, 0, 2)
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
}

# module "s3" {
#   source       = "./modules/s3"
#   project_name = var.project_name
#   environment  = var.environment
#   account_id   = data.aws_caller_identity.current.account_id
# }

# module "ecr" {
#   source       = "./modules/ecr"
#   project_name = var.project_name
#   environment  = var.environment
# }

module "ec2" {
  source            = "./modules/ec2"
  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_id  = module.vpc.public_subnet_ids[0]
  private_subnet_id = module.vpc.private_subnet_ids[0]
  ami_id            = data.aws_ami.ubuntu.id
  instance_type     = var.ec2_instance_type
  key_name          = aws_key_pair.joy_key.key_name
  s3_bucket_name    = ""
}

# module "ecs" {
#   source             = "./modules/ecs"
#   project_name       = var.project_name
#   environment        = var.environment
#   vpc_id             = module.vpc.vpc_id
#   public_subnet_ids  = module.vpc.public_subnet_ids
#   private_subnet_ids = module.vpc.private_subnet_ids
#   ecr_repo_url       = module.ecr.repository_url
#   image_tag          = var.app_image_tag
#   app_port           = var.app_port
#   desired_count      = var.ecs_desired_count
#   task_cpu           = var.ecs_task_cpu
#   task_memory        = var.ecs_task_memory
#   s3_bucket_name     = module.s3.app_bucket_name
# }

# module "cloudfront" {
#   source              = "./modules/cloudfront"
#   project_name        = var.project_name
#   environment         = var.environment
#   s3_bucket_id        = module.s3.app_bucket_id
#   s3_regional_domain  = module.s3.app_bucket_regional_domain
#   alb_dns_name        = module.ecs.alb_dns_name
#   price_class         = var.cloudfront_price_class
# }

