variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "origin_domain_name" {
  description = "Origin domain for the CloudFront distribution."
  type        = string
}

variable "aliases" {
  description = "Custom domain names for CloudFront."
  type        = list(string)
}

variable "bucket_name" {
  description = "S3 bucket name used by the CloudFront origin."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate ARN for CloudFront HTTPS."
  type        = string
}

variable "default_root_object" {
  description = "Default root object for CloudFront."
  type        = string
  default     = "index.html"
}

variable "tags" {
  description = "Tags to apply to CloudFront resources."
  type        = map(string)
  default     = {}
}
