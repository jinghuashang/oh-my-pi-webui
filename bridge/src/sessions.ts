import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SHELL_TOOL_NAMES, resultText, stripWallTimeTrailer } from './items.js';

export interface ThreadMetadata {
  id: string;
  forkedFromId: string | null;
  preview: string;
  ephemeral: boolean;
  modelProvider: string;
  model: string | null;
  reasoningEffort: string | null;
  createdAt: number;
  updatedAt: number;
  status: { type: 'idle' };
  path: string;
  cwd: string;
  cliVersion: string;
  historyMode: 'paginated';
  turns: unknown[];
}

export interface ThreadItem {
  id: string;
  type:
    | 'userMessage'
    | 'agentMessage'
    | 'reasoning'
    | 'commandExecution'
    | 'dynamicToolCall'
    | 'fileChange'
    | 'plan';
  [key: string]: unknown;
}

export interface ThreadTurn {
  id: string;
  status: 'completed' | 'inProgress' | 'failed';
  items: ThreadItem[];
  itemsView: 'all';
  error: null;
  startedAt: number;
  completedAt: number;
  durationMs: number | null;
}

export class SessionManager {
  public readonly baseDir: string;
  private idToPath = new Map<string, string>();

  constructor(customDir?: string) {
    if (customDir) {
      this.baseDir = customDir;
    } else if (process.env.OMP_SESSION_DIR) {
      this.baseDir = process.env.OMP_SESSION_DIR;
    } else {
      this.baseDir = path.join(os.homedir(), '.omp', 'agent', 'sessions');
    }
  }

  resolveSessionPath(idOrPath: string): string {
    if (fs.existsSync(idOrPath)) return idOrPath;
    const mapped = this.idToPath.get(idOrPath);
    if (mapped && fs.existsSync(mapped)) return mapped;
    return idOrPath;
  }

  listThreads(options: { cursor?: string; limit?: number; cwd?: string } = {}): {
    data: ThreadMetadata[];
    nextCursor: string | null;
  } {
    const limit = options.limit ?? 50;
    if (!fs.existsSync(this.baseDir)) {
      return { data: [], nextCursor: null };
    }

    const allJsonlFiles: string[] = [];
    this.collectJsonlFiles(this.baseDir, allJsonlFiles);

    // Sort newest first by mtime
    const fileStats = allJsonlFiles.map((filePath) => {
      try {
        const stat = fs.statSync(filePath);
        return { filePath, mtime: stat.mtimeMs };
      } catch {
        return { filePath, mtime: 0 };
      }
    });

    fileStats.sort((a, b) => b.mtime - a.mtime);

    let startIndex = 0;
    if (options.cursor) {
      const idx = fileStats.findIndex((f) => f.filePath === options.cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const pageFiles = fileStats.slice(startIndex, startIndex + limit);
    const data: ThreadMetadata[] = [];

    for (const item of pageFiles) {
      const meta = this.readThreadMetadata(item.filePath, item.mtime);
      if (meta) {
        if (!options.cwd || meta.cwd === options.cwd) {
          data.push(meta);
        }
      }
    }

    const nextIndex = startIndex + limit;
    const nextCursor = nextIndex < fileStats.length ? fileStats[nextIndex].filePath : null;

    return { data, nextCursor };
  }

  private collectJsonlFiles(dir: string, out: string[]) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.collectJsonlFiles(full, out);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          out.push(full);
        }
      }
    } catch {
      // ignore
    }
  }

  readThreadMetadata(idOrPath: string, mtimeMs?: number): ThreadMetadata | null {
    try {
      const sessionPath = this.resolveSessionPath(idOrPath);
      if (!fs.existsSync(sessionPath)) return null;
      const mtime = mtimeMs ?? fs.statSync(sessionPath).mtimeMs;

      // Read first 20KB to get header & title
      const fd = fs.openSync(sessionPath, 'r');
      const buf = Buffer.alloc(20480);
      const bytesRead = fs.readSync(fd, buf, 0, 20480, 0);
      fs.closeSync(fd);

      const content = buf.toString('utf8', 0, bytesRead);
      const lines = content.split('\n').filter((l) => l.trim().length > 0);

      let explicitTitle = '';
      let firstUserPrompt = '';
      let id = path.basename(sessionPath, '.jsonl');
      let cwd = process.cwd();
      let model: string | null = null;
      let thinkingLevel: string | null = null;
      let createdAt = mtime;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          if (entry.type === 'title' && typeof entry.title === 'string' && entry.title.trim()) {
            explicitTitle = entry.title.trim();
          }
          if (entry.type === 'session') {
            if (typeof entry.title === 'string' && entry.title.trim() && !explicitTitle) {
              explicitTitle = entry.title.trim();
            }
            if (typeof entry.id === 'string') id = entry.id;
            if (typeof entry.cwd === 'string') cwd = entry.cwd;
            if (typeof entry.timestamp === 'string') {
              const parsedTime = Date.parse(entry.timestamp);
              if (!isNaN(parsedTime)) createdAt = parsedTime;
            }
          }
          if (entry.type === 'message' && !firstUserPrompt) {
            const msg = entry.message as Record<string, unknown> | undefined;
            if (msg?.role === 'user') {
              const contentList = (msg.content as Array<Record<string, unknown>>) || [];
              const textPiece = contentList.find((c) => c.type === 'text' && typeof c.text === 'string');
              if (textPiece && typeof textPiece.text === 'string') {
                const clean = textPiece.text.replace(/\s+/g, ' ').trim();
                if (clean) firstUserPrompt = clean.slice(0, 60);
              }
            }
          }
          if (entry.type === 'model_change' && typeof entry.model === 'string') {
            model = entry.model;
          }
          if (entry.type === 'thinking_level_change' && typeof entry.thinkingLevel === 'string') {
            thinkingLevel = entry.thinkingLevel;
          }
        } catch {
          // ignore broken lines
        }
      }

      let finalPreview = explicitTitle || firstUserPrompt;
      if (!finalPreview || /^01[a-z0-9]{6,}$/i.test(finalPreview)) {
        const d = new Date(createdAt);
        finalPreview = `会话 ${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }

      this.idToPath.set(id, sessionPath);

      return {
        id,
        forkedFromId: null,
        preview: finalPreview,
        ephemeral: false,
        modelProvider: model?.split('/')[0] || 'omp',
        model: model || 'default',
        reasoningEffort: thinkingLevel,
        createdAt,
        updatedAt: mtime,
        status: { type: 'idle' },
        path: sessionPath,
        cwd,
        cliVersion: 'omp 18.1.19',
        historyMode: 'paginated',
        turns: [],
      };
    } catch {
      return null;
    }
  }
  readThreadTurns(threadIdOrPath: string): ThreadTurn[] {
    const sessionPath = this.resolveSessionPath(threadIdOrPath);
    if (!fs.existsSync(sessionPath)) return [];
    try {
      const content = fs.readFileSync(sessionPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);

      const turns: ThreadTurn[] = [];
      let currentTurn: ThreadTurn | null = null;
      let turnCounter = 1;
      let itemCounter = 1;
      /** Tool call id → the transcript entry its result must fill in. */
      const toolResults = new Map<string, ThreadItem>();

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          const type = entry.type as string | undefined;

          if (type === 'message') {
            const msg = entry.message as Record<string, unknown> | undefined;
            if (!msg) continue;
            const role = msg.role as string;
            const contentItems = (msg.content as Array<Record<string, unknown>>) || [];
            const timestamp = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Date.now();

            if (role === 'user') {
              // Finalize previous turn if open
              if (currentTurn) {
                currentTurn.completedAt = timestamp;
                currentTurn.durationMs = Math.max(0, currentTurn.completedAt - currentTurn.startedAt);
                turns.push(currentTurn);
              }

              const turnId = `turn_${turnCounter++}`;
              const textParts = contentItems
                .filter((c) => c.type === 'text' && typeof c.text === 'string')
                .map((c) => c.text as string);

              const userText = textParts.join('\n');
              const userItem: ThreadItem = {
                id: `item_${itemCounter++}_user`,
                type: 'userMessage',
                content: [{ type: 'text', text: userText }],
              };

              currentTurn = {
                id: turnId,
                status: 'completed',
                items: [userItem],
                itemsView: 'all',
                error: null,
                startedAt: timestamp,
                completedAt: timestamp,
                durationMs: 0,
              };
            } else if (role === 'assistant') {
              if (!currentTurn) {
                currentTurn = {
                  id: `turn_${turnCounter++}`,
                  status: 'completed',
                  items: [],
                  itemsView: 'all',
                  error: null,
                  startedAt: timestamp,
                  completedAt: timestamp,
                  durationMs: 0,
                };
              }

              for (const piece of contentItems) {
                if (piece.type === 'text' && typeof piece.text === 'string') {
                  currentTurn.items.push({
                    id: `item_${itemCounter++}_agent`,
                    type: 'agentMessage',
                    text: piece.text,
                    phase: null,
                    memoryCitation: null,
                    questions: null,
                  });
                } else if (piece.type === 'thinking' && typeof piece.thinking === 'string') {
                  currentTurn.items.push({
                    id: `item_${itemCounter++}_reasoning`,
                    type: 'reasoning',
                    summary: [piece.thinking.slice(0, 100) + '...'],
                    content: [piece.thinking],
                  });
                } else if (piece.type === 'toolCall') {
                  const name = typeof piece.name === 'string' ? piece.name : 'tool';
                  const args = (piece.arguments as Record<string, unknown>) || {};
                  const intent = typeof piece.intent === 'string' ? piece.intent : null;
                  const callId = typeof piece.id === 'string' ? piece.id : '';
                  const itemId = `item_${itemCounter++}`;
                  // omp stores the same tool under one shape per kind: shell
                  // invocations are command boxes, everything else is a typed widget.
                  const item: ThreadItem = SHELL_TOOL_NAMES[name] === true
                    ? {
                        id: itemId,
                        type: 'commandExecution',
                        command: typeof args.command === 'string' ? args.command : JSON.stringify(args),
                        cwd: process.cwd(),
                        processId: null,
                        source: 'agent',
                        status: 'completed',
                        commandActions: [],
                        aggregatedOutput: null,
                        exitCode: 0,
                        durationMs: null,
                        timeoutSeconds: null,
                        intent,
                      }
                    : {
                        id: itemId,
                        type: 'dynamicToolCall',
                        namespace: null,
                        tool: name,
                        arguments: args,
                        status: 'completed',
                        contentItems: null,
                        success: null,
                        durationMs: null,
                        intent,
                      };

                  currentTurn.items.push(item);
                  if (callId) toolResults.set(callId.split('|')[0], item);
                }
              }
            } else if (role === 'toolResult') {
              const callId = typeof msg.toolCallId === 'string' ? msg.toolCallId : '';
              const item = callId ? toolResults.get(callId.split('|')[0]) : undefined;
              const { body, wallTimeMs } = stripWallTimeTrailer(resultText(msg));
              const details = msg.details && typeof msg.details === 'object' ? msg.details : {};
              const wallTime = 'wallTimeMs' in details ? details.wallTimeMs : undefined;
              const timeLimit = 'timeoutSeconds' in details ? details.timeoutSeconds : undefined;
              const durationMs = typeof wallTime === 'number' ? wallTime : wallTimeMs;
              const isError = msg.isError === true;

              if (item) {
                item.status = isError ? 'failed' : 'completed';
                item.durationMs = durationMs;
                if (item.type === 'commandExecution') {
                  item.aggregatedOutput = body || null;
                  item.exitCode = isError ? 1 : 0;
                  item.timeoutSeconds = typeof timeLimit === 'number' ? timeLimit : null;
                } else {
                  item.contentItems = body ? [{ type: 'inputText', text: body }] : null;
                  item.success = !isError;
                }
              }
            }
          }
        } catch {
          // ignore broken lines
        }
      }

      if (currentTurn) {
        turns.push(currentTurn);
      }

      return turns;
    } catch {
      return [];
    }
  }
}
