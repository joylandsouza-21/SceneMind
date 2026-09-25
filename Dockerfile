# ==============================================================================
# Multi-stage Dockerfile for SceneMind Video AI Studio
# Includes Node.js 20, FFmpeg, and production optimizations
# ==============================================================================

FROM node:20-alpine AS base

# Install system dependencies: FFmpeg, build tools, curl
RUN apk add --no-cache \
    ffmpeg \
    libc6-compat \
    python3 \
    make \
    g++ \
    curl

WORKDIR /app

# ------------------------------------------------------------------------------
# Dependencies Stage
# ------------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

# ------------------------------------------------------------------------------
# Builder Stage
# ------------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/public


# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Set a dummy DATABASE_URL so the build uses PgStore (pure JS) instead of
# better-sqlite3 (native binary), which causes SIGSEGV on Alpine at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

RUN npm run build

# ------------------------------------------------------------------------------
# Production Runner Stage
# ------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Create persistent storage directories
RUN mkdir -p /app/storage/videos /app/storage/clips /app/storage/thumbnails /app/data

# Copy build artifacts and dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prompts ./prompts
# Note: /app/data is already created by mkdir -p above; excluded from build context via .dockerignore

# Expose Next.js port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["npm", "run", "start"]
