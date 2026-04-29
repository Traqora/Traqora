output "bucket_id" {
  description = "S3 bucket ID."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket."
  value       = aws_s3_bucket.this.arn
}

output "bucket_domain_name" {
  description = "Domain name of the S3 bucket."
  value       = aws_s3_bucket.this.bucket_regional_domain_name
}
