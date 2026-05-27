output "dns_name" {
  description = "DNS name for the application load balancer."
  value       = aws_lb.this.dns_name
}

output "zone_id" {
  description = "Hosted zone ID for the application load balancer."
  value       = aws_lb.this.zone_id
}

output "target_group_arn" {
  description = "ARN of the backend target group."
  value       = aws_lb_target_group.backend.arn
}
