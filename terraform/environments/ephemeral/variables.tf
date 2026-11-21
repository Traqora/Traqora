variable "pr_number" {
  description = "Pull request number. Used to namespace all resources so concurrent PR environments never collide."
  type        = string
}

variable "backend_image" {
  description = "Locally-built backend image tag to run, e.g. traqora-backend:pr-123."
  type        = string
}

variable "db_name" {
  description = "Ephemeral database name."
  type        = string
  default     = "traqora_test"
}

variable "db_user" {
  description = "Ephemeral database user."
  type        = string
  default     = "traqora"
}

variable "db_password" {
  description = "Ephemeral database password. Only ever used inside the per-PR Docker network on the CI runner, never persisted."
  type        = string
  default     = "traqora-ephemeral"
  sensitive   = true
}

variable "backend_port" {
  description = "Container port the backend listens on."
  type        = number
  default     = 3001
}

variable "ttl_hours" {
  description = "Advisory lifetime cap applied as a container label; enforced by .github/workflows/pr-ephemeral-cleanup.yml, not by Terraform/Docker itself."
  type        = number
  default     = 4
}
