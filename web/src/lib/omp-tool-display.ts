/**
 * omp transcript presentation for tool calls.
 *
 * The TUI names every call on one header line — a glyph plus the tool and the
 * one argument that identifies it — and prints the result underneath. The web
 * transcript mirrors that one-for-one so both surfaces describe the same call
 * the same way, instead of flattening every tool into a shell command.
 */
import type { DynamicToolCallTurnItem } from '@/types/timeline';

/** Header glyph and label for one tool invocation. */
export interface OmpToolHeader {
  glyph: string;
  label: string;
}

/** Tools whose identity is the file they touched. */
const FILE_TOOLS: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  ast_edit: 'AST Edit',
  notebook: 'Notebook',
};

/** First string among the given argument names, in preference order. */
function firstString(
  args: Record<string, unknown>,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = args[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Total tasks carried by a todo payload's phases. */
function todoTaskCount(args: Record<string, unknown>): number | null {
  const phases = args.phases ?? args.list;
  if (!Array.isArray(phases)) return null;
  let total = 0;
  let counted = false;
  for (const phase of phases) {
    if (!phase || typeof phase !== 'object' || !('items' in phase)) continue;
    if (Array.isArray(phase.items)) {
      total += phase.items.length;
      counted = true;
    }
  }
  return counted ? total : null;
}

/**
 * Builds the one-line identity omp prints for a tool call.
 *
 * @param tool - omp tool name as reported by the engine.
 * @param args - Raw call arguments; absent when the payload omitted them.
 * @returns Glyph and label for the transcript header.
 */
export function ompToolHeader(
  tool: string,
  args: Record<string, unknown> | null,
): OmpToolHeader {
  const values = args ?? {};
  const fileTool = FILE_TOOLS[tool];
  if (fileTool) {
    const path = firstString(values, ['path', 'file', 'filePath', 'target']);
    return { glyph: '●', label: path ? `${fileTool} ${path}` : fileTool };
  }

  switch (tool) {
    case 'grep': {
      const pattern = firstString(values, ['pattern', 'query', 'regex']);
      const path = firstString(values, ['path', 'glob', 'include']);
      const scope = path ? ` in ${path}` : '';
      return { glyph: '🔍', label: pattern ? `Grep: ${pattern}${scope}` : 'Grep' };
    }
    case 'glob': {
      const pattern = firstString(values, ['pattern', 'glob']);
      return { glyph: '🔍', label: pattern ? `Glob: ${pattern}` : 'Glob' };
    }
    case 'todo': {
      const count = todoTaskCount(values);
      if (count !== null) return { glyph: '☑', label: `Todo ${count} tasks` };
      const op = firstString(values, ['op']);
      return { glyph: '☑', label: op ? `Todo ${op}` : 'Todo' };
    }
    case 'task': {
      const label = firstString(values, ['label', 'name', 'agent']);
      const items = values.tasks;
      const count = Array.isArray(items) ? items.length : null;
      const parts = [label, count !== null ? `${count} agents` : null].filter(Boolean);
      return { glyph: '⚙', label: parts.length ? `Task ${parts.join(' · ')}` : 'Task' };
    }
    case 'web_search': {
      const query = firstString(values, ['query', 'q']);
      return { glyph: '🔍', label: query ? `Search: ${query}` : 'Search' };
    }
    case 'fetch': {
      const url = firstString(values, ['url']);
      return { glyph: '▶', label: url ? `Fetch ${url}` : 'Fetch' };
    }
    case 'eval': {
      const code = firstString(values, ['language', 'lang']);
      return { glyph: '▷', label: code ? `Eval (${code})` : 'Eval' };
    }
    case 'hub': {
      const op = firstString(values, ['op']);
      return { glyph: '⇄', label: op ? `Hub ${op}` : 'Hub' };
    }
    case 'lsp': {
      const action = firstString(values, ['action']);
      const symbol = firstString(values, ['symbol', 'query']);
      return {
        glyph: '⇢',
        label: ['LSP', action, symbol].filter(Boolean).join(' '),
      };
    }
    case 'ask': {
      const question = firstString(values, ['question', 'title']);
      return { glyph: '?', label: question ? `Ask: ${question}` : 'Ask' };
    }
    case 'think':
      return { glyph: '∴', label: 'Think' };
    case 'yield':
      return { glyph: '⏹', label: 'Yield' };
    case 'checkpoint':
      return { glyph: '⏱', label: 'Checkpoint' };
    case 'rewind':
      return { glyph: '↺', label: 'Rewind' };
    case 'python':
      return { glyph: '▷', label: 'Python' };
    case 'browser':
      return { glyph: '◫', label: 'Browser' };
    case 'debug':
      return { glyph: '⏺', label: 'Debug' };
    default:
      return { glyph: '●', label: tool };
  }
}

/**
 * Renders omp's result footer for a finished call.
 *
 * @param durationMs - Wall-clock duration reported by the engine.
 * @param timeoutSeconds - Timeout the engine enforced, when it reported one.
 * @returns Rendered `⟦…⟧` footer, or null when neither value is known.
 */
export function ompToolFooter(
  durationMs: number | null | undefined,
  timeoutSeconds: number | null | undefined,
): string | null {
  const parts: string[] = [];
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    parts.push(`Wall: ${(durationMs / 1000).toFixed(2)}s`);
  }
  if (typeof timeoutSeconds === 'number' && Number.isFinite(timeoutSeconds)) {
    parts.push(`Timeout: ${timeoutSeconds}s`);
  }
  return parts.length ? `⟦${parts.join(' | ')}⟧` : null;
}

/** Text content of a dynamic tool call, joined into one block. */
export function dynamicToolText(item: DynamicToolCallTurnItem): string {
  return item.contentItems
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n');
}
