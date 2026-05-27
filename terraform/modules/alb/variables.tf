variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for the load balancer."
  type        = string
}

variable "public_subnets" {
  description = "Public subnet IDs for the load balancer."
  type        = list(string)
}

variable "certificate_arn" {
  description = "ACM certificate ARN used by the ALB."
  type        = string
}

variable "tags" {
  description = "Tags to apply to ALB resources."
  type        = map(string)
  default     = {}
}
