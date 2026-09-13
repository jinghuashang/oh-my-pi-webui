import * as readline from 'readline';
import { Readable, Writable } from 'stream';

export interface JsonRpcRequest {
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export class JsonRpcTransport {
  private rl: readline.Interface;
  private pendingRequests = new Map<string | number, {
    resolve: (res: JsonRpcResponse) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private nextId = 1000;

  constructor(
    private input: Readable,
    private output: Writable,
    private onRequest: (req: JsonRpcRequest) => Promise<unknown> | unknown,
    private onNotification: (notif: JsonRpcNotification) => void,
  ) {
    this.rl = readline.createInterface({
      input: this.input,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg: unknown = JSON.parse(trimmed);
        this.handleMessage(msg);
      } catch (err) {
        this.sendError(null, -32700, `Parse error: ${(err as Error).message}`);
      }
    });
  }

  private handleMessage(msg: unknown) {
    if (typeof msg !== 'object' || msg === null) return;
    const record = msg as Record<string, unknown>;

    // Response
    if (record.id !== undefined && (record.result !== undefined || record.error !== undefined)) {
      const id = record.id as string | number;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);
        const errObj = record.error as { code: number; message: string } | undefined;
        if (errObj) {
          pending.reject(new Error(`RPC Error [${errObj.code}]: ${errObj.message}`));
        } else {
          pending.resolve(record as unknown as JsonRpcResponse);
        }
      }
      return;
    }

    // Request
    if (record.id !== undefined && typeof record.method === 'string') {
      const req: JsonRpcRequest = {
        id: record.id as string | number,
        method: record.method,
        params: record.params as Record<string, unknown> | undefined,
      };
      Promise.resolve(this.onRequest(req))
        .then((result) => {
          this.sendResult(req.id, result);
        })
        .catch((err) => {
          this.sendError(req.id, -32603, (err as Error).message || 'Internal error');
        });
      return;
    }

    // Notification
    if (typeof record.method === 'string') {
      const notif: JsonRpcNotification = {
        method: record.method,
        params: record.params as Record<string, unknown> | undefined,
      };
      this.onNotification(notif);
    }
  }

  sendResult(id: string | number | null, result: unknown) {
    if (id === null || id === undefined) return;
    this.writeMessage({ id, result: result ?? {} });
  }

  sendError(id: string | number | null, code: number, message: string, data?: unknown) {
    if (id === null || id === undefined) return;
    this.writeMessage({
      id,
      error: { code, message, ...(data ? { data } : {}) },
    });
  }

  sendNotification(method: string, params?: unknown) {
    this.writeMessage({ method, ...(params !== undefined ? { params } : {}) });
  }

  sendRequest<T = unknown>(method: string, params?: unknown, timeoutMs = 60000): Promise<T> {
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} (id=${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (res) => resolve(res.result as T),
        reject,
        timer,
      });

      this.writeMessage({ id, method, ...(params !== undefined ? { params } : {}) });
    });
  }

  private writeMessage(msg: unknown) {
    try {
      this.output.write(JSON.stringify(msg) + '\n');
    } catch (err) {
      process.stderr.write(`[bridge:transport] write error: ${(err as Error).message}\n`);
    }
  }

  close() {
    this.rl.close();
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();
  }
}
