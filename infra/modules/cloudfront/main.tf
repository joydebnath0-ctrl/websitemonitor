###############################################################
# Module: CloudFront
# Resources: Distribution with dual origin (S3 + ALB),
#            Origin Access Control, cache behaviors
###############################################################

# ── Origin Access Control for S3 ────────────────────────────
resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.project_name}-${var.environment}-oac"
  description                       = "OAC for ${var.project_name} S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Cache Policies ────────────────────────────────────────────
resource "aws_cloudfront_cache_policy" "api" {
  name        = "${var.project_name}-${var.environment}-api-cache"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config  { cookie_behavior  = "none" }
    headers_config  { header_behavior  = "none" }
    query_strings_config { query_string_behavior = "none" }
  }
}

# ── Distribution ─────────────────────────────────────────────
resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  comment             = "${var.project_name}-${var.environment}"
  price_class         = var.price_class
  default_root_object = "index.html"

  # ── Origin 1 : S3 (static assets) ──────────────────────────
  origin {
    domain_name              = var.s3_regional_domain
    origin_id                = "S3-${var.s3_bucket_id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # ── Origin 2 : ALB (dynamic API / app) ──────────────────────
  origin {
    domain_name = var.alb_dns_name
    origin_id   = "ALB-${var.project_name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ── Default Cache Behavior → S3 ────────────────────────────
  default_cache_behavior {
    target_origin_id       = "S3-${var.s3_bucket_id}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  # ── /api/* → ALB ────────────────────────────────────────────
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "ALB-${var.project_name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.api.id

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Origin", "Accept"]
      cookies { forward = "all" }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # ── Custom error pages (SPA support) ────────────────────────
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    # ssl_support_method  = "sni-only"
    # acm_certificate_arn = var.acm_cert_arn   # enable with custom domain
  }

  tags = { Name = "${var.project_name}-${var.environment}-cf" }
}
