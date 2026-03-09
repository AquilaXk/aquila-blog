output "instance_id" {
  value       = aws_instance.app.id
  description = "EC2 instance ID"
}

output "instance_private_ip" {
  value       = aws_instance.app.private_ip
  description = "EC2 private IP"
}

output "elastic_ip" {
  value       = aws_eip.app.public_ip
  description = "Elastic IP for deployment target"
}

output "vpc_id" {
  value       = aws_vpc.main.id
  description = "VPC ID"
}

output "public_subnet_id" {
  value       = aws_subnet.public.id
  description = "Public subnet ID"
}

output "security_group_id" {
  value       = aws_security_group.web_db.id
  description = "Security group ID"
}
