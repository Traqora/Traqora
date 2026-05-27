variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where Redis will be deployed."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for Redis."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security groups allowed to access Redis."
  type        = list(string)
}

variable "node_type" {
  description = "ElastiCache node type for Redis."
  type        = string
}

variable "num_cache_clusters" {
  description = "Number of Redis cache nodes."
  type        = number
}

variable "engine_version" {
  description = "Redis engine version."
  type        = string
}

variable "tags" {
  description = "Tags to apply to Redis resources."
  type        = map(string)
  default     = {}
}
