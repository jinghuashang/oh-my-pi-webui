#!/bin/sh
set -e

echo "========================================================"
echo "          Starting Oh My Pi WebUI (omp-webui)           "
echo "========================================================"

# 1. Check and restore persistent omp binary from /root/.omp/bin if present
mkdir -p /root/.omp/bin /root/.omp/agent /workspaces /app/logs

if [ -f "/root/.omp/bin/omp" ]; then
  chmod +x /root/.omp/bin/omp
  PERSISTENT_VER=$(/root/.omp/bin/omp --version 2>/dev/null || echo '')
  if [ -n "$PERSISTENT_VER" ]; then
    echo "[omp-webui] 📦 Found persisted OMP binary in data volume: $PERSISTENT_VER"
    cp -f /root/.omp/bin/omp /usr/local/bin/omp
    chmod +x /usr/local/bin/omp
  fi
fi

# If omp binary missing in PATH, install from official source with mirror fallback
if ! command -v omp >/dev/null 2>&1; then
  echo "[omp-webui] ⚠️ omp binary not found in PATH, installing..."
  INSTALLED=0
  for MIRROR_PREFIX in "" "https://ghproxy.net/" "https://gh.ddlc.top/"; do
    if [ -n "$MIRROR_PREFIX" ]; then
      echo "[omp-webui] 🔄 Trying installation with mirror: ${MIRROR_PREFIX}..."
      if curl -fsSL "${MIRROR_PREFIX}https://omp.sh/install" | PI_INSTALL_DIR=/usr/local/bin sh 2>/dev/null; then
        INSTALLED=1
        break
      fi
    else
      if curl -fsSL https://omp.sh/install | PI_INSTALL_DIR=/usr/local/bin sh 2>/dev/null; then
        INSTALLED=1
        break
      fi
    fi
  done

  # Fallback: direct binary download from releases via mirror if script fails
  if [ "$INSTALLED" -eq 0 ]; then
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64|amd64) OMP_ARCH="x64" ;;
      aarch64|arm64) OMP_ARCH="arm64" ;;
      *) OMP_ARCH="x64" ;;
    esac
    for DL_MIRROR in "https://ghproxy.net/" "https://gh.ddlc.top/" "https://hub.gitmirror.com/"; do
      echo "[omp-webui] ⬇️ Downloading OMP release binary via ${DL_MIRROR}..."
      if curl -fsSL -o /usr/local/bin/omp "${DL_MIRROR}https://github.com/can1357/oh-my-pi/releases/latest/download/omp-linux-${OMP_ARCH}" 2>/dev/null; then
        chmod +x /usr/local/bin/omp
        if /usr/local/bin/omp --version >/dev/null 2>&1; then
          INSTALLED=1
          echo "[omp-webui] ✓ Successfully installed official OMP binary via mirror!"
          break
        fi
      fi
    done
  fi

  if [ "$INSTALLED" -eq 1 ]; then
    echo "[omp-webui] ✓ Successfully auto-installed official omp engine!"
  else
    echo "[omp-webui] ✗ Failed to auto-install omp. Please check network or mount binary to ./data/bin/omp."
  fi
fi
# Always sync active /usr/local/bin/omp back to persistent /root/.omp/bin/omp
if command -v omp >/dev/null 2>&1; then
  cp -f "$(which omp)" /root/.omp/bin/omp 2>/dev/null || true
  chmod +x /root/.omp/bin/omp 2>/dev/null || true
  echo "[omp-webui] ✓ OMP engine ready: $(omp --version 2>/dev/null || echo 'installed') (persisted in ./data/bin/omp)"
else
  echo "[omp-webui] ⚠️ OMP command could not be verified."
fi

# 2. Restore persistent WebUI version/build overlay from /root/.omp/webui_overlay if present
if [ -d "/root/.omp/webui_overlay" ]; then
  echo "[omp-webui] 📦 Found persisted WebUI build overlay in data volume. Restoring..."
  cp -rf /root/.omp/webui_overlay/* /app/ 2>/dev/null || true
fi

if [ -f "/root/.omp/version.json" ]; then
  cp -f /root/.omp/version.json /app/version.json 2>/dev/null || true
  cp -f /root/.omp/version.json /app/dist/version.json 2>/dev/null || true
fi

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
