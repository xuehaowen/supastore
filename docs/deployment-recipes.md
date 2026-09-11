# Deployment Recipes

Supastore is packaged as a standalone, zero-external-cache Next.js 15 application running with PostgreSQL and S3-compatible object storage.

## Target Resource Footprint
- **Memory Ceiling:** 256MB–512MB RAM for application container (`node server.js`).
- **CPU:** 0.5–1.0 vCPU.
- **Base Image:** Node.js 22 Alpine (<80MB compressed).

---

## 1. Docker Compose (Self-Hosted / VPS)

Run Supastore with local PostgreSQL via Docker Compose:

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Start services in background
docker compose up -d

# 3. Verify health
curl -f http://localhost:3000/api/health/ready
```

---

## 2. Coolify / CapRover / Dokku

1. **Build Pack:** Dockerfile (use the root `Dockerfile`).
2. **Port Mapping:** Expose container port `3000`.
3. **Environment Variables:**
   - `DATABASE_URL=postgresql://user:password@postgres-host:5432/dbname?sslmode=require`
   - `ADMIN_SETUP_SECRET=your_secure_random_string`
   - `BETTER_AUTH_SECRET=your_32_char_random_secret`
   - `BETTER_AUTH_URL=https://your-domain.com`
   - `ENABLE_OUTBOX_WORKER=true`
4. **Health Check:** `/api/health/ready` (HTTP 200).

---

## 3. Railway / Fly.io / Render

### Railway
1. Create a **PostgreSQL** database service.
2. Deploy the Supastore repository. Railway detects the `Dockerfile` automatically.
3. Link `DATABASE_URL` from the PostgreSQL service.
4. Set `BETTER_AUTH_URL` to your Railway public domain (`https://*.up.railway.app`).

### Fly.io
Deploy with `fly.toml`:
```toml
app = "supastore"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

---

## 4. Managed PostgreSQL (Supabase / Neon / AWS RDS)

When using connection poolers or serverless PostgreSQL:
- Ensure session isolation is configured for transactional locks (`SELECT ... FOR UPDATE`).
- Use direct connection string (port `5432` or session mode) rather than transaction mode poolers if row-level locking is required.
- Set `sslmode=require` in production `DATABASE_URL`.
