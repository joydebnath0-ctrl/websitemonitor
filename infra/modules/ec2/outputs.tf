output "instance_id"    { value = aws_instance.bastion.id }
output "elastic_ip"     { value = aws_eip.bastion.public_ip }
# output "app_private_ip" { value = aws_instance.app.private_ip }
output "bastion_sg_id"  { value = aws_security_group.bastion.id }
