resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.project_name}-${var.environment}-redis-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-subnet-group"
  })
}

resource "aws_security_group" "this" {
  name        = "${var.project_name}-${var.environment}-redis-sg"
  description = "Redis security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-sg"
  })
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id          = "${var.project_name}-${var.environment}-redis"
  replication_group_description = "Managed Redis cluster for ${var.project_name}"
  engine                        = "redis"
  engine_version                = var.engine_version
  node_type                     = var.node_type
  number_cache_clusters         = var.num_cache_clusters
  automatic_failover_enabled    = true
  transit_encryption_enabled    = true
  apply_immediately             = false
  subnet_group_name             = aws_elasticache_subnet_group.this.name
  security_group_ids            = [aws_security_group.this.id]
  maintenance_window            = "sun:05:00-sun:09:00"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-cluster"
  })
}
