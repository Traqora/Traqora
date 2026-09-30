# Per-PR ephemeral test environment (issue #588).
#
# Provisions a disposable Postgres + backend pair on the CI runner's own
# Docker daemon, wired together on a private network. Everything is
# namespaced by `pr_number` so that (in theory, on a persistent runner)
# multiple PRs could run side by side without colliding, and so cleanup can
# target exactly one PR's resources.
#
# `terraform destroy` tears the whole thing down; nothing here persists past
# the workflow run that created it.

locals {
  name_prefix = "traqora-pr-${var.pr_number}"
  labels = {
    "com.traqora.ephemeral"  = "true"
    "com.traqora.pr-number"  = var.pr_number
    "com.traqora.ttl-hours"  = tostring(var.ttl_hours)
    "com.traqora.created-at" = timestamp()
  }
}

resource "docker_network" "this" {
  name = "${local.name_prefix}-net"
}

resource "docker_image" "postgres" {
  name = "postgres:15-alpine"
}

resource "docker_container" "db" {
  name  = "${local.name_prefix}-db"
  image = docker_image.postgres.image_id

  networks_advanced {
    name = docker_network.this.name
  }

  env = [
    "POSTGRES_DB=${var.db_name}",
    "POSTGRES_USER=${var.db_user}",
    "POSTGRES_PASSWORD=${var.db_password}",
  ]

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U ${var.db_user} -d ${var.db_name}"]
    interval = "5s"
    timeout  = "5s"
    retries  = 10
  }

  # Publish to a host-allocated port so the CI job can wait on it directly,
  # in addition to the private network the backend container uses.
  ports {
    internal = 5432
  }

  labels {
    label = "com.traqora.ephemeral"
    value = "true"
  }
  labels {
    label = "com.traqora.pr-number"
    value = var.pr_number
  }
}

resource "docker_container" "backend" {
  name  = "${local.name_prefix}-backend"
  image = var.backend_image

  depends_on = [docker_container.db]

  networks_advanced {
    name = docker_network.this.name
  }

  env = [
    "NODE_ENV=test",
    "PORT=${var.backend_port}",
    "DATABASE_URL=postgres://${var.db_user}:${var.db_password}@${docker_container.db.name}:5432/${var.db_name}",
    "JWT_SECRET=ephemeral-test-secret-key-not-for-production-use",
    "JWT_REFRESH_SECRET=ephemeral-test-refresh-secret-not-for-production",
  ]

  healthcheck {
    test         = ["CMD-SHELL", "wget -qO- http://localhost:${var.backend_port}/health || exit 1"]
    interval     = "5s"
    timeout      = "5s"
    retries      = 15
    start_period = "10s"
  }

  ports {
    internal = var.backend_port
    # external left unset -> Docker allocates a free host port; read back
    # via the `backend_url` output.
  }

  labels {
    label = "com.traqora.ephemeral"
    value = "true"
  }
  labels {
    label = "com.traqora.pr-number"
    value = var.pr_number
  }
  labels {
    label = "com.traqora.ttl-hours"
    value = tostring(var.ttl_hours)
  }
}
