terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Real remote state backend (issue #587). Left partially configured on
  # purpose: concrete values are supplied at `terraform init` time via
  # `-backend-config` flags/files so the same code works across
  # dev / staging / prod without editing this file. See terraform/README.md
  # for the full CI wiring and the local-dev fallback.
  backend "s3" {}
}
