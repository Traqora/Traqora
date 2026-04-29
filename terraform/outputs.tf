output "vpc_id" {
  description = "The ID of the VPC created for the environment."
  value       = module.vpc.vpc_id
}

output "frontend_url" {
  description = "The public URL for the frontend application."
  value       = "https://${module.cloudfront.domain_name}"
}

output "backend_url" {
  description = "The public URL for the backend API."
  value       = "https://${aws_route53_record.backend_alias.name}"
}

output "rds_endpoint" {
  description = "Connection endpoint for the managed database."
  value       = module.rds.db_endpoint
}

output "redis_endpoint" {
  description = "Connection endpoint for the Redis cache cluster."
  value       = module.redis.primary_endpoint_address
}

output "eks_cluster_name" {
  description = "EKS cluster name."
  value       = module.eks.cluster_name
}

output "alb_dns_name" {
  description = "DNS name for the application load balancer."
  value       = module.alb.dns_name
}
