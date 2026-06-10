###############################################################
# Module: S3
# Resources: App bucket (static assets/uploads) + logs bucket
#            OAC policy is wired by CloudFront module
###############################################################

resource "random_id" "suffix" {
  byte_length = 4
}

# ── Logs Bucket ───────────────────────────────────────────────
resource "aws_s3_bucket" "logs" {
  bucket        = "${var.project_name}-${var.environment}-logs-${random_id.suffix.hex}"
  force_destroy = var.environment != "prod"
  tags          = { Name = "logs" }
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule { object_ownership = "BucketOwnerPreferred" }
}

resource "aws_s3_bucket_acl" "logs" {
  depends_on = [aws_s3_bucket_ownership_controls.logs]
  bucket     = aws_s3_bucket.logs.id
  acl        = "log-delivery-write"
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "expire-old-logs"
    status = "Enabled"
    filter { prefix = "" }
    expiration { days = 90 }
  }
}

# ── App Bucket ────────────────────────────────────────────────
resource "aws_s3_bucket" "app" {
  bucket        = "${var.project_name}-${var.environment}-app-${random_id.suffix.hex}"
  force_destroy = var.environment != "prod"
  tags          = { Name = "app" }
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "app" {
  bucket        = aws_s3_bucket.app.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-access/"
}

resource "aws_s3_bucket_lifecycle_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    id     = "transition-old-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

# CloudFront Origin Access Control policy (applied by CF module)
resource "aws_s3_bucket_policy" "app" {
  bucket = aws_s3_bucket.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.app.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = var.account_id
          }
        }
      }
    ]
  })
}

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
