terraform {
  required_version = ">= 1.5.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }

  # Deliberately no remote backend: this is disposable, per-PR state that
  # only ever lives for the length of one CI run on one runner (issue #588).
  # Using local state here keeps the ephemeral module fully decoupled from
  # the real AWS/S3 backend used by ../.. (issue #587) — a crashed ephemeral
  # run can never corrupt dev/staging/prod state.
}

provider "docker" {}
