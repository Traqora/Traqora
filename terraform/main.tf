locals {
  common_tags = merge({
    Project     = var.project_name
    Environment = var.environment
  }, var.tags)

  frontend_hosted_domain = var.frontend_domain != "" ? var.frontend_domain : "app.${var.root_domain_name}"
  backend_hosted_domain  = var.backend_domain != "" ? var.backend_domain : "api.${var.root_domain_name}"
}

module "vpc" {
  source              = "./modules/vpc"
  project_name        = var.project_name
  environment         = var.environment
  cidr_block          = var.vpc_cidr
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  availability_zones  = var.availability_zones
  tags                = local.common_tags
}

module "acm" {
  source            = "./modules/acm"
  domain_name       = local.frontend_hosted_domain
  alternative_names = [local.backend_hosted_domain]
  hosted_zone_id    = var.route53_hosted_zone_id
  tags              = local.common_tags
}

module "rds" {
  source                = "./modules/rds"
  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.private_subnets
  security_group_ids    = [module.vpc.default_security_group_id]
  db_instance_class     = var.db_instance_class
  engine                = var.db_engine
  engine_version        = var.db_engine_version
  db_name               = var.db_name
  username              = var.db_username
  password              = var.db_password
  allocated_storage     = var.db_allocated_storage
  backup_retention_days = var.db_backup_retention_days
  multi_az              = var.db_multi_az
  tags                  = local.common_tags
}

module "redis" {
  source             = "./modules/redis"
  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnets
  security_group_ids = [module.vpc.default_security_group_id]
  cache_node_type    = var.cache_node_type
  num_cache_clusters = var.cache_node_count
  engine_version     = var.cache_engine_version
  tags               = local.common_tags
}

module "eks" {
  source                          = "./modules/eks"
  project_name                    = var.project_name
  environment                     = var.environment
  cluster_name                    = "${var.project_name}-${var.environment}-eks"
  vpc_id                          = module.vpc.vpc_id
  subnet_ids                      = module.vpc.private_subnets
  public_subnet_ids               = module.vpc.public_subnets
  cluster_security_group_id       = module.vpc.default_security_group_id
  node_instance_type              = var.eks_node_instance_type
  desired_capacity                = var.eks_desired_capacity
  max_capacity                    = var.eks_max_capacity
  min_capacity                    = var.eks_min_capacity
  tags                            = local.common_tags
}

module "alb" {
  source          = "./modules/alb"
  project_name    = var.project_name
  environment     = var.environment
  vpc_id          = module.vpc.vpc_id
  public_subnets  = module.vpc.public_subnets
  certificate_arn = module.acm.certificate_arn
  tags            = local.common_tags
}

module "s3" {
  source      = "./modules/s3"
  project_name = var.project_name
  environment  = var.environment
  bucket_name  = "${var.project_name}-${var.environment}-assets"
  tags         = local.common_tags
}

module "cloudfront" {
  source            = "./modules/cloudfront"
  project_name      = var.project_name
  environment       = var.environment
  origin_domain_name = module.s3.bucket_domain_name
  bucket_name       = module.s3.bucket_id
  aliases           = [local.frontend_hosted_domain]
  certificate_arn   = module.acm.certificate_arn
  tags              = local.common_tags
}

resource "aws_route53_record" "frontend_alias" {
  zone_id = var.route53_hosted_zone_id
  name    = local.frontend_hosted_domain
  type    = "A"

  alias {
    name                   = module.cloudfront.domain_name
    zone_id                = module.cloudfront.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "backend_alias" {
  zone_id = var.route53_hosted_zone_id
  name    = local.backend_hosted_domain
  type    = "A"

  alias {
    name                   = module.alb.dns_name
    zone_id                = module.alb.zone_id
    evaluate_target_health = true
  }
}
