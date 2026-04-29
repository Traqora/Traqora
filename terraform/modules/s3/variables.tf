variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "bucket_name" {
  description = "Name of the S3 bucket for static assets."
  type        = string
}

variable "tags" {
  description = "Tags to apply to S3 resources."
  type        = map(string)
  default     = {}
}
