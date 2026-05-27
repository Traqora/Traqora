variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "domain_name" {
  description = "Primary domain name for the ACM certificate."
  type        = string
}

variable "alternative_names" {
  description = "Additional subject alternative names for the certificate."
  type        = list(string)
  default     = []
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for ACM validation."
  type        = string
}

variable "tags" {
  description = "Tags to apply to ACM resources."
  type        = map(string)
  default     = {}
}
