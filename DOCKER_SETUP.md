# Traqora Local Development with Docker

This setup provides a complete local development environment for Traqora using Docker Compose. It includes all necessary services, including a local Stellar node.

## Services Included

- **PostgreSQL**: Primary database for the backend.
- **Redis**: Cache and background job processing.
- **Stellar Quickstart**: Local Stellar node running in standalone mode with Soroban RPC enabled.
- **Backend API**: Node.js Express server with hot-reload.
- **Frontend Client**: Next.js application with hot-reload.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Getting Started

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone https://github.com/your-repo/traqora.git
   cd traqora
   ```

2. **Set up environment variables**:
   The `docker-compose.yml` already contains default environment variables for local development. If you need to customize them, you can create a `.env` file in the root directory.

3. **Start the services**:
   ```bash
   docker-compose up -d
   ```
   This will build the images and start all containers in the background.

4. **Verify the setup**:
   - Backend API: [http://localhost:3001/health](http://localhost:3001/health)
   - Frontend Client: [http://localhost:3000](http://localhost:3000)
   - Stellar Horizon: [http://localhost:8000](http://localhost:8000)
   - Stellar Soroban RPC: [http://localhost:8000/soroban/rpc](http://localhost:8000/soroban/rpc)

## Development

### Hot-Reloading

Both the backend and frontend are configured with volume mounts, which means any changes you make to the code on your local machine will be reflected inside the containers immediately.

- **Backend**: Uses `ts-node-dev` to restart the server on file changes.
- **Frontend**: Uses Next.js built-in development server with Fast Refresh.

### Database Management

The PostgreSQL database data is persisted in a Docker volume named `postgres_data`. To reset the database, you can run:
```bash
docker-compose down -v
docker-compose up -d
```

### Logs

To view logs for all services:
```bash
docker-compose logs -f
```

To view logs for a specific service:
```bash
docker-compose logs -f backend
```

## Stopping Services

To stop all services:
```bash
docker-compose stop
```

To stop and remove all containers:
```bash
docker-compose down
```

## Technical Notes

- **Stellar Node**: The `stellar/quickstart` image is used in `--local` mode. This provides a clean slate for development.
- **Health Checks**: Containers have health checks to ensure dependencies (like DB and Redis) are ready before the backend starts.
- **Multi-stage Builds**: Dockerfiles use multi-stage builds to optimize for both development and production (though production builds require additional configuration for CI/CD).
