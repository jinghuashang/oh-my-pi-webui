#!/bin/sh
set -e

echo "========================================================"
echo "          Starting Oh My Pi WebUI (omp-webui)           "
echo "========================================================"

# 1. Check and auto-install official omp binary if missing
if ! command -v omp >/dev/null 2>&1; then
  echo "[omp-webui] ⚠️ omp binary not found in PATH, auto-installing from official repository..."
  if curl -fsSL https://omp.sh/install | PI_INSTALL_DIR=/usr/local/bin sh; then
    echo "[omp-webui] ✓ Successfully auto-installed official omp engine!"
  else
    echo "[omp-webui] ✗ Failed to auto-install omp from omp.sh. Please check your network or mount omp from host."
  fi
fi

# Print active OMP version
if command -v omp >/dev/null 2>&1; then
  echo "[omp-webui] ✓ OMP engine ready: $(omp --version 2>/dev/null || echo 'installed')"
else
  echo "[omp-webui] ⚠️ OMP command could not be verified."
fi

# 2. Ensure data, workspaces and logs directories exist
mkdir -p /root/.omp/agent /workspaces /app/logs

# 3. Auto-initialize default omp configuration if config.yml is missing
CONFIG_FILE="/root/.omp/agent/config.yml"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[omp-webui] ⚙️ Initializing default OMP config at $CONFIG_FILE (mounted at host ./data/agent/config.yml)..."
  cat <<'EOF' > "$CONFIG_FILE"
# Oh My Pi (omp) 运行时配置文件
# 该文件映射在宿主机的 ./data/agent/config.yml，可直接在宿主机进行查看与配置
setupVersion: 2

# 1. 默认模型角色分派 (可通过 WebUI 设置面板或直接在此修改)
modelRoles:
  default: auto
  smol: auto
  slow: auto
  plan: auto
  task: auto
  vision: auto

# 2. 界面与推理交互偏好
composer:
  shape: claude
defaultThinkingLevel: auto
hideThinkingBlock: false
modelRoleStorage: global

# 3. 开发者与系统权限
dev:
  autoqaConsent: granted
bash:
  enabled: true
EOF
  echo "[omp-webui] ✓ Default config.yml initialized."
fi

# 4. Check for model API Keys from environment and print friendly notice
if [ -n "$OPENAI_API_KEY" ] || [ -n "$ANTHROPIC_API_KEY" ] || [ -n "$DEEPSEEK_API_KEY" ] || [ -n "$GEMINI_API_KEY" ]; then
  echo "[omp-webui] ✓ Detected model provider API keys passed via environment."
fi

echo "[omp-webui] 🚀 Launching WebUI server on http://${HOST:-0.0.0.0}:${PORT:-8172}..."
exec "$@"
