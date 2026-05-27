output "db_endpoint" {
  description = "RDS endpoint address for connections."
  value       = aws_db_instance.this.address
}

output "db_port" {
  description = "RDS listening port."
  value       = aws_db_instance.this.port
}

output "db_instance_id" {
  description = "Identifier of the RDS instance."
  value       = aws_db_instance.this.id
}
