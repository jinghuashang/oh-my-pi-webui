<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="image/Dark%20mode.jpeg">
    <source media="(prefers-color-scheme: light)" srcset="image/Light%20mode.jpeg">
    <img src="image/Light%20mode.jpeg" alt="Oh My Pi WebUI" width="880">
  </picture>
</p>

<p align="center">
  <strong><a href="https://github.com/can1357/oh-my-pi">Oh My Pi (omp)</a> 的 Web 前端界面</strong>
</p>

<p align="center">
  <a href="https://github.com/can1357/oh-my-pi"><img src="https://img.shields.io/badge/Powered%20by-Oh%20My%20Pi-E05735?style=flat&colorA=222222" alt="Oh My Pi"></a>
  <a href="https://github.com/jinghuashang/oh-my-pi-webui/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-58A6FF?style=flat&colorA=222222" alt="License"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%206-61DAFB?style=flat&colorA=222222&logo=react&logoColor=black" alt="React 19"></a>
  <a href="https://nestjs.com"><img src="https://img.shields.io/badge/Backend-NestJS%20%7C%20Socket.IO-E0234E?style=flat&colorA=222222&logo=nestjs&logoColor=white" alt="NestJS"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/UI-TailwindCSS%20%7C%20shadcn-38B2AC?style=flat&colorA=222222&logo=tailwind-css&logoColor=white" alt="TailwindCSS"></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&colorA=222222&logo=docker&logoColor=white" alt="Docker"></a>
</p>

---

基于 [Oh My Pi (omp)](https://github.com/can1357/oh-my-pi) 的 Web 前端服务。支持多会话并发、消息版本分支、树形文件管理、PTY 交互终端、审批流程、MCP 商店与多 GitHub 镜像加速。

**60+** 模型服务商 · **31+** 原生工具 · **多线程并发** · **MCP 商店** · **Docker 容器化**

---

## 快速安装与部署

### 方式一：Docker Compose（推荐）

容器启动时自动检查并安装当前最新版 OMP 引擎。宿主机 `./data` 目录映射至容器内 `/root/.omp`，持久化配置文件与数据库。

```bash
# 1. 克隆代码仓库
git clone https://github.com/jinghuashang/oh-my-pi-webui.git
cd oh-my-pi-webui

# 2. 构建并启动容器
docker compose up -d --build

# 3. 查看运行日志
docker compose logs -f
```

服务默认运行在 `http://localhost:8172`，初次访问引导创建管理员账号与密码。

---

### 方式二：Docker 原生运行

```bash
docker build -t oh-my-pi-webui:latest .

docker run -d \
  --name oh-my-pi-webui \
  --restart unless-stopped \
  -p 8172:8172 \
  -e WEBUI_API_KEY=change-me-to-a-long-random-string \
  -v $(pwd)/data:/root/.omp \
  -v $(pwd)/workspaces:/workspaces \
  oh-my-pi-webui:latest
```

---

### 方式三：本地开发环境运行

运行环境：Node.js ≥ 22，pnpm ≥ 10，已全局安装 `omp` CLI。

```bash
pnpm install
cp .env.example .env
pnpm build
pnpm start
```

---

## 核心特性 · _Features_

### 01 · 多线程并发会话与消息版本分支

每个会话拥有独立工作区（`cwd`）与上下文。支持对历史消息进行编辑派生新版本，并在版本间切换；提供分支拓扑图可视化展示会话演进。

### 02 · 项目管理与 GitHub 仓库克隆

- **新建项目**：在 `./data/projects/<项目名>` 创建物理目录，自动执行 `git init` 并加入工作区白名单；
- **GitHub 克隆**：支持输入 Git URL 或 `owner/repo`，支持指定分支与 `--depth 1` 浅克隆，完成后自动创建会话并投递初始需求。

### 03 · MCP 扩展商店与 GitHub 镜像加速

位于「集成」模块，内置 5 个常用 MCP 服务预设，支持一键安装、启用/禁用与卸载：
- **Exa Search (`exa`)**：网页检索与内容抓取；
- **Context7 Docs (`context7`)**：技术库与开发框架官方文档检索；
- **Playwright Browser (`playwright`)**：无头浏览器网页操作；
- **DeepWiki AI (`deepwiki`)**：GitHub 仓库 Wiki 与代码分析；
- **Serena Assistant (`serena`)**：IDE 语义代码分析与会话记忆管理。

内置多镜像节点（`ghfast.top`、`ghproxy.net`、`hub.gitmirror.com`、`kkgithub.com`），安装含 GitHub 依赖的 MCP 服务时自动改写下载地址。

### 04 · 流式交互、审批流程与 Git 状态

- **流式推送**：基于 Socket.IO 实时推送思考过程折叠块、内容增量与工具调用卡片；
- **审批卡片**：命令执行与关键文件变更通过卡片进行权限确认，支持 CAS 防冲突；
- **Git 状态**：展示当前分支、未提交变更统计与提交操作。

### 05 · PTY 交互终端与文件管理

- **Web PTY 终端**：基于 xterm.js 与 node-pty，支持交互式命令运行与 ANSI 彩色渲染；
- **Monaco 编辑器与 Diff**：树形文件浏览器，支持文件查看、在线编辑与 Git 分栏差异比对。

### 06 · OMP 引擎版本与更新检测

侧边栏底部常驻显示当前本地 OMP 引擎版本。支持检测官方发布的新版本，并提供在线升级接口与终端升级命令。

### 07 · 设置管理与模型分派

- 与 OMP CLI 对齐的 11 个设置分区；
- 支持为不同智能体角色（主模型、快速模型、深度推理模型、规划模型）可视化分派模型配置。

### 08 · 本地 SQLite 存储与安全机制

- **密码存储**：使用 Node.js 原生 `scrypt`（16 字节随机盐 + 64 字节派生）单向哈希；
- **恒定时间校验**：API Key 与密码比对使用 `crypto.timingSafeEqual`，配合滑动窗口限流防暴力破解。

---

## 架构设计

系统分为前端界面、后端服务、协议适配层与 OMP 核心四个层次：

```text
┌────────────────────────────────────────────────────────┐
│               Web 前端 (React 19 + Vite)                │
│    Chat Timeline · FileTree · Terminal · MCP Store     │
└───────────────────────────▲────────────────────────────┘
                            │ REST + Socket.IO
┌───────────────────────────▼────────────────────────────┐
│              后端业务服务 (NestJS + Fastify)             │
│    Auth · Projects · MCP · Files · Terminal · Update   │
└───────────────────────────▲────────────────────────────┘
                            │ stdio JSON-RPC
┌───────────────────────────▼────────────────────────────┐
│             bridge 适配层 (node dist/index.js)          │
│    协议转换：将 OMP RPC 事件映射为 App-Server 协议规范   │
└───────────────────────────▲────────────────────────────┘
                            │ stdio JSON-RPC
┌───────────────────────────▼────────────────────────────┐
│                  OMP 核心 (omp --mode rpc)             │
│    Rust Core · In-Process Tools · 60+ Providers        │
└────────────────────────────────────────────────────────┘
```

---

## 界面预览 · _Interface Preview_

<p align="center">
  <strong>浅色模式 (Light Mode)</strong><br>
  <img src="image/Light%20mode.jpeg" alt="Oh My Pi WebUI Light Mode" width="880">
</p>

<p align="center">
  <strong>深色模式 (Dark Mode)</strong><br>
  <img src="image/Dark%20mode.jpeg" alt="Oh My Pi WebUI Dark Mode" width="880">
</p>

---

## 环境变量配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WEBUI_API_KEY` | 无 | API Key 机器鉴权凭据与脚本调用密钥 |
| `PORT` / `HOST` | `8172` / `127.0.0.1` | 后端服务监听端口与地址 |
| `BRIDGE_BIN` | `bridge/dist/index.js` | 协议桥接层可执行入口 |
| `WEBUI_HOME` | `~/.omp` | 数据根目录（数据库、上传文件等） |
| `WEBUI_DB_PATH` | `WEBUI_HOME/webui.sqlite` | SQLite 数据库文件绝对路径 |
| `WEBUI_PROJECTS_DIR` | `./data/projects` | 新建项目或克隆项目的存放目录 |
| `OMP_BIN` | `omp` | 系统中 OMP 可执行文件路径 |
| `OMP_CWD` | 进程工作目录 | 引擎默认执行工作区根目录 |
| `OMP_SESSION_DIR` | `~/.omp/agent/sessions` | OMP 原始会话持久化存储目录 |
| `LOG_LEVEL` | `info` | 日志输出级别 (`debug`, `info`, `warn`, `error`) |

---

## 常用运维指令

### 重置管理员密码

持有数据库文件时可在命令行离线重置密码：

```bash
# 交互式输入新密码（不回显）
pnpm reset-password

# 脚本化指定用户名与密码
pnpm reset-password -- --username admin --password 'YourNewPassword123'
```

### 容器内调试命令

```bash
# 检查容器内 OMP 引擎版本
docker compose exec omp-webui omp --version

# 查看 OMP 当前全局配置
docker compose exec omp-webui omp config list

# 检查当前数据目录
docker compose exec omp-webui ls -la /root/.omp
```

---

## 本地开发与测试

```bash
# 启动后端开发调试（监听热重载）
pnpm dev:backend

# 启动前端开发调试
pnpm dev:web

# 运行后端单元测试套件（Vitest）
pnpm test

# 运行前端测试套件
pnpm --filter web exec vitest

# 构建生产产物
pnpm build
```

---

## 致谢与开源许可 · _Acknowledgments & License_

本项目遵循 [AGPL-3.0-or-later](LICENSE) 开源协议。
- 核心引擎源自 [Oh My Pi (omp)](https://github.com/can1357/oh-my-pi) 及作者 [@can1357](https://github.com/can1357)；
- 界面与交互架构派生自开源项目 [codex-webui](https://github.com/LimLLL/codex-webui)。
