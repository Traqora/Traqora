output "certificate_arn" {
  description = "ARN of the validated ACM certificate."
  value       = aws_acm_certificate.this.arn
}

output "validation_status" {
  description = "Validation status of the ACM certificate."
  value       = aws_acm_certificate_validation.this.status
}
