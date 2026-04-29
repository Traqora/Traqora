variable "project_name" {
  description = "Project name used for resource naming and tags."
  type        = string
  default     = "traqora"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for the deployment."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile used for local development."
  type        = string
  default     = "default"
}

variable "root_domain_name" {
  description = "Root domain name for application endpoints."
  type        = string
  default     = "example.com"
}

variable "frontend_domain" {
  description = "Optional frontend custom domain alias."
  type        = string
  default     = ""
}

variable "backend_domain" {
  description = "Optional backend API custom domain alias."
  type        = string
  default     = ""
}

variable "route53_hosted_zone_id" {
  description = "Route53 hosted zone ID used for DNS records and ACM validation."
  type        = string
  default     = ""
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones used by subnet resources."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets."
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "db_engine" {
  description = "Database engine for the managed RDS instance."
  type        = string
  default     = "postgres"
}

variable "db_engine_version" {
  description = "Database engine version for RDS."
  type        = string
  default     = "15.4"
}

variable "db_instance_class" {
  description = "Instance class for the RDS database."
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB for the RDS database."
  type        = number
  default     = 50
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated database backups."
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Whether the RDS instance should be multi-AZ."
  type        = bool
  default     = true
}

variable "db_name" {
  description = "Database name used by the application."
  type        = string
  default     = "traqora"
}

variable "db_username" {
  description = "Master database username."
  type        = string
  default     = "traqora_admin"
}

variable "db_password" {
  description = "Master database password. Use secrets in production."
  type        = string
  default     = "ChangeMe123!"
  sensitive   = true
}

variable "cache_node_type" {
  description = "Node type for ElastiCache Redis."
  type        = string
  default     = "cache.t3.micro"
}

variable "cache_node_count" {
  description = "Number of nodes in the Redis replication group."
  type        = number
  default     = 1
}

variable "cache_engine_version" {
  description = "Redis engine version for ElastiCache."
  type        = string
  default     = "7.0"
}

variable "eks_node_instance_type" {
  description = "EKS worker node instance type."
  type        = string
  default     = "t3.medium"
}

variable "eks_desired_capacity" {
  description = "Desired number of worker nodes for EKS."
  type        = number
  default     = 2
}

variable "eks_min_capacity" {
  description = "Minimum number of EKS worker nodes."
  type        = number
  default     = 2
}

variable "eks_max_capacity" {
  description = "Maximum number of EKS worker nodes."
  type        = number
  default     = 5
}

variable "tags" {
  description = "Additional tags applied to all AWS resources."
  type        = map(string)
  default     = {}
}
