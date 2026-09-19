#!/usr/bin/env node

import { JsonRpcTransport, JsonRpcRequest } from './jsonrpc.js';
import { OmpClient, OmpExtensionUiRequest } from './omp-client.js';
import { SessionManager } from './sessions.js';
import { TurnItemTracker } from './items.js';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execFile, execFileSync } from 'child_process';

function getOmpVersionString(): string {
  const bin = process.env.OMP_BIN || 'omp';
  try {
    const out = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 3000 });
    const match = out.match(/(\d+\.\d+\.\d+)/);
    if (match) return `omp ${match[1]}`;
    return out.trim() || 'omp';
  } catch {
    return 'omp';
  }
}

const currentOmpVersion = getOmpVersionString();
const args = process.argv.slice(2);

// Handle CLI subcommands
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`omp-webui-bridge (${currentOmpVersion})\n`);
  process.exit(0);
}

if (args.includes('debug') && args.includes('models')) {
  // Output model list in catalog format
  const catalog = [
    {
      id: 'gemini-3.8-flash-high',
      model: 'gemini-3.8-flash-high',
      displayName: 'Gemini 3.8 Flash High (Reasoning)',
      description: 'Default fast reasoning model via OMP',
      isDefault: true,
      provider: 'cpa',
      supportsReasoningEffort: true,
      defaultReasoningEffort: 'high',
      reasoningEffortOptions: ['minimal', 'low', 'medium', 'high'],
    },
    {
      id: 'claude-3-7-sonnet',
      model: 'claude-3-7-sonnet',
      displayName: 'Claude 3.7 Sonnet (Thinking)',
      description: 'Anthropic flagship reasoning model',
      isDefault: false,
      provider: 'anthropic',
      supportsReasoningEffort: true,
      defaultReasoningEffort: 'medium',
      reasoningEffortOptions: ['low', 'medium', 'high', 'max'],
    },
    {
      id: 'gpt-4o',
      model: 'gpt-4o',
      displayName: 'GPT-4o',
      description: 'OpenAI multi-modal model',
      isDefault: false,
      provider: 'openai',
      supportsReasoningEffort: false,
    },
    {
      id: 'deepseek-chat',
      model: 'deepseek-chat',
      displayName: 'DeepSeek V3 / R1',
      description: 'DeepSeek high capability model',
      isDefault: false,
      provider: 'deepseek',
      supportsReasoningEffort: true,
      defaultReasoningEffort: 'high',
      reasoningEffortOptions: ['low', 'medium', 'high'],
    },
  ];
  process.stdout.write(JSON.stringify(catalog, null, 2) + '\n');
  process.exit(0);
}

// Main JSON-RPC bridge server
async function main() {
  process.stderr.write('[bridge] Starting omp-webui-bridge server...\n');

  const sessionManager = new SessionManager();
  const ompClient = new OmpClient();

  let activeThreadId: string | null = null;
  let activeTurnCounter = 1;
  const STANDARD_EFFORTS = [
    { reasoningEffort: 'minimal', description: 'Fast responses with lighter reasoning' },
    { reasoningEffort: 'low', description: 'Low reasoning effort' },
    { reasoningEffort: 'medium', description: 'Balances speed and reasoning depth' },
    { reasoningEffort: 'high', description: 'Greater reasoning depth for complex problems' },
    { reasoningEffort: 'max', description: 'Maximum reasoning depth' },
  ];

  const DEFAULT_MODELS: Array<Record<string, unknown>> = [
    {
      id: 'gemini-3.8-flash-high',
      model: 'gemini-3.8-flash-high',
      displayName: 'Gemini 3.8 Flash High (Reasoning)',
      description: 'Default fast reasoning model via OMP',
      isDefault: true,
      provider: 'cpa',
      supportsReasoningEffort: true,
      defaultReasoningEffort: 'high',
      reasoningEffortOptions: ['minimal', 'low', 'medium', 'high'],
      supportedReasoningEfforts: STANDARD_EFFORTS,
      serviceTiers: [],
    },
    {
      id: 'claude-3-7-sonnet',
      model: 'claude-3-7-sonnet',
      displayName: 'Claude 3.7 Sonnet (Thinking)',
      description: 'Anthropic flagship reasoning model',
      isDefault: false,
      provider: 'anthropic',
      supportsReasoningEffort: true,
      defaultReasoningEffort: 'medium',
      reasoningEffortOptions: ['low', 'medium', 'high', 'max'],
      supportedReasoningEfforts: STANDARD_EFFORTS,
      serviceTiers: [],
    },
    {
      id: 'gpt-4o',
      model: 'gpt-4o',
      displayName: 'GPT-4o',
      description: 'OpenAI multi-modal model',
      isDefault: false,
      provider: 'openai',
      supportsReasoningEffort: false,
      supportedReasoningEfforts: [],
      serviceTiers: [],
    },
    {
      id: 'deepseek-chat',
      model: 'deepseek-chat',
      displayName: 'DeepSeek V3 / R1',
      description: 'DeepSeek high capability model',
      isDefault: false,
      provider: 'deepseek',
      supportsReasoningEffort: true,
      defaultReasoningEffort: 'high',
      reasoningEffortOptions: ['low', 'medium', 'high'],
      supportedReasoningEfforts: STANDARD_EFFORTS,
      serviceTiers: [],
    },
  ];
  let cachedModels: Array<Record<string, unknown>> = [...DEFAULT_MODELS];
  let isFetchingModels = false;

  const refreshModelsInBackground = () => {
    if (isFetchingModels) return;
    isFetchingModels = true;
    ompClient
      .getAvailableModels()
      .then((rawModels) => {
        if (rawModels.length > 0) {
          cachedModels = rawModels.map((m) => {
            const id = (m.id as string) || (m.name as string) || 'model';
            const name = (m.name as string) || id;
            const provider = (m.provider as string) || 'omp';
            return {
              id,
              model: id,
              displayName: `${name} (${provider})`,
              description: `OMP Model: ${name}`,
              isDefault: id === 'gemini-3.8-flash-high',
              provider,
              supportsReasoningEffort: true,
              defaultReasoningEffort: 'high',
              reasoningEffortOptions: ['minimal', 'low', 'medium', 'high', 'max'],
              supportedReasoningEfforts: STANDARD_EFFORTS,
            };
          });
          process.stderr.write(`[bridge] Refreshed ${cachedModels.length} models in background\n`);
        }
      })
      .catch((err) => {
        process.stderr.write(`[bridge] Background model fetch failed: ${(err as Error).message}\n`);
      })
      .finally(() => {
        isFetchingModels = false;
      });
  };
  const WEBUI_TO_OMP_KEY: Record<string, string> = {
    smol_model: 'modelRoles.smol',
    slow_model: 'modelRoles.slow',
    plan_model: 'modelRoles.plan',
    vision_model: 'modelRoles.vision',
    designer_model: 'modelRoles.designer',
    commit_model: 'modelRoles.commit',
    thinking_level: 'defaultThinkingLevel',
    hide_thinking: 'hideThinkingBlock',
    prose_only_thinking: 'proseOnlyThinking',
    loop_guard_enabled: 'model.loopGuard.enabled',
    tool_loop_guard_enabled: 'model.toolCallLoopGuard.enabled',
    plan_enabled: 'plan.enabled',
    plan_default_on_startup: 'plan.defaultOnStartup',
    prewalk_enabled: 'prewalk.enabled',
    plan_autosave: 'plan.autosave',
    auto_resume: 'autoResume',
    advisor_enabled: 'advisor.enabled',
    advisor_sync_backlog: 'advisor.syncBacklog',
    advisor_immune_turns: 'advisor.immuneTurns',
    advisor_max_notes: 'advisor.maxNotesPerUpdate',
    tools_approval_mode: 'tools.approvalMode',
    tools_intent_tracing: 'tools.intentTracing',
    abort_on_fabricated_result: 'tools.abortOnFabricatedResult',
    tools_xdev: 'tools.xdev',
    tools_artifact_spill: 'tools.artifactSpillThreshold',
    task_batch: 'task.batch',
    task_max_concurrency: 'task.maxConcurrency',
    task_isolation_enabled: 'task.isolation.enabled',
    task_isolation_merge: 'task.isolation.merge',
    git_enabled: 'git.enabled',
    worktree_clone: 'worktree.clone',
    web_search_enabled: 'web_search.enabled',
    browser_enabled: 'browser.enabled',
    browser_headless: 'browser.headless',
  };

  const ompConfigState: Record<string, unknown> = {
    smol_model: '',
    slow_model: '',
    plan_model: '',
    vision_model: '',
    designer_model: '',
    commit_model: '',
    thinking_level: 'auto',
    fast_mode: 'false',
    hide_thinking: 'false',
    prose_only_thinking: 'true',
    loop_guard_enabled: 'true',
    tool_loop_guard_enabled: 'true',
    plan_enabled: 'true',
    plan_default_on_startup: 'false',
    prewalk_enabled: 'false',
    plan_autosave: 'false',
    auto_resume: 'false',
    advisor_enabled: 'false',
    advisor_sync_backlog: 'off',
    advisor_immune_turns: 3,
    advisor_max_notes: 4,
    tools_approval_mode: 'always-ask',
    tools_intent_tracing: 'true',
    abort_on_fabricated_result: 'true',
    tools_xdev: 'true',
    tools_artifact_spill: 50,
    task_batch: 'true',
    task_max_concurrency: 32,
    task_isolation_enabled: 'false',
    task_isolation_merge: 'patch',
    git_enabled: 'true',
    worktree_clone: 'true',
    web_search_enabled: 'true',
    browser_enabled: 'true',
    browser_headless: 'true',
  };

  function loadOmpConfigSync(): void {
    const configPath = path.join(os.homedir(), '.omp', 'agent', 'config.yml');
    if (fs.existsSync(configPath)) {
      try {
        const text = fs.readFileSync(configPath, 'utf8');
        const lines = text.split('\n');
        let currentSection = '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const indent = line.search(/\S/);
          if (indent === 0 && line.includes(':')) {
            const [k, v] = line.split(':');
            currentSection = k.trim();
            if (v && v.trim()) {
              const val = v.trim();
              if (currentSection === 'defaultThinkingLevel') ompConfigState.thinking_level = val;
              if (currentSection === 'hideThinkingBlock') ompConfigState.hide_thinking = val;
            }
          } else if (indent > 0 && currentSection === 'modelRoles' && line.includes(':')) {
            const [role, val] = line.split(':');
            const roleKey = role.trim();
            const roleVal = val.trim();
            if (roleKey === 'smol') ompConfigState.smol_model = roleVal;
            if (roleKey === 'slow') ompConfigState.slow_model = roleVal;
            if (roleKey === 'plan') ompConfigState.plan_model = roleVal;
            if (roleKey === 'vision') ompConfigState.vision_model = roleVal;
            if (roleKey === 'designer') ompConfigState.designer_model = roleVal;
            if (roleKey === 'commit') ompConfigState.commit_model = roleVal;
          }
        }
      } catch {
        // ignore
      }
    }

    // Background sync via omp config list --json
    const ompBin = process.env.OMP_BIN || 'omp';
    execFile(ompBin, ['config', 'list', '--json'], { timeout: 5000 }, (err, stdout) => {
      if (!err && stdout) {
        try {
          const parsed = JSON.parse(stdout) as Record<string, { value?: unknown }>;
          for (const [webKey, ompKey] of Object.entries(WEBUI_TO_OMP_KEY)) {
            if (parsed[ompKey]?.value !== undefined) {
              ompConfigState[webKey] = String(parsed[ompKey].value);
            }
          }
          process.stderr.write('[bridge] Synced full live OMP settings from omp config list\n');
        } catch {
          // ignore
        }
      }
    });
  }

  loadOmpConfigSync();

  let transport: JsonRpcTransport;
  let turnTracker: TurnItemTracker;

  const handleRequest = async (req: JsonRpcRequest): Promise<unknown> => {
    const { method, params = {} } = req;
    process.stderr.write(`[bridge:request] ${method} (${JSON.stringify(params).slice(0, 150)})\n`);

    switch (method) {
      case 'initialize': {
        const platformOs = os.platform();
        const platformFamily = platformOs === 'win32' ? 'windows' : 'unix';
        return {
          userAgent: 'omp-bridge/0.1.0',
          codexHome: sessionManager.baseDir,
          platformFamily,
          platformOs,
        };
      }

      case 'config/read': {
        let currentModel = 'gemini-3.8-flash-high';
        try {
          const state = await ompClient.getState();
          if (state.model && typeof state.model === 'object') {
            const m = state.model as { id?: string };
            if (m.id) currentModel = m.id;
          }
          if (typeof state.thinkingLevel === 'string') {
            ompConfigState.thinking_level = state.thinkingLevel;
          }
          if (typeof state.fastModeEnabled === 'boolean') {
            ompConfigState.fast_mode = String(state.fastModeEnabled);
          }
        } catch {
          // fallback
        }
        return {
          config: {
            model: currentModel,
            ...ompConfigState,
            model_provider: 'omp',
            approval_policy: 'never',
            sandbox_mode: 'danger-full-access',
          },
        };
      }

      case 'config/batchWrite': {
        const edits = (params.edits as Array<{ keyPath: string; value: unknown }>) || [];
        for (const edit of edits) {
          ompConfigState[edit.keyPath] = edit.value;
          if (edit.keyPath === 'model' && typeof edit.value === 'string') {
            const parts = edit.value.split('/');
            const provider = parts.length > 1 ? parts[0] : 'omp';
            const modelId = parts.length > 1 ? parts[1] : edit.value;
            await ompClient.setModel(provider, modelId);
          } else if (edit.keyPath === 'thinking_level' && typeof edit.value === 'string') {
            await ompClient.setThinkingLevel(edit.value);
          } else if (edit.keyPath === 'fast_mode') {
            await ompClient.setFastMode(edit.value === true || edit.value === 'true');
          } else if (WEBUI_TO_OMP_KEY[edit.keyPath]) {
            const ompKey = WEBUI_TO_OMP_KEY[edit.keyPath];
            const ompBin = process.env.OMP_BIN || 'omp';
            try {
              spawn(ompBin, ['config', 'set', ompKey, String(edit.value)], {
                stdio: 'ignore',
                detached: true,
              }).unref();
            } catch (e) {
              process.stderr.write(`[bridge] Failed to sync setting ${ompKey}: ${(e as Error).message}\n`);
            }
          }
        }
        return {};
      }

      case 'model/list': {
        refreshModelsInBackground();
        return {
          data: cachedModels,
          nextCursor: null,
        };
      }

      case 'thread/start': {
        const cwd = (params.cwd as string) || process.cwd();
        const model = (params.model as string) || 'default';
        await ompClient.newSession();
        // omp mints the session; binding the thread to its real id is what lets
        // thread/read and thread/turns/list find this conversation again.
        const state = await ompClient.getState();
        const sessionId = typeof state.sessionId === 'string' ? state.sessionId : null;
        const sessionFile = typeof state.sessionFile === 'string' ? state.sessionFile : null;
        const threadId = sessionId ?? `session_${Date.now()}`;
        activeThreadId = threadId;

        if (cwd) {
          sessionManager.setSessionCwd(threadId, cwd);
          if (sessionFile && fs.existsSync(sessionFile)) {
            try {
              const raw = fs.readFileSync(sessionFile, 'utf8');
              const lines = raw.split('\n');
              if (lines.length > 0 && lines[0].trim()) {
                const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
                if (parsed.type === 'session') {
                  parsed.cwd = cwd;
                  lines[0] = JSON.stringify(parsed);
                  fs.writeFileSync(sessionFile, lines.join('\n'), 'utf8');
                }
              }
            } catch {}
          }
        }

        const thread = {
          id: threadId,
          forkedFromId: null,
          preview: 'New Chat',
          ephemeral: false,
          modelProvider: 'omp',
          model,
          reasoningEffort: 'high',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: { type: 'idle' },
          path: sessionFile,
          cwd,
          cliVersion: currentOmpVersion,
          historyMode: 'paginated',
          turns: [],
        };

        transport.sendNotification('thread/started', { thread });
        return { thread };
      }

      case 'thread/list': {
        if (params.archived === true) {
          return { data: [], nextCursor: null };
        }
        const cursor = params.cursor as string | undefined;
        const limit = typeof params.limit === 'number' ? params.limit : 50;
        const result = sessionManager.listThreads({ cursor, limit });
        return result;
      }

      case 'thread/delete': {
        const threadId = (params.threadId as string) || (params.id as string);
        const ok = sessionManager.deleteSession(threadId);
        transport.sendNotification('thread/deleted', { threadId });
        return { success: ok, threadId };
      }

      case 'thread/read': {
        const threadId = params.threadId as string;
        activeThreadId = threadId;
        const sessionPath = sessionManager.resolveSessionPath(threadId);
        const meta = sessionManager.readThreadMetadata(sessionPath);
        const thread = {
          id: threadId,
          forkedFromId: null,
          preview: meta?.preview || 'Session',
          ephemeral: false,
          modelProvider: 'omp',
          model: meta?.model || 'default',
          reasoningEffort: meta?.reasoningEffort || 'high',
          createdAt: meta?.createdAt || Date.now(),
          updatedAt: meta?.updatedAt || Date.now(),
          status: { type: 'idle' },
          path: sessionPath,
          cwd: sessionManager.getSessionCwd(threadId) || meta?.cwd || process.cwd(),
          cliVersion: currentOmpVersion,
          historyMode: 'paginated',
          turns: [],
        };
        return { thread };
      }

      case 'thread/resume': {
        const threadId = params.threadId as string;
        activeThreadId = threadId;
        const sessionPath = sessionManager.resolveSessionPath(threadId);
        try {
          await ompClient.switchSession(sessionPath);
        } catch (err) {
          process.stderr.write(`[bridge] switchSession failed: ${(err as Error).message}\n`);
        }
        const meta = sessionManager.readThreadMetadata(sessionPath);
        const turns = sessionManager.readThreadTurns(sessionPath);
        const initialTurnsPage = {
          data: turns,
          nextCursor: null,
        };
        const thread = {
          id: threadId,
          forkedFromId: null,
          preview: meta?.preview || 'Active Session',
          ephemeral: false,
          modelProvider: 'omp',
          model: meta?.model || 'default',
          reasoningEffort: meta?.reasoningEffort || 'high',
          createdAt: meta?.createdAt || Date.now(),
          updatedAt: meta?.updatedAt || Date.now(),
          status: { type: 'idle' },
          path: sessionPath,
          cwd: sessionManager.getSessionCwd(threadId) || meta?.cwd || process.cwd(),
          cliVersion: currentOmpVersion,
          historyMode: 'paginated',
          turns: [],
        };
        return {
          thread,
          // The client reads the working directory from this top-level field,
          // not from `thread.cwd`; omitting it made every reopened conversation
          // carry the literal string "undefined" as its workspace.
          cwd: thread.cwd,
          initialTurnsPage,
          turnsBackwardsCursor: null,
          itemsBackwardsCursor: null,
        };
      }

      case 'thread/turns/list': {
        const threadId = params.threadId as string;
        const turns = sessionManager.readThreadTurns(threadId);
        return {
          data: turns,
          nextCursor: null,
        };
      }

      case 'thread/items/list': {
        const threadId = params.threadId as string;
        const turnId = params.turnId as string;
        const turns = sessionManager.readThreadTurns(threadId);
        const turn = turns.find((t) => t.id === turnId);
        return {
          data: turn?.items || [],
        };
      }

      case 'turn/start': {
        const threadId = (params.threadId as string) || activeThreadId || 'current';
        activeThreadId = threadId;

        const inputList = (params.input as Array<Record<string, unknown>>) || [];
        const textParts = inputList
          .filter((i) => i.type === 'text' && typeof i.text === 'string')
          .map((i) => i.text as string);

        const promptText = textParts.join('\n');
        const turnId = `turn_${Date.now()}_${activeTurnCounter++}`;

        // Initialize turn in tracker
        turnTracker.startTurn(threadId, turnId);

        // Send prompt to omp in background
        void ompClient.prompt(promptText).catch((err) => {
          process.stderr.write(`[bridge] Prompt failed: ${(err as Error).message}\n`);
          transport.sendNotification('turn/completed', {
            threadId,
            turn: {
              id: turnId,
              status: 'failed',
              error: {
                message: (err as Error).message,
              },
            },
          });
        });

        return {
          turn: {
            id: turnId,
            status: 'inProgress',
            items: [],
            itemsView: 'all',
            error: null,
            startedAt: Date.now(),
            completedAt: null,
            durationMs: null,
          },
        };
      }

      case 'turn/steer': {
        const inputList = (params.input as Array<Record<string, unknown>>) || [];
        const textParts = inputList
          .filter((i) => i.type === 'text' && typeof i.text === 'string')
          .map((i) => i.text as string);
        const steerText = textParts.join('\n');
        await ompClient.steer(steerText);
        return {};
      }

      case 'turn/interrupt': {
        await ompClient.abort();
        if (activeThreadId) {
          turnTracker.completeTurn(activeThreadId);
        }
        return {};
      }

      case 'thread/settings/update': {
        if (typeof params.model === 'string') {
          const parts = params.model.split('/');
          const provider = parts.length > 1 ? parts[0] : 'omp';
          const modelId = parts.length > 1 ? parts[1] : params.model;
          await ompClient.setModel(provider, modelId);
        }
        if (typeof params.reasoningEffort === 'string') {
          await ompClient.setThinkingLevel(params.reasoningEffort);
        }
        return {};
      }

      case 'skills/list': {
        let commands: Array<Record<string, unknown>> = [];
        try {
          commands = await ompClient.getAvailableCommands();
        } catch {
          // ignore
        }
        const skills = commands.map((c) => ({
          name: (c.name as string) || 'command',
          description: (c.description as string) || '',
          path: process.cwd(),
          scope: 'project',
          enabled: true,
          pluginId: null,
        }));
        return {
          data: [
            {
              cwd: process.cwd(),
              skills,
              errors: [],
            },
          ],
        };
      }

      case 'account/read': {
        return {
          account: null,
          requiresOpenaiAuth: false,
        };
      }

      case 'account/rateLimits/read': {
        return {
          rateLimits: [],
        };
      }

      case 'collaborationMode/list': {
        return {
          data: [],
          modes: [],
        };
      }

      case 'thread/goal/get': {
        return {
          goal: null,
        };
      }

      case 'thread/goal/set':
      case 'thread/goal/clear': {
        return {};
      }

      case 'mcpServerStatus/list': {
        const mcpList: Array<Record<string, unknown>> = [];
        const mcpPaths = [
          path.join(os.homedir(), '.omp', 'agent', 'mcp.json'),
          path.join(process.cwd(), '.mcp.json'),
          path.join(process.cwd(), 'mcp.json'),
        ];
        const seenNames = new Set<string>();

        for (const p of mcpPaths) {
          if (fs.existsSync(p)) {
            try {
              const content = JSON.parse(fs.readFileSync(p, 'utf8')) as {
                mcpServers?: Record<string, { url?: string; command?: string }>;
              };
              if (content.mcpServers) {
                for (const name of Object.keys(content.mcpServers)) {
                  if (seenNames.has(name)) continue;
                  seenNames.add(name);
                  mcpList.push({
                    name,
                    runtimeStatus: { type: 'connected' },
                    pluginId: null,
                    serverInfo: { name, version: '1.0.0' },
                    tools: {},
                    resources: [],
                    resourceTemplates: [],
                    authStatus: { type: 'authenticated' },
                  });
                }
              }
            } catch {
              // ignore
            }
          }
        }

        return {
          data: mcpList,
          nextCursor: null,
        };
      }

      case 'plugin/list': {
        return {
          marketplaces: [],
          marketplaceLoadErrors: [],
          featuredPluginIds: [],
        };
      }

      case 'plugin/reconcile': {
        return {
          changedPlugins: [],
          failedRemotePluginIds: [],
          failedMaterializationRemotePluginIds: [],
        };
      }

      case 'app/list': {
        return {
          data: [],
          nextCursor: null,
        };
      }

      default: {
        process.stderr.write(`[bridge:unhandled] Fallback empty return for ${method}\n`);
        return {};
      }
    }
  };

  const handleNotification = (notif: { method: string; params?: Record<string, unknown> }) => {
    process.stderr.write(`[bridge:notification] ${notif.method}\n`);
  };

  transport = new JsonRpcTransport(process.stdin, process.stdout, handleRequest, handleNotification);
  turnTracker = new TurnItemTracker(transport);

  // Wire OmpClient events to TurnItemTracker
  ompClient.on('event', (event: Record<string, unknown>) => {
    if (activeThreadId) {
      turnTracker.handleOmpEvent(activeThreadId, event);
    }
  });

  // Handle extension UI requests (Approvals)
  ompClient.on('extension_ui_request', async (req: OmpExtensionUiRequest) => {
    process.stderr.write(`[bridge:extension_ui] Request received: id=${req.id} method=${req.method} title=${req.title}\n`);

    if (req.method === 'confirm' || req.method === 'input' || req.method === 'select') {
      try {
        const result = await transport.sendRequest<{ decision?: string; confirmed?: boolean }>(
          'item/commandExecution/requestApproval',
          {
            threadId: activeThreadId,
            requestId: req.id,
            command: req.title || req.message || 'Tool execution confirmation',
            reason: req.message,
          },
          req.timeout ? req.timeout * 1000 : 120000,
        );

        const confirmed = result.decision === 'accept' || result.confirmed === true;
        ompClient.sendExtensionUiResponse(req.id, { confirmed });
      } catch (err) {
        process.stderr.write(`[bridge:approval] Approval failed/timed out: ${(err as Error).message}\n`);
        ompClient.sendExtensionUiResponse(req.id, { confirmed: false, cancelled: true });
      }
    }
  });

  // Start the omp client
  try {
    await ompClient.start();
    process.stderr.write('[bridge] omp client started and ready!\n');
    refreshModelsInBackground();
  } catch (err) {
    process.stderr.write(`[bridge] Fatal error starting omp client: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

void main();
