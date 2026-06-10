output "cluster_name"  { value = aws_ecs_cluster.this.name }
output "service_name"  { value = aws_ecs_service.this.name }
output "alb_dns_name"  { value = aws_lb.this.dns_name }
output "alb_arn"       { value = aws_lb.this.arn }
output "alb_sg_id"     { value = aws_security_group.alb.id }
