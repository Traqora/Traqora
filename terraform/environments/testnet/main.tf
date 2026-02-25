provider "google" {
  project = var.project_id
  region  = var.region
}

module "backend_service" {
  source = "../../modules/services"
  
  service_name = "traqora-backend"
  image        = var.backend_image
  region       = var.region
}

module "client_service" {
  source = "../../modules/services"
  
  service_name = "traqora-client"
  image        = var.client_image
  region       = var.region
}

variable "project_id" {}
variable "region" {
  default = "us-central1"
}
variable "backend_image" {}
variable "client_image" {}
