# Terraform (AWS infrastructure)

This directory provisions the production/staging AWS stack (VPC, RDS, EKS,
ALB, CloudFront, ACM, Route53) via the root module in `terraform/`, plus a
Docker-based ephemeral module (`terraform/environments/ephemeral/`) used for
per-PR test environments. `terraform/environments/testnet/` is a separate,
smaller GCP-backed root module (unrelated to the AWS stack).

## CI checks

### PRs that touch `terraform/` — `.github/workflows/infra-deploy.yml` (issue #587)

Every pull request that changes anything under `terraform/` runs, in order:

1. **`terraform fmt -check -recursive`** — fails the PR on unformatted files.
2. **`terraform init -backend=false` + `terraform validate`** — pure syntax/
   config validation, no cloud credentials needed. Runs for every
   contributor, including forks.
3. **`tfsec`** — static security scan (non-blocking, results uploaded as an
   artifact).
4. **A real `init` + `plan`** against the **`dev`** workspace, using the
   actual S3 remote backend, and posts the plan as a PR comment. This step
   only runs when the maintainer-only secrets below are present, so it's
   safely skipped (with a warning, not a failure) on PRs from forks that
   can't see repo secrets.

Nothing is ever `apply`'d from a pull request.

Required repo secrets for the real init+plan step:

| Secret                 | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `TF_STATE_BUCKET`       | S3 bucket holding remote state                       |
| `TF_STATE_LOCK_TABLE`   | DynamoDB table used for state locking                |
| `AWS_REGION`            | Region for both the backend and the AWS provider     |
| `AWS_ROLE_TO_ASSUME`    | IAM role assumed via GitHub OIDC (`id-token: write`) |

### `push` to `main` / `workflow_dispatch`

Same validate → plan pipeline, followed by `terraform apply` of the saved
plan (gated behind the `dev` / `staging` / `prod` GitHub Environment, so
`prod` can require manual approval), then a post-deploy verification job.
`push` events target the `prod` workspace; `workflow_dispatch` lets you pick
`dev`, `staging`, or `prod` explicitly.

### Environment matrix

| Trigger                              | Workspace         | Backend | Apply? |
| ------------------------------------- | ----------------- | ------- | ------ |
| `pull_request` touching `terraform/`  | `dev`              | real S3 | never  |
| `push` to `main`                      | `prod`             | real S3 | yes    |
| `workflow_dispatch`                   | input (`dev`/`staging`/`prod`) | real S3 | yes |
| Per-PR ephemeral env (see below)      | default (local state) | local (Docker provider) | yes, then always destroyed within the same job |

## Ephemeral per-PR environments (issue #588)

`terraform/environments/ephemeral/` is a **separate, lightweight root
module** built on the `kreuzwerker/docker` provider instead of AWS: it spins
up a disposable Postgres container plus a backend container built from the
PR's own code, wired together on a private Docker network, entirely on the
GitHub Actions runner. It intentionally does **not** touch AWS or the real
backend/state above — it's dev/test tooling, not part of the deployable
infrastructure.

`.github/workflows/pr-ephemeral-env.yml`:

1. Builds a local `traqora-backend:pr-<number>` image from
   `packages/backend`.
2. `terraform apply`s the ephemeral module, producing a running backend +
   Postgres pair reachable at a dynamically-allocated `localhost` port.
3. Runs the backend integration suite
   (`npm run test:integration --workspace=packages/backend`) against that
   environment via `API_BASE_URL`.
4. **Always** runs `terraform destroy` afterwards (`if: always()`),
   regardless of test outcome.

**Lifetime cap policy.** Each ephemeral environment lives entirely inside one
`ubuntu-latest` GitHub-hosted runner for the duration of one job:

- The job has a hard `timeout-minutes: 25` ceiling — GitHub kills the job
  (and the runner VM under it) if it runs longer.
- The `terraform destroy` step above always runs first, for clean state and
  container logs.
- Even if both of those failed to run, the runner VM is destroyed the
  instant the job ends, which takes every Docker container/network it hosted
  with it. Nothing from this module can outlive a single job, on a
  GitHub-hosted runner, by construction — there is deliberately no
  cross-run cleanup workflow, because there is nothing for one to clean up.

The ephemeral module keeps **local** Terraform state (see
`terraform/environments/ephemeral/versions.tf`) rather than sharing the real
S3 backend above — it is throwaway dev/test tooling scoped to one job, not
part of the deployable infrastructure, and this keeps a crashed ephemeral run
from ever being able to touch dev/staging/prod state.

## Local development

```bash
cd terraform
terraform init -backend-config=backend.hcl   # see backend.hcl.example
terraform workspace select dev || terraform workspace new dev
terraform plan -var-file=environments/dev.tfvars
```

`backend.hcl` is gitignored — copy `backend.hcl.example`, fill in your own
bucket/table, and never commit real values.
