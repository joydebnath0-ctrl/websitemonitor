###############################################################
# Root Outputs
###############################################################

output "vpc_id"              { value = module.vpc.vpc_id }
output "public_subnet_ids"   { value = module.vpc.public_subnet_ids }
output "private_subnet_ids"  { value = module.vpc.private_subnet_ids }

output "ec2_instance_id"     { value = module.ec2.instance_id }
output "ec2_elastic_ip"      { value = module.ec2.elastic_ip }

# output "s3_app_bucket"       { value = module.s3.app_bucket_name }
# output "s3_logs_bucket"      { value = module.s3.logs_bucket_name }
# 
# output "ecr_repo_url"        { value = module.ecr.repository_url }
# 
# output "ecs_cluster"         { value = module.ecs.cluster_name }
# output "ecs_service"         { value = module.ecs.service_name }
# output "alb_dns_name"        { value = module.ecs.alb_dns_name }
# 
# output "cloudfront_url"      { value = "https://${module.cloudfront.domain_name}" }
# output "cloudfront_dist_id"  { value = module.cloudfront.distribution_id }
# 
# output "ecr_push_commands" {
#   description = "Copy-paste commands to push your image to ECR"
#   value = <<-EOT
#     aws ecr get-login-password --region ${var.aws_region} | \
#       docker login --username AWS --password-stdin ${module.ecr.repository_url}
#     docker build -t ${var.project_name} .
#     docker tag ${var.project_name}:latest ${module.ecr.repository_url}:latest
#     docker push ${module.ecr.repository_url}:latest
#   EOT
# }

output "joy_private_key_pem" {
  description = "The generated private key in PEM format"
  value       = tls_private_key.joy_key.private_key_pem
  sensitive   = true
}

