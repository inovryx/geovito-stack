# Geovito Strapi deployment (VPS ready)

This project is designed to run behind a reverse proxy (Nginx or Cloudflare Tunnel).
Strapi should bind to a private interface (127.0.0.1 or Docker localhost binding).

## Option A: Docker Compose (Strapi + Postgres)

Prereqs:
- Docker Engine + Compose plugin

Steps:
1) Create a production env file:
   - `cp .env.example .env`
   - Set `NODE_ENV=production`
   - Set `HOST=0.0.0.0`
   - Fill all secrets and database values
   - Keep `SEED_MOCK_ON_BOOT=false`
2) Build and run:
   - `cd deploy`
   - `docker compose up -d --build`
3) Validate:
   - `curl -I http://127.0.0.1:1337/admin`

Backups:
- Postgres dump:
  - `docker exec -t <db_container> pg_dump -U <user> -d <db> > backups/strapi.sql`
- Uploads:
  - `tar -czf backups/uploads.tgz public/uploads`

Restore:
- `psql -U <user> -d <db> < backups/strapi.sql`
- `tar -xzf backups/uploads.tgz -C public`

## Option B: PM2 + Postgres + Nginx

1) Install Postgres and create DB/user:
   - `sudo -u postgres psql`
   - `CREATE USER strapi WITH PASSWORD 'change_me';`
   - `CREATE DATABASE strapi OWNER strapi;`
2) Configure environment:
   - `cp .env.example .env`
   - Set `DATABASE_CLIENT=postgres` and DB creds
   - Set `HOST=127.0.0.1` (Nginx proxies to it)
   - Set `NODE_ENV=production`, `SEED_MOCK_ON_BOOT=false`
3) Build and run:
   - `npm ci`
   - `npm run build`
   - `pm2 start npm --name atlas-strapi -- start`
   - `pm2 save`
4) Reverse proxy (Nginx):
   - Use `deploy/nginx.conf` as a template
   - Point `server_name` to your domain
   - Restart Nginx and attach SSL via Cloudflare or certbot

Backups:
- Postgres: `pg_dump -U strapi -d strapi > backups/strapi.sql`
- Uploads: `tar -czf backups/uploads.tgz public/uploads`

Restore:
- `psql -U strapi -d strapi < backups/strapi.sql`
- `tar -xzf backups/uploads.tgz -C public`

Migration steps (moving to VPS):
1) Copy repo and `.env` (do not commit secrets).
2) Restore database and uploads.
3) Install dependencies and build.
4) Start Strapi; migrations run automatically at boot.

Firewall ports:
- Allow: 22 (SSH), 80/443 (HTTP/HTTPS)
- Keep 1337 closed to public; proxy internally
- Allow 5432 only if Postgres is accessed remotely (not recommended)
