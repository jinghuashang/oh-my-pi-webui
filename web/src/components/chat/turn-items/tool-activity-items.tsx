/** Distinct cards for hook, standalone output, dynamic-tool, and collaboration items. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bot,
  ChevronRight,
  FileLock2,
  Loader2,
  Network,
  Puzzle,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { dynamicToolText, ompToolFooter, ompToolHeader } from '@/lib/omp-tool-display';
import type { TurnItem } from '@/types/timeline';

interface ActivityCardProps {
  icon: typeof Wrench;
  title: string;
  completed: boolean;
  status?: string;
  children?: ReactNode;
}

/** Shared disclosure shell; payload-specific presentation stays in each renderer. */
function ActivityCard({
  icon: Icon,
  title,
  completed,
  status,
  children,
}: ActivityCardProps) {
  const hasBody = children !== undefined && children !== null;
  const [open, setOpen] = useState(!completed);
  const previousCompleted = useRef(completed);

  useEffect(() => {
    if (completed && !previousCompleted.current) setOpen(false);
    previousCompleted.current = completed;
  }, [completed]);

  const header = (
    <>
      {hasBody && (
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 transition-transform',
            open && 'rotate-90',
          )}
        />
      )}
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate font-medium">{title}</span>
      {status && <span className="ml-auto shrink-0 opacity-70">{status}</span>}
      {!completed && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
    </>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30 text-xs">
      {hasBody ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-muted-foreground hover:bg-muted/50"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-2 text-muted-foreground">
          {header}
        </div>
      )}
      {open && hasBody && (
        <div className="space-y-2 border-t border-border/30 px-3 py-2 text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

/** Renders hook-injected prompt fragments and their run identities. */
export function HookPromptItem({
  item,
}: {
  item: Extract<TurnItem, { type: 'hookPrompt' }>;
}) {
  const { t } = useTranslation();
  return (
    <ActivityCard
      icon={Puzzle}
      title={t('Hook prompt')}
      completed={item.completed}
    >
      {item.fragments.length === 0 ? (
        <p>{t('No prompt content was provided.')}</p>
      ) : (
        item.fragments.map((fragment, index) => (
          <div key={`${fragment.hookRunId}:${index}`}>
            {fragment.hookRunId && (
              <p className="mb-1 font-mono text-[10px] opacity-60">
                {fragment.hookRunId}
              </p>
            )}
            <p className="whitespace-pre-wrap wrap-break-word">
              {fragment.text}
            </p>
          </div>
        ))
      )}
    </ActivityCard>
  );
}

/** Renders a standalone tool-authority output without exposing ciphertext. */
export function FunctionCallOutputItem({
  item,
}: {
  item: Extract<TurnItem, { type: 'functionCallOutput' }>;
}) {
  const { t } = useTranslation();
  const title = item.namespace ? `${item.namespace}/${item.name}` : item.name;
  const hasOutput = item.textOutput !== null || item.outputParts.length > 0;

  return (
    <ActivityCard
      icon={Wrench}
      title={title || t('Function output')}
      completed={item.completed}
    >
      {!hasOutput && <p>{t('No output content was provided.')}</p>}
      {item.textOutput !== null && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono wrap-break-word">
          {item.textOutput}
        </pre>
      )}
      {item.outputParts.map((part, index) => {
        switch (part.type) {
          case 'text':
            return (
              <pre key={index} className="whitespace-pre-wrap font-mono wrap-break-word">
                {part.text}
              </pre>
            );
          case 'image':
            return part.imageUrl ? (
              <img
                key={index}
                src={part.imageUrl}
                alt={t('Function output')}
                className="max-h-64 rounded-md object-contain"
              />
            ) : (
              <p key={index}>{t('Image output cannot be previewed.')}</p>
            );
          case 'audio':
            return part.audioUrl ? (
              <audio key={index} controls src={part.audioUrl} className="w-full" />
            ) : (
              <p key={index}>{t('Audio output cannot be previewed.')}</p>
            );
          case 'encrypted':
            return (
              <p key={index} className="flex items-center gap-1.5">
                <FileLock2 className="h-3.5 w-3.5" />
                {t('Encrypted output cannot be previewed.')}
              </p>
            );
        }
      })}
    </ActivityCard>
  );
}

/** Renders a tool call the way the omp transcript names and shows it. */
export function DynamicToolCallItem({
  item,
}: {
  item: Extract<TurnItem, { type: 'dynamicToolCall' }>;
}) {
  const { t } = useTranslation();
  const header = ompToolHeader(item.tool, item.arguments);
  const output = dynamicToolText(item);
  const footer = ompToolFooter(item.durationMs, null);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30 font-mono text-xs">
      {/* One header line, exactly the identity omp prints: glyph + tool + subject. */}
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        <span className="shrink-0">{header.glyph}</span>
        <span className="min-w-0 truncate text-foreground/90">{header.label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 font-sans text-muted-foreground">
          {!item.completed && item.intent && (
            <span className="max-w-[24rem] truncate text-[10px] text-muted-foreground/70">
              ⎋ {item.intent}
            </span>
          )}
          {item.durationMs !== null && footer && (
            <span className="text-[10px] text-muted-foreground/60">{footer}</span>
          )}
          {item.completed && item.success === false && (
            <span className="text-red-400">{t('failed')}</span>
          )}
          {!item.completed && <Loader2 className="h-3 w-3 animate-spin" />}
        </span>
      </button>

      {!collapsed && output && (
        <pre className="m-0 max-h-64 overflow-auto border-t border-border/40 px-3 py-1.5 text-xs leading-relaxed text-muted-foreground">
          {output}
        </pre>
      )}

      {!collapsed &&
        item.contentItems.map((part, index) => {
          switch (part.type) {
            case 'text':
              return null;
            case 'image':
              return part.imageUrl ? (
                <img
                  key={index}
                  src={part.imageUrl}
                  alt={t('Tool output')}
                  className="max-h-64 border-t border-border/40 object-contain p-2"
                />
              ) : (
                <p key={index} className="border-t border-border/40 px-3 py-1.5">
                  {t('Image output cannot be previewed.')}
                </p>
              );
            case 'audio':
              return part.audioUrl ? (
                <audio key={index} controls src={part.audioUrl} className="w-full px-3 py-1.5" />
              ) : (
                <p key={index} className="border-t border-border/40 px-3 py-1.5">
                  {t('Audio output cannot be previewed.')}
                </p>
              );
          }
        })}
    </div>
  );
}

/** Renders cross-thread collaboration metadata without treating it as local work. */
export function CollabAgentToolCallItem({
  item,
}: {
  item: Extract<TurnItem, { type: 'collabAgentToolCall' }>;
}) {
  const { t } = useTranslation();
  return (
    <ActivityCard
      icon={Network}
      title={`${t('Agent collaboration')}: ${item.tool}`}
      completed={item.completed}
      status={item.status}
    >
      <p className="font-mono text-[10px]">
        {item.senderThreadId}
        {item.receiverThreadIds.length > 0 && ` → ${item.receiverThreadIds.join(', ')}`}
      </p>
      {item.prompt && <p className="whitespace-pre-wrap wrap-break-word">{item.prompt}</p>}
      {(item.model || item.reasoningEffort) && (
        <p>
          {[item.model, item.reasoningEffort].filter(Boolean).join(' · ')}
        </p>
      )}
      {item.agentStates.map((state) => (
        <div key={state.threadId} className="flex items-start gap-2">
          <Bot className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="font-mono">{state.threadId}</span>
          <span>{state.status}</span>
          {state.message && <span className="min-w-0 wrap-break-word">— {state.message}</span>}
        </div>
      ))}
    </ActivityCard>
  );
}
