resource "aws_ecs_cluster" "this" {
  name = "${var.project_name}-${var.environment}-ecs-cluster"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-ecs-cluster"
  })
}

resource "aws_iam_role" "task_execution" {
  name = "${var.project_name}-${var.environment}-ecs-task-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-ecs-task-exec-role"
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.project_name}-${var.environment}-ecs-task"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.task_execution.arn

  container_definitions = jsonencode([
    {
      name      = "${var.project_name}-app"
      image     = var.container_image
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = var.container_environment
    }
  ])
}

resource "aws_ecs_service" "this" {
  name            = "${var.project_name}-${var.environment}-ecs-service"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this.arn
  launch_type     = "FARGATE"
  desired_count   = var.desired_count

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = var.security_group_ids
    assign_public_ip = false
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-ecs-service"
  })
}
