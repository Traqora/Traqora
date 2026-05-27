output "vpc_id" {
  description = "ID of the created VPC."
  value       = aws_vpc.this.id
}

output "public_subnets" {
  description = "IDs of public subnets created by the VPC module."
  value       = [for subnet in values(aws_subnet.public) : subnet.id]
}

output "private_subnets" {
  description = "IDs of private subnets created by the VPC module."
  value       = [for subnet in values(aws_subnet.private) : subnet.id]
}

output "default_security_group_id" {
  description = "Default security group in the VPC."
  value       = aws_security_group.default.id
}
