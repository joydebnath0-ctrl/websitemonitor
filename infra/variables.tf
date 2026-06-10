###############################################################
# Root Variables
###############################################################

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project prefix for all resource names"
  type        = string
  default     = "myapp"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev | staging | prod."
  }
}

# ── VPC ──────────────────────────────────────────────────────
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.11.0/24", "10.0.12.0/24"]
}

# ── EC2 ──────────────────────────────────────────────────────
variable "ec2_instance_type" {
  type    = string
  default = "t3.micro"
}

variable "ec2_key_name" {
  description = "Existing EC2 Key Pair name (leave blank to skip)"
  type        = string
  default     = ""
}

# ── ECS ──────────────────────────────────────────────────────
variable "app_image_tag" {
  type    = string
  default = "latest"
}

variable "app_port" {
  type    = number
  default = 80
}

variable "ecs_desired_count" {
  type    = number
  default = 2
}

variable "ecs_task_cpu" {
  description = "CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "ecs_task_memory" {
  description = "Memory in MiB"
  type        = number
  default     = 512
}

# ── CloudFront ────────────────────────────────────────────────
variable "cloudfront_price_class" {
  type    = string
  default = "PriceClass_100"
}
