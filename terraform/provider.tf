provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = merge({
      Project     = var.project_name
      Environment = var.environment
    }, var.tags)
  }
}
