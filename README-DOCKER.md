# SceneMind AI - Docker Production Deployment Guide

A production-ready Docker Compose environment for SceneMind AI featuring **PostgreSQL 16 with `pgvector`**, **FFmpeg video processing**, and an **accelerated Nginx reverse proxy**.

---

## 🏗️ Architecture Overview

| Service | Technology | Role |
| :--- | :--- | :--- |
| **`nginx`** | Nginx Alpine | **Zero-copy video streaming (`sendfile`)**, byte-range requests (HTTP 206), 4GB file upload support, SSL termination, and reverse proxy. |
| **`app`** | Next.js 14 + Node 20 + FFmpeg | Core Web UI, Semantic Search, Timestamp Verification, FFmpeg video frame extraction & clipping pipeline. |
| **`postgres`** | PostgreSQL 16 + `pgvector` | Relational metadata store + high-dimensional vector similarity indexing for scene visual embeddings. |
| **`redis`** | Redis 7 Alpine | High-speed cache and background queue for processing jobs. |

---

## 🔑 Default Credentials

All services are pre-configured with the following credentials (editable in `.env.docker` or `docker-compose.yml`):

### PostgreSQL (`postgres` service)
* **Host (internal):** `postgres:5432`
* **Host (external):** `localhost:5432`
* **Database:** `scenemind_db`
* **Username:** `scenemind_admin`
* **Password:** `scenemind_vault_secure_2026`
* **Connection String:**
  ```text
  postgresql://scenemind_admin:scenemind_vault_secure_2026@postgres:5432/scenemind_db
  ```

### Redis (`redis` service)
* **Host (internal):** `redis:6379`
* **Host (external):** `localhost:6379`
* **Password:** `scenemind_redis_vault_2026`
* **Connection String:**
  ```text
  redis://:scenemind_redis_vault_2026@redis:6379
  ```

---

## 🚀 Quickstart Commands

### 1. Build and Start All Services
```bash
docker compose --env-file .env.docker up -d --build
```

### 2. View Service Status
```bash
docker compose ps
```

### 3. Check Real-Time Logs
```bash
# All logs
docker compose logs -f

# App logs
docker compose logs -f app

# Nginx logs
docker compose logs -f nginx
```

### 4. Stop All Services
```bash
docker compose down
```

### 5. Access the Application
* **Web UI / Studio:** `http://localhost` (via Nginx on port 80)
* **PostgreSQL:** `localhost:5432`
* **Redis:** `localhost:6379`

---

## ⚡ Why Nginx is Configured for Video Streaming

In this Docker setup, Nginx handles `/api/media/` directly using kernel-level `sendfile` and byte-range slicing:
1. **Instant Seeking (<10ms):** Bypasses Node.js process streams and responds directly from disk cache.
2. **Up to 4GB Uploads:** `client_max_body_size 4096M;` allows huge high-definition videos to be uploaded without payload errors.
3. **No Dev Server Lag:** Resolves the 10-20s buffering delay seen in local development servers.
