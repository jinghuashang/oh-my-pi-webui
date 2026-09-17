# ==============================================================================
# Stage 1: Build Frontend, Backend & Bridge
# ==============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install native build tools for node-pty and better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Activate pnpm
RUN npm install -g pnpm@10.18.3

# Copy workspace dependency manifests first to leverage Docker layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY bridge/package.json ./bridge/
COPY web/package.json ./web/

RUN pnpm install --frozen-lockfile

# Copy full application source
COPY . .

# Build all workspace packages: bridge (tsc), backend (nest build), web (vite build)
RUN pnpm build

# Prune development dependencies to keep the production image lean
RUN pnpm prune --prod

# ==============================================================================
# Stage 2: Production Runtime with OMP Engine
# ==============================================================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install runtime utilities for omp and shell operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    procps \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install official Oh My Pi (omp) binary to /usr/local/bin
RUN curl -fsSL https://omp.sh/install | PI_INSTALL_DIR=/usr/local/bin sh \
    && omp --version

# Default environment configuration
ENV NODE_ENV=production \
    PORT=8172 \
    HOST=0.0.0.0 \
    WEBUI_HOME=/root/.omp \
    WEBUI_DB_PATH=/root/.omp/webui.sqlite \
    BRIDGE_BIN=bridge/dist/index.js \
    OMP_BIN=/usr/local/bin/omp \
    OMP_CWD=/workspaces \
    OMP_SESSION_DIR=/root/.omp/agent/sessions \
    PATH="/usr/local/bin:$PATH"

# Copy built dependencies and distribution artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/version.json* ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/public ./public
COPY --from=builder /app/bridge/dist ./bridge/dist
COPY --from=builder /app/bridge/package.json ./bridge/package.json

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Pre-create data and workspace directories
RUN mkdir -p /root/.omp /workspaces /app/logs

# Expose WebUI port
EXPOSE 8172

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:8172/api/status || exit 1

# Data persistence volumes
VOLUME ["/root/.omp", "/workspaces"]

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
