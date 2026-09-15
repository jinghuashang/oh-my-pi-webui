# Oh My Pi WebUI

给 [Oh My Pi (omp)](https://github.com/can1357/oh-my-pi) 做的 Web 前端：把命令行里的智能体会话搬到浏览器，多会话并发、流式过程、文件与终端、审批与设置一应俱全。

后端 NestJS 通过 stdio JSON-RPC 与 `bridge/` 通信，`bridge/` 负责把 omp 呈现成 app-server 协议；前端 React + Vite，中间用 Socket.IO 实时推送。

```text
web (React + Vite)
      │  REST + Socket.IO
      ▼
src (NestJS)  ──stdio JSON-RPC──▶  bridge  ──▶  omp --mode rpc
```

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `src/` | 后端：会话、文件、终端、审批、设置、认证、Git、日志 |
| `web/` | 前端：React 19 + Vite + Tailwind + shadcn/ui |
| `bridge/` | omp ⇄ app-server 协议适配层，由后端作为子进程启动 |
| `drizzle/` | SQLite 迁移（会话缓存、设置、账号） |
| `dist/` `public/` | 构建产物（后端 / 前端），不入版本库 |

## 快速开始

需要 Node 22+、pnpm 10+，以及可用的 `omp`。

```bash
pnpm install

cp .env.example .env      # 至少设置 WEBUI_API_KEY
pnpm build
pnpm start
```

打开 `http://127.0.0.1:8172`，首次访问会引导**初始化账号**（设置用户名和密码，只能初始化一次）。

## Docker 部署

项目提供了针对 Oh My Pi 深度优化的多阶段构建 `Dockerfile` 与 `docker-compose.yml`，容器内置预装了官方最新版 `omp` 运行引擎与完整构建依赖。

### 方式一：Docker Compose（推荐）

1. 准备本地项目工作区目录：
```bash
mkdir -p workspaces
```

2. 启动容器服务：
```bash
docker compose up -d --build
```

3. 浏览器访问：
打开 `http://localhost:8172`，首次进入按提示设置管理员账号与密码即可。

### 方式二：Docker 原生命令运行

```bash
# 1. 构建本地镜像
docker build -t oh-my-pi-webui:latest .

# 2. 启动容器并挂载数据卷
docker run -d \
  --name oh-my-pi-webui \
  --restart unless-stopped \
  -p 8172:8172 \
  -e WEBUI_API_KEY=change-me-to-a-long-random-string \
  -v omp_webui_data:/root/.omp \
  -v $(pwd)/workspaces:/workspaces \
  oh-my-pi-webui:latest
```

### 数据持久化说明

| 挂载路径 | 容器内路径 | 作用说明 |
| --- | --- | --- |
| `omp_webui_data` (Volume) | `/root/.omp` | 持久化 WebUI SQLite 数据库、`omp` 会话记录、全局配置与认证凭据 |
| `./workspaces` (Bind Mount) | `/workspaces` | 映射宿主机代码工作区，供智能体在容器内执行开发与文件修改 |

### 容器内找回密码

若在 Docker 部署中遗忘 WebUI 密码，可直接在运行中的容器内执行重置：
```bash
docker compose exec omp-webui node dist/cli/reset-password.js --password 'your-new-password'
```

## 认证

- **账号登录**：初始化时设置的用户名 + 密码，密码以 scrypt（16 字节盐 + 64 字节派生）单向存储。
- **API Key**：`WEBUI_API_KEY` 作为机器凭证，也可用于登录接口与脚本调用。
- 登录失败按「账号」与「客户端」两个维度滑动窗口限流；JWT 有效期 24 小时。

### 忘记密码

在持有数据库的机器上直接改写凭据，无需登录、无需停服（服务每次校验都读库，改完即生效）：

```bash
pnpm reset-password                            # 交互式输入新密码（不回显、不进 shell 历史）
pnpm reset-password -- --username alice         # 首次创建账号或改名
pnpm reset-password -- --password 'new-pass'    # 脚本化（注意会留在 shell 历史）
pnpm reset-password -- --db ./webui.sqlite      # 指定数据库文件
```

规则与网页端一致（同一份策略代码）：用户名 3–32 位字母/数字/`. _ -`，密码至少 8 位且不允许极端重复。改密后已签发的会话在到期前仍然有效；要立即吊销全部会话，轮换 `WEBUI_API_KEY` 即可。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WEBUI_API_KEY` | 无 | API Key 登录与机器调用凭证 |
| `PORT` / `HOST` | `8172` / `127.0.0.1` | 后端监听地址 |
| `BRIDGE_BIN` | `bridge/dist/index.js` | 后端启动的桥接入口 |
| `WEBUI_HOME` | `~/.omp` | 数据库与上传文件所在目录 |
| `WEBUI_DB_PATH` | `WEBUI_HOME/webui.sqlite` | SQLite 数据库路径 |
| `WEBUI_MIGRATIONS_DIR` | `<项目>/drizzle` | 迁移文件目录 |
| `OMP_BIN` | `omp` | 桥接调用的 omp 可执行文件 |
| `OMP_CWD` | 进程工作目录 | 引擎工作目录 |
| `OMP_SESSION_DIR` | `~/.omp/agent/sessions` | 会话文件目录 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `WEBUI_TRACE_RPC` | 关 | 置为 `1` 时把协议帧写入 `logs/rpc-trace.jsonl`（32 MB 自动轮转） |

## 功能

**对话**
- 多会话并发，按工作区分组，支持归档、重命名与消息级分支
- 过程展示与 omp TUI 一致：思考为暗色正文，工具调用为「标题行 + 输出 + 耗时页脚」
- 流式增量、追问（steer）、中断（stop），命令与文件变更走审批卡片

**会话侧栏**
- 悬浮在正文右侧的 Git 卡片：变更统计、分支切换、提交
- 会话目标与引擎任务清单（`✔` 完成 / `→` 进行中 / `○` 待办）
- 正文自动内缩，卡片不会遮挡内容；滚动条始终停在窗口最右侧

**设置**
- 与 omp 配置一一对应的 11 个分区（外观 / 模型 / 交互 / 上下文 / 记忆 / 文件 / Shell / 工具 / 任务 / 服务商 / 插件），全中文
- 「通用」里的智能体配置：为每个角色（主模型、快速模型、深度推理……）挑选模型，可搜索
- 布尔 / 枚举 / 数值 / JSON 控件按类型自适应，写入经 `omp config set` 落盘
- WebUI 自身的通用、终端、文件、安全设置，以及 `config.yml` 原文编辑

## 开发

```bash
pnpm dev:backend                 # 后端 watch
pnpm dev:web                     # 前端 dev server
pnpm test                        # 后端单测（vitest）
pnpm --filter web exec vitest    # 前端单测
pnpm build                       # 构建 bridge + 后端 + 前端
```

## 许可

AGPL-3.0-or-later。界面层派生自 [codex-webui](https://github.com/LimLLL/codex-webui)；协议适配层与 omp 相关改造为本项目所有。
