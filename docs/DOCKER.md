# BrandTracker Docker Guide

## Overview

BrandTracker uses Docker to containerize both the frontend and backend services, ensuring consistent environments across development and production.

## Docker Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Host                        │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │         brandtracker Network (bridge)       │    │
│  │                                              │    │
│  │  ┌──────────────────┐  ┌──────────────────┐│    │
│  │  │  Frontend         │  │  Backend         ││    │
│  │  │  Container        │  │  Container       ││    │
│  │  │  (Next.js)        │  │  (FastAPI)       ││    │
│  │  │  Port: 3000       │  │  Port: 8000      ││    │
│  │  │  Internal         │  │  Internal        ││    │
│  │  └──────────────────┘  └──────────────────┘│    │
│  │          │                      │            │    │
│  └──────────┼──────────────────────┼───────────┘    │
│             │                      │                 │
│         Exposed                Exposed               │
│         3011:3000             8011:8000              │
└─────────────┼──────────────────────┼─────────────────┘
              │                      │
         Host Access              Host Access
```

## Docker Files

### 1. Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Key Points**:
- Base image: `python:3.11-slim` (lightweight)
- Working directory: `/app`
- Dependencies installed first (layer caching)
- Application code copied after
- Binds to `0.0.0.0` for external access
- No `--reload` flag (production mode)

### 2. Frontend Dockerfile (`frontend/Dockerfile`)

```dockerfile
FROM node:18-alpine AS build

WORKDIR /app

# Build arguments for environment variables
ARG NEXT_PUBLIC_API_URL=/brandtracker
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

# Set environment variables for build
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Build Next.js application
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.js ./next.config.js

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
```

**Key Points**:
- **Multi-stage build**: Build stage + production stage (smaller image)
- **Build arguments**: Environment variables passed at build time
- **Stage 1 (build)**: Installs dependencies, builds Next.js
- **Stage 2 (production)**: Only production artifacts, no source code
- **npm ci**: Clean install (faster, more reliable than npm install)
- **npm start**: Runs production server

### 3. Docker Compose - Development (`docker-compose.yml`)

```yaml
services:
  frontend:
    build:
      context: ./frontend
      args:
        - NEXT_PUBLIC_API_URL=/brandtracker
        - NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
        - NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
    container_name: brandtracker-frontend
    restart: unless-stopped
    ports:
      - "3011:3000"  # Expose on different port to avoid conflicts
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
    depends_on:
      - backend
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/brandtracker"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  backend:
    build: ./backend
    container_name: brandtracker-backend
    restart: unless-stopped
    ports:
      - "8011:8000"
    env_file:
      - ./backend/.env
    volumes:
      - backend-data:/app/data
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

volumes:
  backend-data:
```

**Key Points**:
- **Development ports**: 3011 (frontend), 8011 (backend)
- **Build args**: Supabase config passed at build time
- **env_file**: Backend loads `.env` from file
- **depends_on**: Frontend waits for backend
- **restart policy**: `unless-stopped` (auto-restart on failure)
- **healthchecks**: Monitor container health
- **volumes**: Persist backend data

### 4. Docker Compose - Production (`docker-compose.prod.yml`)

```yaml
services:
  frontend:
    build:
      context: ./frontend
      args:
        - NEXT_PUBLIC_API_URL=/brandtracker/api
        - NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
        - NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
    container_name: brandtracker-frontend
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
    depends_on:
      - backend
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/brandtracker"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - brandtracker

  backend:
    build: ./backend
    container_name: brandtracker-backend
    restart: unless-stopped
    env_file:
      - ./backend/.env
    volumes:
      - backend-data:/app/data
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
    networks:
      - brandtracker

volumes:
  backend-data:

networks:
  brandtracker:
    driver: bridge
```

**Key Points**:
- **No port exposure**: Nginx handles external access
- **Custom network**: Isolates containers
- **Production API URL**: `/brandtracker/api` (full path)

## Building Images

### Build All Services

```bash
# Development
docker compose build

# Production
docker compose -f docker-compose.prod.yml build

# Force rebuild (no cache)
docker compose build --no-cache

# Build specific service
docker compose build backend
docker compose build frontend
```

### Build Arguments

Frontend requires build-time arguments:

```bash
docker compose build --build-arg NEXT_PUBLIC_API_URL=/brandtracker \
                      --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
                      --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
```

**Note**: These are already defined in `docker-compose.yml`, so you typically don't need to pass them manually.

## Running Containers

### Start Services

```bash
# Development (foreground)
docker compose up

# Development (background/detached)
docker compose up -d

# Production
docker compose -f docker-compose.prod.yml up -d

# Rebuild and start
docker compose up --build

# Start specific service
docker compose up backend
```

### Stop Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes
docker compose down -v

# Production
docker compose -f docker-compose.prod.yml down
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart backend
docker compose restart frontend
```

## Monitoring & Debugging

### View Logs

```bash
# All services (follow mode)
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend

# Last N lines
docker compose logs --tail=100 backend

# Since timestamp
docker compose logs --since="2024-01-01T00:00:00"
```

### Check Container Status

```bash
# List running containers
docker compose ps

# Detailed status
docker compose ps -a

# Check resource usage
docker stats

# Inspect container
docker inspect brandtracker-backend
```

### Execute Commands in Containers

```bash
# Open shell in container
docker compose exec backend bash
docker compose exec frontend sh  # Alpine uses sh, not bash

# Run one-off command
docker compose exec backend python -c "print('Hello')"

# Run as root
docker compose exec -u root backend bash
```

### Access Container Logs

```bash
# Via Docker Compose
docker compose logs backend

# Via Docker directly
docker logs brandtracker-backend

# Follow logs in real-time
docker logs -f brandtracker-backend
```

## Health Checks

### Backend Health Check

```yaml
healthcheck:
  test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/')"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 20s
```

**What it does**:
- Checks if backend responds on `http://localhost:8000/`
- Runs every 30 seconds
- Allows 20 seconds startup time before first check
- Retries 3 times before marking unhealthy

**Check status**:
```bash
docker compose ps  # Shows health status
docker inspect --format='{{.State.Health.Status}}' brandtracker-backend
```

### Frontend Health Check

```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/brandtracker"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

**What it does**:
- Checks if frontend responds on `/brandtracker` route
- Allows 40 seconds startup time (Next.js takes longer to start)

## Volumes

### Backend Data Volume

```yaml
volumes:
  - backend-data:/app/data
```

**Purpose**: Persist any local data created by backend (if needed)

**Inspect volume**:
```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect brand_tracker_backend-data

# Backup volume
docker run --rm -v brand_tracker_backend-data:/data \
           -v $(pwd):/backup alpine \
           tar czf /backup/backend-data-backup.tar.gz /data

# Restore volume
docker run --rm -v brand_tracker_backend-data:/data \
           -v $(pwd):/backup alpine \
           tar xzf /backup/backend-data-backup.tar.gz -C /
```

## Networking

### Development (Default Bridge)

In development, Docker uses the default bridge network with automatic port mapping:
- Frontend: `localhost:3011` → `container:3000`
- Backend: `localhost:8011` → `container:8000`

### Production (Custom Bridge Network)

Production uses a custom network named `brandtracker`:

```yaml
networks:
  brandtracker:
    driver: bridge
```

**Benefits**:
- Container isolation
- Internal DNS (containers can reach each other by service name)
- No port exposure (nginx handles external access)

**Container communication**:
```bash
# Frontend can reach backend via:
http://backend:8000
```

## Environment Variables

### Build-Time vs Runtime

| Variable | When Set | Where Used |
|----------|----------|------------|
| `NEXT_PUBLIC_*` | **Build time** | Baked into frontend bundle |
| `ANTHROPIC_API_KEY` | **Runtime** | Loaded when backend starts |
| `SUPABASE_URL` | **Both** | Frontend (build), Backend (runtime) |

### Frontend (Build-Time)

Must be passed as `build.args` in `docker-compose.yml`:

```yaml
build:
  context: ./frontend
  args:
    - NEXT_PUBLIC_API_URL=/brandtracker
    - NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
    - NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
```

### Backend (Runtime)

Loaded from `backend/.env` file:

```yaml
env_file:
  - ./backend/.env
```

**Alternatively**, pass as environment variables:

```yaml
environment:
  - ANTHROPIC_API_KEY=sk-ant-xxx
  - SUPABASE_URL=https://xxx.supabase.co
  - SUPABASE_SERVICE_KEY=ey...
```

## Troubleshooting

### Container Won't Start

**Check logs**:
```bash
docker compose logs backend
```

**Common issues**:
- Missing environment variables → Check `.env` file
- Port already in use → Change port or stop conflicting service
- Build failed → Check Dockerfile syntax

### Container Starts But Crashes

**Check exit code**:
```bash
docker compose ps -a
```

**Inspect container**:
```bash
docker inspect brandtracker-backend
```

**Common issues**:
- Python dependency errors → Rebuild with `--no-cache`
- Database connection failed → Check Supabase credentials
- Missing files → Ensure all files copied in Dockerfile

### Cannot Connect to Container

**From host**:
```bash
# Check ports are exposed
docker compose ps

# Test connection
curl http://localhost:8011/
```

**Between containers**:
```bash
# Exec into frontend container
docker compose exec frontend sh

# Try reaching backend (use service name, not localhost)
wget -O- http://backend:8000/
```

**Common issues**:
- Wrong port mapping → Check `docker-compose.yml`
- Firewall blocking → Check firewall rules
- Container not on same network → Verify network configuration

### Health Check Failing

**Check health status**:
```bash
docker inspect --format='{{.State.Health.Status}}' brandtracker-backend
```

**View health check logs**:
```bash
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' brandtracker-backend
```

**Common issues**:
- Wrong endpoint → Backend uses `/` not `/api/sessions`
- Start period too short → Increase `start_period`
- Wrong command → Backend uses `python3` not `python`

### Build Fails

**Frontend: "supabaseUrl is required"**:
- Solution: Pass Supabase vars as build args

**Backend: "Module not found"**:
- Solution: Rebuild with `--no-cache`
- Check `requirements.txt` is complete

**Frontend: "/app/public": not found**:
- Solution: Create `frontend/public/` directory

### High Memory Usage

**Check resource usage**:
```bash
docker stats
```

**Limit container resources**:
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

## Best Practices

### 1. Layer Caching

Copy dependency files first, then source code:

```dockerfile
# ✅ Good: Dependencies cached
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .

# ❌ Bad: Full rebuild on any file change
COPY . .
RUN pip install -r requirements.txt
```

### 2. Multi-Stage Builds

Use for frontend to reduce image size:

```dockerfile
# Build stage (large)
FROM node:18-alpine AS build
RUN npm run build

# Production stage (small)
FROM node:18-alpine
COPY --from=build /app/.next ./.next
```

### 3. .dockerignore

Create `.dockerignore` files to exclude unnecessary files:

**Backend** (`.backend/.dockerignore`):
```
__pycache__
*.pyc
.env.example
.git
.vscode
venv/
```

**Frontend** (`frontend/.dockerignore`):
```
node_modules
.next
.git
.vscode
*.log
```

### 4. Secrets Management

**Never** commit secrets to Docker images:
- Use `env_file` for sensitive data
- Mount secrets as volumes
- Use Docker secrets (Swarm) or Kubernetes secrets

### 5. Production Optimization

- Use slim/alpine base images
- Remove dev dependencies
- Use multi-stage builds
- Set `NODE_ENV=production`
- Don't use `--reload` flag

## CI/CD Integration

### Build in CI

```yaml
# GitHub Actions example
- name: Build Docker images
  run: docker compose build

- name: Run tests
  run: docker compose run backend pytest

- name: Push to registry
  run: |
    docker tag brandtracker-backend registry.example.com/brandtracker-backend:${{ github.sha }}
    docker push registry.example.com/brandtracker-backend:${{ github.sha }}
```

## Next Steps

- Read [DEPLOYMENT.md](../DEPLOYMENT.md) for production deployment with Nginx
- Read [DEVELOPMENT.md](DEVELOPMENT.md) for local development without Docker
- Read [ARCHITECTURE.md](ARCHITECTURE.md) for system architecture overview
