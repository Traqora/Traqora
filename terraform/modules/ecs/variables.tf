variable "project_name" {
  description = "Project name used for resource naming."
  type        = string
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "container_image" {
  description = "Container image URI for the ECS task."
  type        = string
}

variable "container_port" {
  description = "Container port exposed by the ECS task."
  type        = number
  default     = 3000
}

variable "task_cpu" {
  description = "CPU units for the ECS task."
  type        = string
  default     = "512"
}

variable "task_memory" {
  description = "Memory for the ECS task."
  type        = string
  default     = "1024"
}

variable "desired_count" {
  description = "Desired number of ECS service tasks."
  type        = number
  default     = 2
}

variable "subnet_ids" {
  description = "Subnet IDs for ECS tasks."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security groups for ECS tasks."
  type        = list(string)
}

variable "container_environment" {
  description = "Environment variables injected into the ECS container."
  type        = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "tags" {
  description = "Tags to apply to ECS resources."
  type        = map(string)
  default     = {}
}
