/**
 * Chinese presentation for Oh My Pi (omp) settings.
 *
 * The curated map below covers the options people actually tune, with wording
 * that names the consequence rather than restating the key. Everything else is
 * filled from the generated dictionary, which mirrors omp's own descriptions
 * one-for-one; keys absent from both fall back to a humanized key plus the
 * engine's English text.
 */
import generated from '@/locales/omp-settings.zh-CN.json';

export interface SettingTranslation {
  title: string;
  desc?: string;
}

const GENERATED = generated as Record<string, { title: string; desc?: string }>;

/** Hand-written entries: they win over the generated dictionary. */
const CURATED: Record<string, SettingTranslation> = {
  // ---------------------------------------------------------------- appearance
  'theme.dark': { title: '暗黑主题', desc: '终端或界面处于暗色背景时使用的配色主题' },
  'theme.light': { title: '明亮主题', desc: '终端或界面处于亮色背景时使用的配色主题' },
  symbolPreset: { title: '符号字形集', desc: '图标与符号使用的字形集合（Unicode、Nerd Font 或 ASCII）' },
  colorBlindMode: { title: '色盲友好模式', desc: '代码差异中的新增行改用蓝色而非绿色标注' },
  'composer.shape': { title: '输入框布局', desc: '输入编辑器与状态栏的视觉排版样式' },
  'statusLine.preset': { title: '状态栏预设', desc: '整套状态栏布局的预置方案' },
  'statusLine.separator': { title: '状态栏分隔样式', desc: '状态栏各段之间的分隔符风格' },
  'statusLine.contextLine': { title: '上下文用量指示', desc: '左右段之间的连线如何反映当前上下文占用' },
  'statusLine.sessionAccent': { title: '会话强调色', desc: '用会话名称的颜色渲染编辑器边框与状态栏间隙' },
  'statusLine.transparent': { title: '状态栏透明背景', desc: '状态栏使用终端原生背景而非主题背景色' },
  'statusLine.compactThinkingLevel': { title: '紧凑思考等级', desc: '把思考等级合并为模型名上的单个图标，不再单独显示后缀' },
  'statusLine.showHookStatus': { title: '显示 Hook 状态', desc: '在状态栏下方显示 Hook 运行状态消息' },
  'terminal.showImages': { title: '终端内联图片', desc: '在终端中直接渲染内联图片' },
  'images.autoResize': { title: '图片自动缩放', desc: '把大图压缩到 2000x2000 以内以提升模型兼容性' },
  'images.blockImages': { title: '禁止发送图片', desc: '阻止图片被发送给大模型服务商' },
  'terminal.showProgress': { title: '终端进度提示', desc: '智能体或上下文维护运行期间发送 OSC 9;4 进度信号' },
  'tui.renderMermaid': { title: '渲染 Mermaid 图', desc: '把 Mermaid 代码块渲染为 ASCII 结构图' },
  'tui.reactions': { title: '助手表情回应', desc: '允许智能体在消息气泡上用表情徽章回应你' },
  'tui.titleState': { title: '标题栏运行状态', desc: '在终端标题分隔符中显示智能体运行状态' },
  'tui.hyperlinks': { title: '终端超链接', desc: '把路径与 URL 包装成可点击的 OSC 8 超链接' },
  'tui.tight': { title: '紧凑横向留白', desc: '去掉终端输出左右各一字符的空白内边距' },
  'display.smoothStreaming': { title: '平滑流式输出', desc: '分块到达时平滑揭示助手正文与工具输入' },
  'display.hideToolActivity': { title: '隐藏工具调用', desc: '在对话记录中隐藏模型发起的工具调用与结果' },
  'display.showTokenUsage': { title: '显示 Token 用量', desc: '在助手消息上显示每一轮的 Token 消耗' },
  'display.showTurnTime': { title: '显示回合耗时', desc: '在助手消息用量行上显示从提问到产出的总耗时' },
  'display.collapseCompacted': { title: '折叠已压缩历史', desc: '把压缩前的历史折叠到摘要分隔线之后' },
  showHardwareCursor: { title: '显示硬件光标', desc: '显示终端光标以支持输入法候选框定位' },

  // --------------------------------------------------------------------- model
  'advisor.enabled': { title: '顾问模型', desc: '启用第二个模型（advisor 角色）被动审查每轮并注入建议' },
  'prewalk.enabled': { title: '预热交接', desc: '强模型完成规划并提交待办后，在首次写文件时切换到快速模型继续实现' },
  'advisor.syncBacklog': { title: '顾问追平等待', desc: '顾问落后指定轮数时最多暂停主智能体 30 秒等待其追上' },
  'advisor.immuneTurns': { title: '顾问打断冷却', desc: '一次顾问打断后，接下来这些轮次内的建议改为非打断式提示' },
  modelRoleStorage: { title: '模型角色保存位置', desc: '模型角色分配保存为全局配置还是项目配置' },
  defaultThinkingLevel: { title: '默认思考等级', desc: '支持思考的模型默认使用的推理深度' },
  hideThinkingBlock: { title: '隐藏思考块', desc: '在助手回复中隐藏思考内容' },
  includeModelInPrompt: { title: '提示词声明模型', desc: '在系统提示词中写明当前模型标识，让智能体知道自己在用哪个模型' },
  includeWorkspaceTree: { title: '提示词包含目录树', desc: '在系统提示词中渲染工作区目录树（文件频繁变动会破坏提示缓存）' },
  skillful: { title: '提示词列出技能', desc: '在系统提示词中列出可用技能，关闭可节省上下文' },
  personality: { title: '沟通风格', desc: '渲染进系统提示词的人格化沟通风格' },
  temperature: { title: '采样温度', desc: '采样随机性，0 为确定、1 为发散，-1 表示用服务商默认值' },
  topP: { title: '核采样 Top-P', desc: '按累积概率截断候选 Token，-1 表示用服务商默认值' },
  topK: { title: 'Top-K 采样', desc: '只从概率最高的 K 个 Token 中采样，-1 表示用服务商默认值' },
  'retry.enabled': { title: '失败自动重试', desc: '请求失败时自动重试' },
  'retry.modelFallback': { title: '模型降级回退', desc: '模型不可用时自动切换到备用模型' },
  'tier.openai': { title: 'OpenAI 服务层级', desc: 'OpenAI 请求使用的 service_tier 处理层级' },
  'tier.anthropic': { title: 'Claude 服务层级', desc: 'Claude 请求使用的处理层级，priority 可在支持的模型上开启快速模式' },
  'tier.google': { title: 'Gemini 服务层级', desc: 'Gemini 请求使用的 serviceTier 处理层级' },

  // --------------------------------------------------------------- interaction
  autoResume: { title: '自动恢复会话', desc: '启动时自动恢复当前目录下最近的会话' },
  'power.sleepPrevention': { title: '阻止系统休眠', desc: '会话活跃期间阻止系统进入睡眠' },
  'git.enabled': { title: 'Git 信息显示', desc: '在界面中显示分支、状态与 PR 信息并监听仓库变动' },
  steeringMode: { title: '追加消息消费方式', desc: '运行中追加的多条指令是逐条消费还是合并处理' },
  interruptMode: { title: '中断生效时机', desc: '中断是立即终止还是等待当前工具执行完毕' },
  'tui.vimMode': { title: 'Vim 编辑模式', desc: '在输入框中启用 Vim 按键绑定' },
  'magicKeywords.enabled': { title: '魔法关键词', desc: '允许用 ultrathink 等关键词触发加强推理与编排' },
  'completion.notify': { title: '完成通知', desc: '回合完成时发送系统通知' },
  'error.notify': { title: '错误通知', desc: '执行出错时发送系统通知' },
  'ask.timeout': { title: '提问超时', desc: 'ask 工具等待用户回答的超时秒数，0 表示一直等待' },
  'recap.enabled': { title: '空闲回顾', desc: '会话空闲后重新开始时生成一段上下文回顾' },
  'stt.enabled': { title: '语音输入 (STT)', desc: '启用语音转文字输入' },
  'tools.approvalMode': { title: '工具放行策略', desc: '工具审批级别：always-ask 每次都问、write 仅改文件时问、yolo 全自动' },
  'features.unexpectedStopDetection': { title: '意外停止检测', desc: '助手未输出内容就停止时自动恢复，smart 模式会用小模型判断纯文本停止' },

  // ------------------------------------------------------------------- context
  'compaction.enabled': { title: '自动压缩上下文', desc: '上下文过大时自动压缩' },
  'compaction.thresholdPercent': { title: '压缩触发比例', desc: '达到上下文窗口的百分之多少时触发维护，-1 表示使用默认策略' },
  'compaction.midTurnEnabled': { title: '回合内压缩', desc: '在回合内安全的工具循环边界处提前检查并压缩' },
  'compaction.supersedeReads': { title: '清理旧读取', desc: '压缩时丢弃已被后续读取或写入取代的旧文件内容' },
  'compaction.dropUseless': { title: '丢弃无用回包', desc: '压缩时丢弃已被证明无用的工具输出' },
  'extendedContext': { title: '扩展上下文窗口', desc: '在支持的模型上使用更大上下文窗口，可能产生更高计费' },
  'contextPromotion.enabled': { title: '上下文溢出升档', desc: '上下文溢出时切换到更大窗口的模型，而不是压缩历史' },
  'branchSummary.enabled': { title: '分支摘要', desc: '为会话分支生成摘要以减少上下文占用' },
  'ttsr.enabled': { title: '目标相关规则过滤', desc: '按当前目标裁剪注入系统提示词的规则' },

  // -------------------------------------------------------------------- memory
  'memory.backend': { title: '记忆后端', desc: '跨会话记忆的存储后端：off 关闭、local 本地、hindsight、mnemopi、sharpshooter' },
  'mnemopi.autoRecall': { title: '自动召回记忆', desc: '每轮开始前自动检索并注入相关记忆' },
  'mnemopi.autoRetain': { title: '自动沉淀记忆', desc: '会话进行中自动把值得保留的内容写入记忆库' },
  'providers.memoryModel': { title: '记忆提取模型', desc: '负责事实提取与归并的模型：online 使用 TINY 角色或 smol，也可用本地模型' },
  'hindsight.apiUrl': { title: 'Hindsight 服务地址', desc: 'Hindsight 记忆服务的接口地址' },

  // --------------------------------------------------------------------- files
  'edit.mode': { title: '编辑模式', desc: '代码修改采用的匹配方式：hashline、apply_patch、patch、replace 等' },
  'edit.fuzzyMatch': { title: '模糊匹配', desc: '目标行有偏移时按相似度匹配编辑位置' },
  readLineNumbers: { title: '读取带行号', desc: '读取文件时输出行号' },
  'read.defaultLimit': { title: '默认读取行数', desc: '读取文件时默认返回的最大行数' },
  'read.renderMarkdown': { title: '渲染 Markdown', desc: '读取 Markdown 文件时渲染为可读样式而非源码' },
  'lsp.enabled': { title: '启用 LSP', desc: '启用语言服务提供的跳转、引用、统计与诊断能力' },
  'lsp.formatOnWrite': { title: '写入后格式化', desc: '写文件后自动运行对应语言的格式化工具' },
  'lsp.diagnosticsOnWrite': { title: '写入后诊断', desc: '写文件后收集诊断信息并回传给智能体' },
  'lsp.diagnosticsOnEdit': { title: '编辑后诊断', desc: '编辑文件后立即收集诊断信息' },

  // --------------------------------------------------------------------- shell
  'bash.enabled': { title: '允许 Bash', desc: '允许智能体执行 shell 命令' },
  'bash.allowCompoundCommands': { title: '允许复合命令', desc: '允许在一条命令中使用 && 等复合结构' },
  'bash.autoBackground.enabled': { title: '耗时命令转后台', desc: '超过阈值的长命令自动转为后台作业' },
  'bashInterceptor.enabled': { title: '命令拦截提示', desc: '检测到应改用专用工具的命令时给出提示' },
  'eval.py': { title: '启用 Python 内核', desc: '启用可持久化状态的 Python 执行环境' },
  'eval.js': { title: '启用 JS/TS 内核', desc: '启用可持久化状态的 JavaScript/TypeScript 执行环境' },
  'python.kernelMode': { title: 'Python 内核模式', desc: 'Python 状态在会话内保持，还是每次调用独立' },

  // --------------------------------------------------------------------- tools
  'tools.artifactSpillThreshold': { title: '工件溢出阈值', desc: '输出超过该大小时存为工件，正文只保留首尾片段' },
  'tools.artifactTailBytes': { title: '工件尾部保留', desc: '输出溢出为工件时正文保留的尾部字节数' },
  'tools.artifactHeadBytes': { title: '工件首部保留', desc: '输出溢出为工件时正文保留的首部字节数，0 表示只留尾部' },
  'tools.outputMaxColumns': { title: '单行宽度上限', desc: '流式工具输出的单行字节上限，超宽行会被截断，0 表示不限制' },
  'tools.artifactTailLines': { title: '工件尾部行数', desc: '输出溢出为工件时正文保留的最大尾部行数' },
  'todo.enabled': { title: '启用待办清单', desc: '启用分阶段任务清单工具' },
  'todo.reminders': { title: '待办提醒', desc: '回合结束前提醒尚未完成的待办事项' },
  'glob.enabled': { title: '启用 Glob', desc: '启用按通配模式快速查找文件路径的工具' },
  'grep.enabled': { title: '启用 Grep', desc: '启用正则文本检索工具' },
  'astGrep.enabled': { title: '启用 AST 检索', desc: '启用按语法结构检索代码的工具' },
  'astEdit.enabled': { title: '启用 AST 改写', desc: '启用按语法结构安全改写的工具' },
  'debug.enabled': { title: '启用调试器', desc: '启用基于 DAP 的断点调试工具' },
  'launch.enabled': { title: '启用进程托管', desc: '启用托管长期运行项目进程的工具' },
  'web_search.enabled': { title: '启用联网搜索', desc: '启用实时网页搜索工具' },
  'browser.enabled': { title: '启用浏览器自动化', desc: '启用基于 Chromium 的脚本化网页操作' },
  'browser.headless': { title: '无头浏览器', desc: '浏览器以无界面模式启动' },
  'browser.screenshotDir': { title: '截图目录', desc: '浏览器截图的保存目录，留空则使用临时文件' },
  'tools.intentTracing': { title: '工具意图声明', desc: '要求每次工具调用前先说明调用意图' },
  'tools.maxTimeout': { title: '工具超时上限', desc: '智能体可为工具设置的最大超时秒数，0 表示不限制' },
  'async.enabled': { title: '异步后台任务', desc: '启用后台作业与异步 Bash 执行' },
  'tools.xdev': { title: '设备化工具', desc: '把不常用的工具收进 xd:// 设备按需加载，减少每轮请求体积' },
  'mcp.enableProjectConfig': { title: '加载项目 MCP 配置', desc: '从项目根目录加载 .mcp.json / mcp.json' },
  'mcp.notifications': { title: 'MCP 变更注入', desc: '把 MCP 资源更新注入到对话中' },
  'ask.enabled': { title: '启用提问工具', desc: '启用向用户提问的工具' },
  'web_search': { title: '联网搜索', desc: '启用联网搜索工具' },

  // --------------------------------------------------------------------- tasks
  'plan.enabled': { title: '启用规划模式', desc: '启用只读探索与先计划后执行的规划模式' },
  'plan.defaultOnStartup': { title: '启动即规划', desc: '每个新会话自动进入规划模式' },
  'goal.enabled': { title: '启用目标模式', desc: '启用按会话持续推进的目标与预算管理' },
  'task.isolation.enabled': { title: '子代理隔离', desc: '子代理在检出的隔离副本中运行，之后合并改动' },
  'task.batch': { title: '批量派发子代理', desc: '一次调用携带多个任务，按条目并行派发子代理' },
  'task.maxConcurrency': { title: '子代理并发上限', desc: '同时运行的子代理数量上限' },
  'task.enableEffort': { title: '允许指定思考等级', desc: '允许调用方为子代理单独指定思考等级' },
  'task.maxRecursionDepth': { title: '子代理递归深度', desc: '子代理可以再派生子代理的层数' },
  'task.softRequestBudget': { title: '子代理请求预算', desc: '单个子代理允许的请求次数软上限，超出后要求收尾，1.5 倍时强制停止' },
  'task.eager': { title: '委派倾向', desc: '把工作交给子代理的积极程度' },

  // ----------------------------------------------------------------- providers
  'providers.webSearchOrder': { title: '搜索提供方优先级', desc: '联网搜索依次尝试的提供方顺序' },
  'providers.tts': { title: '语音合成后端', desc: 'tts 工具使用的语音合成后端' },
  'providers.cacheRetention': { title: '提示缓存保留', desc: '转发给支持该能力的服务商的提示缓存保留策略' },
  'speech.enabled': { title: '朗读回复', desc: '随输出实时朗读助手回复' },
  'speech.mode': { title: '朗读内容', desc: '朗读范围：全部、仅正文，或只在回合结束时朗读最终消息' },
  'speech.enhanced': { title: '口语化改写', desc: '合成前先用小模型把回复改写成自然口语' },
  'providers.tinyModel': { title: '小模型来源', desc: '标题与记忆等轻量任务所用的 TINY 模型来源' },
  'exa.enabled': { title: '启用 Exa 搜索', desc: '启用 Exa 搜索提供方' },
  'providers.streamIdleTimeoutSeconds': { title: '流空闲超时', desc: '模型流两个事件之间允许的最长静默秒数，-1 使用默认值，0 关闭看门狗' },

  // --------------------------------------------------------------------- agent
  shellPath: { title: 'Shell 路径', desc: '智能体执行命令时使用的 shell 解释器路径，留空则由系统探测' },
  enabledModels: { title: '启用的模型', desc: '模型选择器中列出的模型，留空表示列出全部' },
  enabledProviders: { title: '启用的服务商', desc: '仅启用这些服务商，留空表示启用全部' },
  disabledProviders: { title: '禁用的服务商', desc: '排除这些服务商，优先级高于启用列表' },
  modelRoles: { title: '模型角色', desc: '每个智能体角色（主模型、快速模型等）各自使用的模型' },
  modelTags: { title: '模型标签', desc: '按模型标记的别名与分组信息' },
  modelProviderOrder: { title: '服务商顺序', desc: '模型选择器中服务商的排列顺序' },
  cycleOrder: { title: '循环顺序', desc: '快捷键循环切换模型时依次经过的角色' },

  // ------------------------------------------------------------------- plugins
  'skills.enabled': { title: '启用技能', desc: '加载并按需使用技能说明' },
  'skills.enableSkillCommands': { title: '技能注册为命令', desc: '把技能注册为 /skill:名称 形式的斜杠命令' },
  'skills.customDirectories': { title: '技能自定义目录', desc: '额外扫描技能文件的目录' },
  'commands.enableClaudeProject': { title: '加载项目命令', desc: '从 .claude/commands/ 加载斜杠命令' },
  'commands.enableOpencodeProject': { title: '加载 opencode 命令', desc: '从 .opencode/commands/ 加载斜杠命令' },
};

/** Humanized key, used when neither dictionary names an option. */
export function humanizeKey(key: string): string {
  const leaf = key.split('.').pop() ?? key;
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}

/**
 * Chinese title and description for one OMP setting key.
 *
 * @param key - Setting key exactly as omp reports it.
 * @param fallbackDesc - Engine description, used when no translation exists.
 * @returns Title and description to render; description may be empty.
 */
export function getOmpSettingI18n(
  key: string,
  fallbackDesc?: string,
): { title: string; desc: string } {
  const curated = CURATED[key];
  const generatedEntry = GENERATED[key];
  return {
    title: curated?.title ?? generatedEntry?.title ?? humanizeKey(key),
    desc: curated?.desc ?? generatedEntry?.desc ?? fallbackDesc ?? '',
  };
}
