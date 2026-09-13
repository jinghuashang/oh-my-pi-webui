import { JsonRpcTransport } from './jsonrpc.js';

export interface ActiveToolState {
  itemId: string;
  /** Shell invocations get the `$ command` box; every other tool gets a typed widget. */
  shell: boolean;
  command: string;
  intent: string | null;
  /** Characters of the cumulative omp partial result already streamed. */
  emitted: number;
  toolName?: string;
  args?: Record<string, unknown>;
}

export interface TurnState {
  threadId: string;
  turnId: string;
  activeAgentItemId: string | null;
  activeReasoningItemId: string | null;
  activeToolItems: Map<string, ActiveToolState>;
  accumulatedAgentText: string;
  accumulatedReasoningText: string;
}

/** omp tools whose transcript entry is a shell command box rather than a typed widget. */
export const SHELL_TOOL_NAMES: Record<string, true> = {
  bash: true,
  shell: true,
  execute: true,
};

/** Trailer omp appends to wrapped tool results; the transcript renders it as a footer. */
const WALL_TIME_TRAILER = /\s*Wall time: ([\d.]+) seconds\s*$/;

/** First text part of an omp tool result or partial result. */
export function resultText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result)) return '';
  if (!Array.isArray(result.content)) return '';
  for (const part of result.content) {
    if (!part || typeof part !== 'object' || !('type' in part) || !('text' in part)) continue;
    if (part.type === 'text' && typeof part.text === 'string') return part.text;
  }
  return '';
}

/** Splits the trailing `Wall time: N seconds` trailer off a tool result body. */
export function stripWallTimeTrailer(text: string): {
  body: string;
  wallTimeMs: number | null;
} {
  const match = text.match(WALL_TIME_TRAILER);
  if (!match) return { body: text, wallTimeMs: null };
  return {
    body: text.slice(0, match.index).replace(/\s+$/, ''),
    wallTimeMs: Number(match[1]) * 1000,
  };
}

/** Plan step statuses the app-server protocol defines. */
type PlanStepStatus = 'pending' | 'inProgress' | 'completed';

function planStatus(raw: unknown): PlanStepStatus {
  if (raw === 'completed' || raw === 'done') return 'completed';
  if (raw === 'in_progress' || raw === 'inProgress') return 'inProgress';
  return 'pending';
}

/**
 * Projects omp's todo payload onto the app-server plan shape.
 *
 * @param details - `result.details` of a todo tool call.
 * @returns Step list with a phase summary, or null when the payload has no checklist.
 */
export function todoPlanFromDetails(
  details: Record<string, unknown>,
): { explanation: string | null; steps: Array<{ step: string; status: PlanStepStatus }> } | null {
  const phases = details.phases;
  if (!Array.isArray(phases)) return null;

  const steps: Array<{ step: string; status: PlanStepStatus }> = [];
  const names: string[] = [];
  for (const phase of phases) {
    if (!phase || typeof phase !== 'object') continue;
    const record = phase as { name?: unknown; items?: unknown; tasks?: unknown };
    if (typeof record.name === 'string' && record.name.trim()) names.push(record.name.trim());
    const tasks = Array.isArray(record.tasks)
      ? record.tasks
      : Array.isArray(record.items)
        ? record.items
        : [];
    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue;
      const entry = task as { content?: unknown; text?: unknown; status?: unknown };
      const text =
        typeof entry.content === 'string'
          ? entry.content
          : typeof entry.text === 'string'
            ? entry.text
            : null;
      if (!text) continue;
      steps.push({ step: text, status: planStatus(entry.status) });
    }
  }

  if (steps.length === 0) return null;
  const done = steps.filter((step) => step.status === 'completed').length;
  return {
    explanation: names.length > 0 ? `${names.join(' · ')} · ${done}/${steps.length}` : `${done}/${steps.length}`,
    steps,
  };
}

export class TurnItemTracker {
  private activeTurns = new Map<string, TurnState>();

  constructor(private transport: JsonRpcTransport) {}

  startTurn(threadId: string, turnId: string): TurnState {
    const turnState: TurnState = {
      threadId,
      turnId,
      activeAgentItemId: null,
      activeReasoningItemId: null,
      activeToolItems: new Map(),
      accumulatedAgentText: '',
      accumulatedReasoningText: '',
    };
    this.activeTurns.set(threadId, turnState);

    this.transport.sendNotification('turn/started', {
      threadId,
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
    });

    return turnState;
  }

  getTurn(threadId: string): TurnState | undefined {
    return this.activeTurns.get(threadId);
  }

  handleOmpEvent(threadId: string, event: Record<string, unknown>): void {
    const turn = this.activeTurns.get(threadId);
    if (!turn) return;

    const eventType = event.type as string;

    switch (eventType) {
      case 'message_start': {
        const message = event.message as Record<string, unknown> | undefined;
        const role = (message?.role as string) || (event.role as string);
        if (role === 'assistant') {
          const itemId = `item_${Date.now()}_agent`;
          turn.activeAgentItemId = itemId;
          turn.accumulatedAgentText = '';

          this.transport.sendNotification('item/started', {
            threadId,
            turnId: turn.turnId,
            item: {
              id: itemId,
              type: 'agentMessage',
              text: '',
              phase: null,
              memoryCitation: null,
              questions: null,
            },
          });
        }
        break;
      }

      case 'message_update': {
        const ame = event.assistantMessageEvent as Record<string, unknown> | undefined;
        const ameType = ame?.type as string | undefined;

        // Thinking delta
        if (ameType === 'thinking_delta' || (!ameType && Boolean(event.delta_thinking || event.thinking_delta))) {
          const thinkingChunk = (ame?.delta as string) || (event.thinking_delta as string) || '';
          if (thinkingChunk) {
            if (!turn.activeReasoningItemId) {
              const reasoningId = `item_${Date.now()}_reasoning`;
              turn.activeReasoningItemId = reasoningId;
              turn.accumulatedReasoningText = '';

              this.transport.sendNotification('item/started', {
                threadId,
                turnId: turn.turnId,
                item: {
                  id: reasoningId,
                  type: 'reasoning',
                  summary: [],
                  content: [],
                },
              });
            }

            turn.accumulatedReasoningText += thinkingChunk;
            this.transport.sendNotification('item/reasoning/summaryTextDelta', {
              threadId,
              turnId: turn.turnId,
              itemId: turn.activeReasoningItemId,
              delta: thinkingChunk,
            });
          }
        }

        // Thinking end
        if (ameType === 'thinking_end') {
          if (turn.activeReasoningItemId) {
            const finalThinking = (ame?.content as string) || turn.accumulatedReasoningText;
            this.transport.sendNotification('item/completed', {
              threadId,
              turnId: turn.turnId,
              item: {
                id: turn.activeReasoningItemId,
                type: 'reasoning',
                summary: [finalThinking.slice(0, 120) + '...'],
                content: [finalThinking],
              },
            });
            turn.activeReasoningItemId = null;
          }
        }

        // Text delta
        if (ameType === 'text_delta' || (!ameType && Boolean(event.delta_text || event.text_delta))) {
          const textChunk = (ame?.delta as string) || (event.text_delta as string) || '';
          if (textChunk) {
            if (!turn.activeAgentItemId) {
              const itemId = `item_${Date.now()}_agent`;
              turn.activeAgentItemId = itemId;
              turn.accumulatedAgentText = '';

              this.transport.sendNotification('item/started', {
                threadId,
                turnId: turn.turnId,
                item: {
                  id: itemId,
                  type: 'agentMessage',
                  text: '',
                  phase: null,
                  memoryCitation: null,
                  questions: null,
                },
              });
            }

            turn.accumulatedAgentText += textChunk;
            this.transport.sendNotification('item/agentMessage/delta', {
              threadId,
              turnId: turn.turnId,
              itemId: turn.activeAgentItemId,
              delta: textChunk,
            });
          }
        }

        // Text end
        if (ameType === 'text_end') {
          if (turn.activeAgentItemId) {
            const finalText = (ame?.content as string) || turn.accumulatedAgentText;
            this.transport.sendNotification('item/completed', {
              threadId,
              turnId: turn.turnId,
              item: {
                id: turn.activeAgentItemId,
                type: 'agentMessage',
                text: finalText,
                phase: null,
                memoryCitation: null,
                questions: null,
              },
            });
            turn.activeAgentItemId = null;
          }
        }
        break;
      }

      case 'message_end': {
        const message = event.message as Record<string, unknown> | undefined;
        const role = message?.role as string | undefined;
        if (role === 'assistant') {
          if (turn.activeReasoningItemId) {
            this.transport.sendNotification('item/completed', {
              threadId,
              turnId: turn.turnId,
              item: {
                id: turn.activeReasoningItemId,
                type: 'reasoning',
                summary: [turn.accumulatedReasoningText.slice(0, 100) + '...'],
                content: [turn.accumulatedReasoningText],
              },
            });
            turn.activeReasoningItemId = null;
          }

          if (turn.activeAgentItemId) {
            this.transport.sendNotification('item/completed', {
              threadId,
              turnId: turn.turnId,
              item: {
                id: turn.activeAgentItemId,
                type: 'agentMessage',
                text: turn.accumulatedAgentText,
                phase: null,
                memoryCitation: null,
                questions: null,
              },
            });
            turn.activeAgentItemId = null;
          }
        }
        break;
      }

      case 'tool_execution_start': {
        const toolCallId = (event.toolCallId as string) || (event.id as string) || `tool_${Date.now()}`;
        const toolName = (event.toolName as string) || (event.name as string) || 'tool';
        const args = (event.args as Record<string, unknown>) || (event.input as Record<string, unknown>) || {};
        const intent = typeof event.intent === 'string' ? event.intent : null;
        const shell = SHELL_TOOL_NAMES[toolName] === true;
        const itemId = `item_${toolCallId}`;
        const command = typeof args.command === 'string' ? args.command : JSON.stringify(args);

        turn.activeToolItems.set(toolCallId, {
          itemId,
          shell,
          command,
          intent,
          emitted: 0,
          toolName,
          args,
        });

        // omp renders shell invocations as `$ command` boxes and every other tool
        // as its own typed widget; the two shapes must not be flattened into one.
        this.transport.sendNotification('item/started', {
          threadId,
          turnId: turn.turnId,
          item: shell
            ? {
                id: itemId,
                type: 'commandExecution',
                command,
                cwd: process.cwd(),
                processId: null,
                source: 'agent',
                status: 'inProgress',
                commandActions: [],
                aggregatedOutput: null,
                exitCode: null,
                durationMs: null,
                timeoutSeconds: null,
                intent,
              }
            : {
                id: itemId,
                type: 'dynamicToolCall',
                namespace: null,
                tool: toolName,
                arguments: args,
                status: 'inProgress',
                contentItems: null,
                success: null,
                durationMs: null,
                intent,
              },
        });
        break;
      }

      case 'tool_execution_update': {
        const toolCallId = (event.toolCallId as string) || (event.id as string);
        const toolState = toolCallId ? turn.activeToolItems.get(toolCallId) : undefined;
        if (!toolState) break;
        // omp partial results are cumulative, so the wire delta is the new suffix.
        const text = resultText(event.partialResult);
        const delta = text.slice(toolState.emitted);
        if (!delta) break;
        toolState.emitted = text.length;
        this.transport.sendNotification(
          toolState.shell
            ? 'item/commandExecution/outputDelta'
            : 'item/dynamicToolCall/outputDelta',
          {
            threadId,
            turnId: turn.turnId,
            itemId: toolState.itemId,
            delta,
          },
        );
        break;
      }

      case 'tool_execution_end': {
        const toolCallId = (event.toolCallId as string) || (event.id as string);
        const toolState = toolCallId ? turn.activeToolItems.get(toolCallId) : undefined;
        if (!toolState) break;

        const isError = event.isError === true;
        const result = event.result;
        const rawDetails =
          result && typeof result === 'object' && 'details' in result
            ? result.details
            : null;
        const details: Record<string, unknown> =
          rawDetails && typeof rawDetails === 'object'
            ? (rawDetails as Record<string, unknown>)
            : {};
        const { body, wallTimeMs } = stripWallTimeTrailer(resultText(result));
        const wallTime = 'wallTimeMs' in details ? details.wallTimeMs : undefined;
        const timeLimit = 'timeoutSeconds' in details ? details.timeoutSeconds : undefined;
        const durationMs = typeof wallTime === 'number' ? wallTime : wallTimeMs;
        const timeoutSeconds = typeof timeLimit === 'number' ? timeLimit : null;

        this.transport.sendNotification('item/completed', {
          threadId,
          turnId: turn.turnId,
          item: toolState.shell
            ? {
                id: toolState.itemId,
                type: 'commandExecution',
                command: toolState.command,
                cwd: process.cwd(),
                processId: null,
                source: 'agent',
                status: isError ? 'failed' : 'completed',
                commandActions: [],
                aggregatedOutput: body || null,
                exitCode: isError ? 1 : 0,
                durationMs,
                timeoutSeconds,
                intent: toolState.intent,
              }
            : {
                id: toolState.itemId,
                type: 'dynamicToolCall',
                namespace: null,
                tool: toolState.toolName ?? 'tool',
                arguments: toolState.args ?? {},
                status: isError ? 'failed' : 'completed',
                contentItems: body ? [{ type: 'inputText', text: body }] : null,
                success: !isError,
                durationMs,
                intent: toolState.intent,
              },
        });
        turn.activeToolItems.delete(toolCallId);

        // omp's todo tool carries the authoritative checklist for the session;
        // publishing it as a plan keeps the sidebar's progress panel in step
        // with what the engine believes is left to do.
        if ((toolState.toolName ?? '') === 'todo' && !isError) {
          const plan = todoPlanFromDetails(details);
          if (plan) {
            this.transport.sendNotification('turn/plan/updated', {
              threadId,
              turnId: turn.turnId,
              explanation: plan.explanation,
              plan: plan.steps,
            });
          }
        }
        break;
      }

      case 'agent_end': {
        this.completeTurn(threadId);
        break;
      }
    }
  }

  completeTurn(threadId: string): void {
    const turn = this.activeTurns.get(threadId);
    if (!turn) return;

    this.transport.sendNotification('turn/completed', {
      threadId,
      turn: {
        id: turn.turnId,
        status: 'completed',
        items: [],
        itemsView: 'all',
        error: null,
        completedAt: Date.now(),
      },
    });

    this.activeTurns.delete(threadId);
  }
}
