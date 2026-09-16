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

项目提供了开箱即用的多阶段构建 `Dockerfile` 与 `docker-compose.yml`，具备 **OMP 主体引擎自动安装**、**宿主机 `./data` 目录直接映射** 与 **容器启动自动初始化** 能力。

### 🌟 核心特性

1. **全自动安装 OMP 主体引擎**：Docker 镜像与 `docker-entrypoint.sh` 启动脚本在构建与启动时会自动探测并下载官方最新版 `omp` 核心引擎，宿主机无需预先安装任何 Python、Rust 或编译工具；
2. **配置直通宿主机 `./data`**：容器内的默认存储 `/root/.omp` 直接映射至宿主机项目的 `./data` 目录，无需在 Docker 私有卷中翻找，直接在宿主机即可用文本编辑器打开并修改 `./data/agent/config.yml` 与备份 `./data/webui.sqlite` 数据库；
3. **初次启动自动初始化**：如果 `./data/agent/config.yml` 尚不存在，启动脚本会自动生成带清晰中文注释的标准默认配置文件；
4. **宿主机代码空间映射**：项目根目录的 `./workspaces` 映射至容器内的 `/workspaces`，智能体在容器内操作的代码修改直接落盘在宿主机本地。

### 🚀 快速启动（Docker Compose 推荐）

1. **启动服务**：
```bash
# 一键构建镜像并在后台启动容器
docker compose up -d --build
```

2. **查看运行日志与 OMP 主体状态**：
```bash
docker compose logs -f
```
控制台会打印出 OMP 引擎的版本号以及初始化的数据目录信息。

3. **访问 WebUI 界面**：
打开浏览器访问 `http://localhost:8172`，首次访问按提示创建管理员账号与密码即可。

---

### ⚙️ 模型配置与 API Key 接入（三种方式任选其一）

- **方式一（最方便）：直接编辑宿主机 `./data/agent/config.yml`**
  容器启动后，直接在宿主机打开 `./data/agent/config.yml`，填写模型角色与配置项，保存后即刻生效。

- **方式二：在 `docker-compose.yml` 中传入环境变量**
  在 `docker-compose.yml` 的 `environment` 小节中取消注释并填入你的模型 API Key：
  ```yaml
  environment:
    - WEBUI_API_KEY=change-me-to-a-long-random-string
    - DEEPSEEK_API_KEY=sk-xxx
    - OPENAI_API_KEY=sk-xxx
    - ANTHROPIC_API_KEY=sk-ant-xxx
    - GEMINI_API_KEY=xxx
  ```
  重启容器后，容器内 OMP 主体与各工具将直接识别生效。

- **方式三：在 Web 界面中可视化配置**
  登录 WebUI 后，点击左侧菜单的「设置」->「通用」中的「智能体配置」为各角色挑选模型，或进入「config.yml」在线 Monaco 编辑器直接修改。

---

### 📦 数据目录结构映射说明

| 宿主机路径 | 容器内路径 | 作用说明 |
| --- | --- | --- |
| `./data/agent/config.yml` | `/root/.omp/agent/config.yml` | **OMP 主体核心配置文件**，直接在此编辑模型分派与参数 |
| `./data/webui.sqlite` | `/root/.omp/webui.sqlite` | WebUI 账号凭证、会话索引与运行期数据库 |
| `./data/agent/sessions/` | `/root/.omp/agent/sessions/` | OMP 历史会话对话与上下文数据归档目录 |
| `./workspaces` | `/workspaces` | 挂载宿主机代码工程目录，供智能体执行分析与文件修改 |

---

### 🛠️ 常用运维命令

```bash
# 进入容器执行 OMP 原生命令行工具
docker compose exec omp-webui omp --version
docker compose exec omp-webui omp config list

# 容器内重置 WebUI 管理员密码
docker compose exec omp-webui node dist/cli/reset-password.js --password 'your-new-password'

# 停止并清理容器
docker compose down
```

### 方式二：Docker 原生命令启动

```bash
# 构建本地镜像
docker build -t oh-my-pi-webui:latest .

# 启动容器并挂载数据与工作区
docker run -d \
  --name oh-my-pi-webui \
  --restart unless-stopped \
  -p 8172:8172 \
  -e WEBUI_API_KEY=change-me-to-a-long-random-string \
  -v $(pwd)/data:/root/.omp \
  -v $(pwd)/workspaces:/workspaces \
  oh-my-pi-webui:latest
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
| `WEBUI_PROJECTS_DIR` | `./data/projects` | 新建项目时的基础存储目录 |

## 功能

**项目与会话管理**
- **创建项目会话**：侧边栏支持一键新建项目并开启开发会话；新项目自动在 `./data/projects/<项目名>` 建立物理文件夹，并自动初始化 Git 仓库 (`git init`)
- **从 GitHub 拉取新建项目**：支持输入 GitHub 仓库链接或 `owner/repo` 自动通过 Git 克隆并打开项目，支持指定分支、`--depth 1` 快速浅克隆及携带初始需求
- 支持输入初始需求自动派发首轮对话，亦可无缝打开已有目录
- 多会话并发，按工作区自动分组展示，支持归档、重命名与消息级分支
- 流式增量、追问（steer）、中断（stop），命令与文件变更走审批卡片
- **OMP 检查更新**：侧边栏底部集成 OMP 引擎版本展示与一键检测更新，实时对比官方最新发布并支持一键升级

**集成与 MCP 扩展商店**
- **内置 MCP 商店**：位于「集成」模块，精选内置 5 大主流 MCP 服务：
  - **Exa Search** (`exa`)：高精度实时网页与技术文档检索
  - **Context7** (`context7`)：官方第三方库/框架最新 API 与文档检索
  - **Playwright** (`playwright`)：无头浏览器自动化控制与网页交互
  - **DeepWiki** (`deepwiki`)：GitHub 仓库智能问答与代码架构 Wiki 知识库
  - **Serena** (`serena`)：专业 IDE 代码助手与多轮会话记忆管理
- **多 GitHub 镜像加速**：内置 `ghfast.top`、`ghproxy.net`、`hub.gitmirror.com`、`kkgithub.com` 等国内加速节点，一键切换并自动改写 GitHub 源依赖下载地址
- 支持一键安装、启用/禁用开关、移除卸载及自定义配置注册
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
