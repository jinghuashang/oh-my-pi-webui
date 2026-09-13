import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import { EventEmitter } from 'events';

export interface OmpReadyFrame {
  type: 'ready';
  protocolVersion: number;
  supportedProtocolVersions: number[];
  maxFrameBytes?: number;
  maxReassembledFrameBytes?: number;
}

export interface OmpEvent {
  type: string;
  [key: string]: unknown;
}

export interface OmpExtensionUiRequest {
  type: 'extension_ui_request';
  id: string;
  method: 'confirm' | 'input' | 'select' | 'editor' | 'notify' | 'setStatus' | 'setWidget' | string;
  title?: string;
  message?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string; description?: string }>;
  timeout?: number;
  [key: string]: unknown;
}

export interface OmpClientOptions {
  ompBin?: string;
  cwd?: string;
  env?: Record<string, string>;
  args?: string[];
}

export class OmpClient extends EventEmitter {
  private child: ChildProcess | null = null;
  private pendingCommands = new Map<string, {
    resolve: (res: Record<string, unknown>) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private nextReqId = 1;
  private isReady = false;
  private protocolVersion = 1;
  private chunkBuffers = new Map<string, {
    chunkId: string;
    count: number;
    byteLength: number;
    nextIndex: number;
    chunks: Buffer[];
  }>();

  constructor(private options: OmpClientOptions = {}) {
    super();
  }

  async start(): Promise<void> {
    const bin = this.options.ompBin || process.env.OMP_BIN || 'omp';
    const cwd = this.options.cwd || process.env.OMP_CWD || process.cwd();
    const extraArgs = this.options.args || [];

    const args = ['--mode', 'rpc', ...extraArgs];

    process.stderr.write(`[bridge:omp-client] Spawning ${bin} with args: ${args.join(' ')} in ${cwd}\n`);

    this.child = spawn(bin, args, {
      cwd,
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const rl = readline.createInterface({
      input: this.child.stdout!,
      terminal: false,
    });

    this.child.stderr?.on('data', (d: Buffer) => {
      process.stderr.write(`[omp:stderr] ${d.toString()}`);
    });

    this.child.on('error', (err) => {
      process.stderr.write(`[bridge:omp-client] Child process error: ${err.message}\n`);
      this.emit('error', err);
    });

    this.child.on('exit', (code, signal) => {
      process.stderr.write(`[bridge:omp-client] Child exited with code=${code} signal=${signal}\n`);
      this.child = null;
      this.isReady = false;
      this.emit('exit', code, signal);
    });

    // Wait for ready frame using Promise.withResolvers()
    const { promise: readyPromise, resolve: readyResolve, reject: readyReject } = Promise.withResolvers<void>();
    const readyTimer = setTimeout(() => {
      readyReject(new Error('Timed out waiting for omp ready frame'));
    }, 30000);

    const onLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed.type === 'ready') {
          clearTimeout(readyTimer);
          this.isReady = true;
          process.stderr.write(`[bridge:omp-client] omp ready received: ${line}\n`);

          // Negotiate protocol v2
          try {
            const res = await this.sendCommand('negotiate_protocol', { protocolVersion: 2 });
            if (res.success) {
              this.protocolVersion = 2;
              process.stderr.write(`[bridge:omp-client] Protocol v2 negotiated successfully\n`);
            }
          } catch (negErr) {
            process.stderr.write(`[bridge:omp-client] Protocol v2 negotiation skipped: ${(negErr as Error).message}\n`);
          }

          readyResolve();
          return;
        }
      } catch {
        // ignore lines before ready
      }
    };

    rl.on('line', (line) => {
      if (!this.isReady) {
        void onLine(line);
      } else {
        this.handleIncomingLine(line);
      }
    });

    await readyPromise;
  }

  private handleIncomingLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;

      // Check for rpc_chunk reassembly
      if (obj.type === 'rpc_chunk') {
        const assembled = this.assembleChunk(obj);
        if (assembled) {
          this.handleParsedEvent(assembled);
        }
        return;
      }

      this.handleParsedEvent(obj);
    } catch (err) {
      process.stderr.write(`[bridge:omp-client] Failed to parse omp frame: ${(err as Error).message}\n`);
    }
  }

  private assembleChunk(chunkObj: Record<string, unknown>): Record<string, unknown> | null {
    const chunkId = chunkObj.chunkId as string;
    const index = chunkObj.index as number;
    const count = chunkObj.count as number;
    const byteLength = chunkObj.byteLength as number;
    const dataStr = chunkObj.data as string;
    const chunkBuf = Buffer.from(dataStr, 'base64');

    let tracker = this.chunkBuffers.get(chunkId);
    if (!tracker) {
      if (index !== 0) return null;
      tracker = {
        chunkId,
        count,
        byteLength,
        nextIndex: 0,
        chunks: [],
      };
      this.chunkBuffers.set(chunkId, tracker);
    }

    if (tracker.nextIndex !== index) {
      this.chunkBuffers.delete(chunkId);
      return null;
    }

    tracker.chunks.push(chunkBuf);
    tracker.nextIndex++;

    if (tracker.chunks.length === count) {
      this.chunkBuffers.delete(chunkId);
      const fullBuf = Buffer.concat(tracker.chunks);
      const text = fullBuf.toString('utf8');
      return JSON.parse(text) as Record<string, unknown>;
    }

    return null;
  }

  private handleParsedEvent(obj: Record<string, unknown>) {
    // Response to a pending command
    if (obj.type === 'response' && typeof obj.command === 'string') {
      const reqId = obj.id as string | undefined;
      if (reqId && this.pendingCommands.has(reqId)) {
        const pending = this.pendingCommands.get(reqId)!;
        clearTimeout(pending.timer);
        this.pendingCommands.delete(reqId);
        if (obj.success === false) {
          pending.reject(new Error(typeof obj.error === 'string' ? obj.error : `Command ${obj.command} failed`));
        } else {
          pending.resolve(obj);
        }
        return;
      }
    }

    // Extension UI requests
    if (obj.type === 'extension_ui_request') {
      this.emit('extension_ui_request', obj as unknown as OmpExtensionUiRequest);
      return;
    }

    // Regular events
    this.emit('event', obj as unknown as OmpEvent);
    if (typeof obj.type === 'string') {
      this.emit(obj.type, obj);
    }
  }

  async sendCommand(command: string, params: Record<string, unknown> = {}, timeoutMs = 60000): Promise<Record<string, unknown>> {
    if (!this.child || !this.child.stdin) {
      throw new Error('omp client process is not running');
    }

    const id = `req_${this.nextReqId++}`;
    const payload = {
      id,
      type: command,
      ...params,
    };

    const { promise, resolve, reject } = Promise.withResolvers<Record<string, unknown>>();
    const timer = setTimeout(() => {
      this.pendingCommands.delete(id);
      reject(new Error(`Command ${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    this.pendingCommands.set(id, { resolve, reject, timer });

    try {
      this.child.stdin.write(JSON.stringify(payload) + '\n');
    } catch (err) {
      clearTimeout(timer);
      this.pendingCommands.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }

    return promise;
  }

  sendExtensionUiResponse(id: string, response: Record<string, unknown>): void {
    if (!this.child || !this.child.stdin) return;
    const payload = {
      type: 'extension_ui_response',
      id,
      ...response,
    };
    try {
      this.child.stdin.write(JSON.stringify(payload) + '\n');
    } catch (err) {
      process.stderr.write(`[bridge:omp-client] Failed to send extension_ui_response: ${(err as Error).message}\n`);
    }
  }

  async prompt(message: string, images?: string[]): Promise<void> {
    await this.sendCommand('prompt', { message, ...(images ? { images } : {}) });
  }

  async steer(message: string, images?: string[]): Promise<void> {
    await this.sendCommand('steer', { message, ...(images ? { images } : {}) });
  }

  async abort(): Promise<void> {
    await this.sendCommand('abort');
  }

  async newSession(parentSession?: string): Promise<Record<string, unknown>> {
    return this.sendCommand('new_session', { parentSession });
  }

  async switchSession(sessionPath: string): Promise<Record<string, unknown>> {
    return this.sendCommand('switch_session', { sessionPath });
  }

  async getState(): Promise<Record<string, unknown>> {
    const res = await this.sendCommand('get_state');
    return (res.data as Record<string, unknown>) || {};
  }

  async getAvailableModels(): Promise<Array<Record<string, unknown>>> {
    const res = await this.sendCommand('get_available_models');
    const data = res.data as { models?: Array<Record<string, unknown>> } | undefined;
    return data?.models || [];
  }

  async getAvailableCommands(): Promise<Array<Record<string, unknown>>> {
    const res = await this.sendCommand('get_available_commands');
    const data = res.data as { commands?: Array<Record<string, unknown>> } | undefined;
    return data?.commands || [];
  }

  async setModel(provider: string, modelId: string): Promise<Record<string, unknown>> {
    return this.sendCommand('set_model', { provider, modelId });
  }

  async setThinkingLevel(level: string): Promise<void> {
    await this.sendCommand('set_thinking_level', { level });
  }

  async setFastMode(enabled: boolean): Promise<Record<string, unknown>> {
    return this.sendCommand('set_fast_mode', { enabled });
  }

  async compact(customInstructions?: string): Promise<Record<string, unknown>> {
    return this.sendCommand('compact', { customInstructions });
  }

  stop(): void {
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
      this.child = null;
    }
    for (const [, req] of this.pendingCommands) {
      clearTimeout(req.timer);
      req.reject(new Error('omp client stopped'));
    }
    this.pendingCommands.clear();
  }
}
