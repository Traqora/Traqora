variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for EKS cluster resources."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for EKS worker nodes."
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for EKS cluster control plane access."
  type        = list(string)
}

variable "cluster_security_group_id" {
  description = "Optional security group ID for the EKS cluster."
  type        = string
  default     = ""
}

variable "node_instance_type" {
  description = "Instance type for EKS worker nodes."
  type        = string
}

variable "desired_capacity" {
  description = "Desired number of worker nodes."
  type        = number
}

variable "min_capacity" {
  description = "Minimum number of worker nodes."
  type        = number
}

variable "max_capacity" {
  description = "Maximum number of worker nodes."
  type        = number
}

variable "ssh_key_name" {
  description = "EC2 key pair name for node SSH access."
  type        = string
  default     = ""
}

variable "source_security_group_ids" {
  description = "Source security groups allowed for remote access to worker nodes."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to EKS resources."
  type        = map(string)
  default     = {}
}
