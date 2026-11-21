output "backend_container_name" {
  description = "Name of the backend container."
  value       = docker_container.backend.name
}

output "backend_host_port" {
  description = "Host port mapped to the backend container's app port. Use with http://localhost:<port>."
  value       = docker_container.backend.ports[0].external
}

output "backend_url" {
  description = "URL the CI job / integration tests should target."
  value       = "http://localhost:${docker_container.backend.ports[0].external}"
}

output "db_container_name" {
  description = "Name of the ephemeral Postgres container."
  value       = docker_container.db.name
}

output "network_name" {
  description = "Name of the private Docker network shared by the db and backend containers."
  value       = docker_network.this.name
}
