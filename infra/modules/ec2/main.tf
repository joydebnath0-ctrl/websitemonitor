###############################################################
# Module: EC2 + Elastic IP
# Resources: Security groups, IAM role, bastion EC2, app EC2,
#            Elastic IP (associated to bastion)
###############################################################

# ── Security Groups ──────────────────────────────────────────
resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-${var.environment}-bastion-sg"
  description = "Bastion host - SSH + web traffic"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH - restrict to your IP in prod"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "Next.js App Port"
    from_port   = 14037
    to_port     = 14037
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "Backend API Port"
    from_port   = 1625
    to_port     = 1625
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.project_name}-${var.environment}-bastion-sg" }
}

# resource "aws_security_group" "app" {
#   name        = "${var.project_name}-${var.environment}-app-sg"
#   description = "Private app server – SSH only from bastion"
#   vpc_id      = var.vpc_id
# 
#   ingress {
#     description     = "SSH from bastion"
#     from_port       = 22
#     to_port         = 22
#     protocol        = "tcp"
#     security_groups = [aws_security_group.bastion.id]
#   }
#   egress {
#     from_port   = 0
#     to_port     = 0
#     protocol    = "-1"
#     cidr_blocks = ["0.0.0.0/0"]
#   }
#   tags = { Name = "${var.project_name}-${var.environment}-app-sg" }
# }

# ── IAM Role ─────────────────────────────────────────────────
resource "aws_iam_role" "ec2" {
  name = "${var.project_name}-${var.environment}-ec2-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# resource "aws_iam_role_policy" "s3_access" {
#   name = "s3-access"
#   role = aws_iam_role.ec2.id
#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [{
#       Effect   = "Allow"
#       Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
#       Resource = ["arn:aws:s3:::${var.s3_bucket_name}", "arn:aws:s3:::${var.s3_bucket_name}/*"]
#     }]
#   })
# }

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-${var.environment}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ── Bastion EC2 (Public Subnet) ──────────────────────────────
resource "aws_instance" "bastion" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [aws_security_group.bastion.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  key_name               = var.key_name != "" ? var.key_name : null

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2
    http_put_response_hop_limit = 1
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y htop wget curl
    echo "Instance ready" >> /var/log/cloud-init-extra.log
  EOF
  )

  tags = { Name = "joy-test", Role = "bastion" }
}

# ── App EC2 (Private Subnet) ─────────────────────────────────
# resource "aws_instance" "app" {
#   ami                    = var.ami_id
#   instance_type          = var.instance_type
#   subnet_id              = var.private_subnet_id
#   vpc_security_group_ids = [aws_security_group.app.id]
#   iam_instance_profile   = aws_iam_instance_profile.ec2.name
#   key_name               = var.key_name != "" ? var.key_name : null
# 
#   root_block_device {
#     volume_type           = "gp3"
#     volume_size           = 30
#     encrypted             = true
#     delete_on_termination = true
#   }
# 
#   metadata_options {
#     http_endpoint               = "enabled"
#     http_tokens                 = "required"
#     http_put_response_hop_limit = 1
#   }
# 
#   user_data = base64encode(<<-EOF
#     #!/bin/bash
#     dnf update -y
#     dnf install -y amazon-ssm-agent docker htop
#     systemctl enable --now docker amazon-ssm-agent
#     usermod -aG docker ec2-user
#     echo "App server ready" >> /var/log/cloud-init-extra.log
#   EOF
#   )
# 
#   tags = { Name = "${var.project_name}-${var.environment}-app", Role = "app" }
# }

# ── Elastic IP (attached to Bastion) ─────────────────────────
resource "aws_eip" "bastion" {
  instance   = aws_instance.bastion.id
  domain     = "vpc"
  depends_on = [aws_instance.bastion]
  tags       = { Name = "${var.project_name}-${var.environment}-bastion-eip" }
}
