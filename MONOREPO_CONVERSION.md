# Monorepo Conversion

This document describes the conversion of Traqora from a multi-component repository to an npm workspaces monorepo.

## Changes Made

### 1. Directory Structure
- Moved `backend/` → `packages/backend/`
- Moved `client/` → `packages/client/`
- Created root `package.json` with workspaces configuration

### 2. Root Configuration
- Created `package.json` with npm workspaces setup
- Added shared devDependencies to root:
  - `@types/node`
  - `eslint`
  - `typescript`
  - `zod`
- Added workspace scripts for running commands across all packages

### 3. Package Updates
- **Backend** (`packages/backend/package.json`):
  - Removed shared dependencies (now hoisted to root)
  - Kept backend-specific dependencies
- **Client** (`packages/client/package.json`):
  - Removed shared dependencies (now hoisted to root)
  - Fixed package name to follow npm conventions (`traqora-client`)
  - **Temporarily removed** `@creit-tech/stellar-wallets-kit` (see Manual Steps)

### 4. Docker Configuration
- Updated `docker-compose.yml`:
  - Backend context: `./packages/backend`
  - Frontend context: `./packages/client`
- Updated `docker-compose.prod.yml`:
  - API context: `./packages/backend`
  - Frontend context: `./packages/client`
- Updated Dockerfiles:
  - Client: Switched from pnpm to npm
  - Added `--legacy-peer-deps` flag for React 19 compatibility

### 5. Dependency Management
- Installed all dependencies at root level using `npm install --legacy-peer-deps`
- Removed old lock files (pnpm-lock.yaml, package-lock.json from packages)
- Single `package-lock.json` at root manages all workspace dependencies

## New Structure

```
Traqora/
├── package.json (root with workspaces)
├── package-lock.json (single lock file)
├── packages/
│   ├── backend/
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── ...
│   └── client/
│       ├── package.json
│       ├── Dockerfile
│       └── ...
├── docker-compose.yml
├── docker-compose.prod.yml
└── ...
```

## Usage

### Running Commands

From the root directory:

```bash
# Install all dependencies
npm install --legacy-peer-deps

# Run development servers for all packages
npm run dev

# Build all packages
npm run build

# Run tests for all packages
npm run test

# Run linting for all packages
npm run lint

# Run type checking for all packages
npm run typecheck
```

### Running Individual Packages

```bash
# Backend only
npm run dev --workspace=packages/backend

# Client only
npm run dev --workspace=packages/client
```

### Docker

```bash
# Development
docker-compose up

# Production
docker-compose -f docker-compose.prod.yml up
```

## Manual Steps Required

### 1. JSR Package Issue

The `@creit-tech/stellar-wallets-kit` package was temporarily removed from `packages/client/package.json` because npm cannot resolve JSR packages directly. To restore this package:

**Option A: Use pnpm for the client package**
1. Install pnpm globally: `npm install -g pnpm`
2. Navigate to `packages/client/`
3. Run `pnpm install`
4. Update the Dockerfile to use pnpm again

**Option B: Find an alternative package**
1. Search for a non-JSR alternative to `@creit-tech/stellar-wallets-kit`
2. Update the client code to use the alternative
3. Add the alternative to `packages/client/package.json`

**Option C: Use a different package manager**
- Consider using yarn or pnpm at the root level instead of npm
- Update the root package.json and Dockerfiles accordingly

### 2. Code References

Check for any hardcoded paths in the codebase that reference the old directory structure:
- Import statements
- Configuration files
- Scripts
- Documentation

Update any references from:
- `./backend` → `./packages/backend`
- `./client` → `./packages/client`

### 3. CI/CD Pipelines

Update any CI/CD configurations (GitHub Actions, GitLab CI, etc.) to:
- Use the new directory structure
- Run npm commands from the root
- Update build and deployment paths

### 4. Documentation

Update project documentation to reflect the monorepo structure:
- README.md
- CONTRIBUTING.md
- Any setup guides
- API documentation

## Benefits of Monorepo

1. **Shared Dependencies**: Common packages are installed once at the root
2. **Unified Commands**: Run scripts across all packages with a single command
3. **Simplified CI/CD**: Single build process for the entire project
4. **Better Dependency Management**: Single lock file prevents version conflicts
5. **Easier Development**: Work on multiple packages simultaneously

## Troubleshooting

### Dependency Issues

If you encounter dependency resolution errors:
```bash
npm install --legacy-peer-deps
```

### Build Issues

If a specific package fails to build:
```bash
# Build individual package
npm run build --workspace=packages/backend
```

### Docker Issues

If Docker builds fail, ensure:
1. The Dockerfile context paths are correct
2. The package.json files are in the right locations
3. Dependencies are installed at the root level

## Notes

- The `--legacy-peer-deps` flag is used due to React 19 compatibility issues with some packages
- Consider upgrading to a package manager with better monorepo support (pnpm, yarn) in the future
- The contracts/ directory was not moved - consider if it should be part of the monorepo structure
