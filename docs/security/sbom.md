# Software Bill of Materials (SBOM)

Issue #590: every backend and client image built by CD gets an explicit,
downloadable SPDX SBOM so third-party component lists stay auditable
independently of the image itself.

## Where it comes from

`.github/workflows/cd.yml`, `docker-build` job:

1. The image is built and pushed to GHCR as usual.
2. [`anchore/sbom-action`](https://github.com/anchore/sbom-action) (Syft)
   scans the pushed image and emits an SPDX 2.3 JSON document:
   `sbom-backend.spdx.json` / `sbom-client.spdx.json`.
3. Each SBOM is uploaded as a workflow artifact (90-day retention).
4. On a tag push (`v*`), the `publish-sbom` job downloads both SBOMs and
   attaches them as release assets via `softprops/action-gh-release`.

This is separate from the `sbom: true` option already passed to
`docker/build-push-action` — that produces an in-registry **attestation**
tied to the image manifest (good for `docker buildx imagetools inspect` /
supply-chain verification), whereas the file here is a plain, downloadable
document meant for humans and SCA tooling that don't speak attestations.

## Consuming an SBOM

- **From a release**: download `sbom-<service>.spdx.json` from the release
  assets on the GitHub Releases page.
- **From a CI run** (pre-release / staging builds): the `sbom-<service>`
  artifact on the `docker-build` job of any CD run.
- **Scan it**: e.g. `grype sbom:sbom-backend.spdx.json` or feed it to your
  org's SCA/vulnerability-management tool of choice — it's standard SPDX
  JSON, not Traqora-specific.

## Adding a new image

If another service gets its own Dockerfile/image, add it to the
`docker-build` matrix in `cd.yml`; the SBOM generation, upload, and (for
tags) release-attachment steps apply to every entry in that matrix
automatically — no per-service wiring needed.
