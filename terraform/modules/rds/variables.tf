variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the database will be deployed."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets used by the database."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs allowed to access the database."
  type        = list(string)
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
}

variable "engine" {
  description = "Database engine name."
  type        = string
}

variable "engine_version" {
  description = "Database engine version."
  type        = string
}

variable "db_name" {
  description = "Primary database name."
  type        = string
}

variable "username" {
  description = "Database master username."
  type        = string
}

variable "password" {
  description = "Database master password."
  type        = string
  sensitive   = true
}

variable "allocated_storage" {
  description = "RDS storage size in GB."
  type        = number
}

variable "backup_retention_days" {
  description = "Number of days to retain automated backups."
  type        = number
}

variable "multi_az" {
  description = "Run RDS as a multi-AZ deployment."
  type        = bool
}

variable "tags" {
  description = "Tags to apply to RDS resources."
  type        = map(string)
  default     = {}
}
