# BrandTracker Production Deployment Guide

## Prerequisites

- A server with Docker and Docker Compose installed
- Domain: `driftwoodstudios.se` pointing to your server
- Nginx installed for reverse proxy
- SSL certificate (use Let's Encrypt/Certbot)

## Step 1: Prepare the Server

```bash
# Install Docker and Docker Compose
sudo apt update
sudo apt install docker.io docker-compose nginx certbot python3-certbot-nginx

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

## Step 2: Clone and Configure

```bash
# Clone the repository
git clone https://github.com/Leijoma/brand_tracker.git
cd brand_tracker

# Ensure backend .env has production Supabase credentials
# The .env file should already be configured correctly
```

## Step 3: Setup SSL Certificate

```bash
# Get SSL certificate from Let's Encrypt
sudo certbot --nginx -d driftwoodstudios.se
```

## Step 4: Configure Nginx

```bash
# Copy the nginx configuration
sudo cp nginx.conf.example /etc/nginx/sites-available/brandtracker

# Create symlink
sudo ln -s /etc/nginx/sites-available/brandtracker /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

## Step 5: Deploy with Docker Compose

```bash
# Build and start containers
docker compose -f docker-compose.prod.yml up -d --build

# Check logs
docker compose -f docker-compose.prod.yml logs -f

# Check status
docker compose -f docker-compose.prod.yml ps
```

## Step 6: Verify Deployment

1. Visit: `https://driftwoodstudios.se/brandtracker`
2. Test signup - you should receive an email
3. Click the verification link - should redirect to `https://driftwoodstudios.se/brandtracker`
4. Test login functionality

## Updating the Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart containers
docker compose -f docker-compose.prod.yml up -d --build

# Clean up old images
docker image prune -f
```

## Monitoring

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# View backend logs only
docker compose -f docker-compose.prod.yml logs -f backend

# View frontend logs only
docker compose -f docker-compose.prod.yml logs -f frontend

# Check container resource usage
docker stats
```

## Backup

```bash
# Backup is handled by Supabase cloud
# All data is stored in Supabase PostgreSQL
# To backup local volumes (optional):
docker run --rm -v brandtracker_backend-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/backend-data-backup.tar.gz /data
```

## Troubleshooting

### Containers won't start
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs

# Restart containers
docker compose -f docker-compose.prod.yml restart
```

### Email verification not working
1. Check Supabase Dashboard → Authentication → URL Configuration
2. Verify Site URL is: `https://driftwoodstudios.se/brandtracker`
3. Verify Redirect URLs includes: `https://driftwoodstudios.se/brandtracker/**`

### Cannot connect to backend
1. Check nginx configuration
2. Verify containers are running: `docker compose ps`
3. Check backend logs: `docker compose logs backend`

## Environment Variables

### Frontend (build-time)
- `NEXT_PUBLIC_API_URL=/brandtracker/api` - API endpoint
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase publishable key

### Backend (runtime)
- `ANTHROPIC_API_KEY` - Claude API key
- `OPEN_AI_API_KEY` - OpenAI API key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role secret

## URLs

- **Production**: https://driftwoodstudios.se/brandtracker
- **Frontend Container**: http://localhost:3011 (local testing)
- **Backend Container**: http://localhost:8011 (local testing)
- **Supabase Dashboard**: https://supabase.com/dashboard/project/wrcrzbwhwcdraifmxkyb
