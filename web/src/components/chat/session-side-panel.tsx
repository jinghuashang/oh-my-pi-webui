/**
 * Floating session panel: repository state, session goal, and the engine's own
 * task list, styled as the overlay card the desktop reference uses — it hangs
 * over the transcript instead of taking a column, so opening it never reflows
 * the conversation.
 *
 * Everything here is read from the workspace or the engine — the branch and
 * change counts come from git in the thread's directory, the goal and progress
 * sections come from session state the server already holds — so the panel
 * never invents a target or a checklist the run does not have.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  CircleDot,
  FileDiff,
  GitBranch,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Target,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { TurnPlanStepStatus } from '@/types/timeline';
import { useTimelineStore } from '@/stores/timeline-store';
import { showSnackbar } from '@/stores/snackbar-store';
import { getApiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { gitCheckout, gitCommit, gitStatus } from '@/generated/api';

interface Props {
  /** Workspace directory the conversation runs in; absent for a draft thread. */
  cwd: string | null;
  /** Closes the floating panel. */
  onClose: () => void;
}

/** Compact token count, e.g. `89K`. */
function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function SessionSidePanel({ cwd, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [commitMessage, setCommitMessage] = useState('');
  const [commitOpen, setCommitOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);

  const timeline = useTimelineStore((s) => s.timeline);
  const threadStatus = useTimelineStore((s) => s.threadStatus);
  const loading = useTimelineStore((s) => s.loading);
  const tokenUsageByTurn = useTimelineStore((s) => s.tokenUsageByTurn);
  const latestTokenUsage = useTimelineStore((s) => s.latestTokenUsage);

  const statusQuery = useQuery({
    queryKey: ['gitStatus', cwd],
    enabled: Boolean(cwd),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await gitStatus({ query: { cwd: cwd! }, throwOnError: true });
      return data;
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (branch: string) => {
      await gitCheckout({ body: { cwd: cwd!, branch }, throwOnError: true });
    },
    onSuccess: () => {
      setBranchOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['gitStatus', cwd] });
      void queryClient.invalidateQueries({ queryKey: ['gitBranch', cwd] });
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error), 'error'),
  });

  const commitMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data } = await gitCommit({ body: { cwd: cwd!, message }, throwOnError: true });
      return data;
    },
    onSuccess: (data) => {
      setCommitMessage('');
      setCommitOpen(false);
      showSnackbar(`${t('Committed')} ${data.sha}`, 'success');
      void queryClient.invalidateQueries({ queryKey: ['gitStatus', cwd] });
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error), 'error'),
  });

  const status = statusQuery.data;
  // Only turn entries carry a plan or a lifecycle, so the panel reads them
  // directly instead of walking the whole timeline on every render.
  const turns = useMemo(() => timeline.filter((entry) => entry.kind === 'turn'), [timeline]);

  const plan = useMemo(() => {
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const candidate = turns[index]?.plan;
      if (candidate && candidate.steps.length > 0) return candidate;
    }
    return null;
  }, [turns]);

  const activeTurn = useMemo(() => {
    const last = turns[turns.length - 1];
    return last && !last.completed ? last : null;
  }, [turns]);

  const stats = useMemo(() => {
    const totalTokens = Object.values(tokenUsageByTurn).reduce(
      (sum, entry) => sum + (entry.total?.totalTokens ?? 0),
      0,
    );
    // Context occupancy is the newest turn's window reading; a provider that
    // publishes no window leaves the figure out rather than guessing one.
    const window = latestTokenUsage?.modelContextWindow ?? null;
    const inWindow = latestTokenUsage?.total?.totalTokens ?? 0;
    return {
      turns: turns.length,
      context:
        window && window > 0
          ? `${Math.min(100, Math.round((inWindow / window) * 100))}%`
          : null,
      tokens: formatTokens(totalTokens),
    };
  }, [latestTokenUsage, tokenUsageByTurn, turns.length]);

  const goalState = activeTurn
    ? t('Running')
    : threadStatus?.type === 'idle' || !threadStatus
      ? t('Idle')
      : String(threadStatus.type);

  const steps = plan?.steps ?? [];
  const doneSteps = steps.filter((step) => step.status === 'completed').length;
  const changeCount = status?.changes.length ?? 0;

  return (
    <div className="pointer-events-auto flex max-h-full min-h-0 w-[300px] flex-col overflow-hidden rounded-xl border bg-card/90 shadow-xl backdrop-blur-sm">
      {/* Header: title, overflow actions, close — the overlay's own chrome. */}
      <header className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[12px] font-medium">{t('Git tools')}</span>
        <span className="ml-auto flex items-center gap-0.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <button
                type="button"
                onClick={() => {
                  void statusQuery.refetch();
                  void queryClient.invalidateQueries({ queryKey: ['ompConfig'] });
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {t('Refresh')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" /> {t('Close panel')}
              </button>
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {/* ── Repository ──────────────────────────────────────────── */}
        {!cwd ? (
          <PanelRow className="text-muted-foreground">{t('No workspace directory yet.')}</PanelRow>
        ) : statusQuery.isError ? (
          <PanelRow className="text-muted-foreground">
            {t('Repository state unavailable.')}
          </PanelRow>
        ) : status && !status.isRepo ? (
          <PanelRow className="text-muted-foreground">{t('Not a Git repository.')}</PanelRow>
        ) : status ? (
          <>
            <button
              type="button"
              onClick={() => setChangesOpen((open) => !open)}
              disabled={changeCount === 0}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] hover:bg-accent/60 disabled:hover:bg-transparent"
            >
              <FileDiff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{t('Changes')}</span>
              {changeCount > 0 && (
                <ChevronDown
                  className={cn(
                    'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                    !changesOpen && '-rotate-90',
                  )}
                />
              )}
              <span className="ml-auto font-mono tabular-nums">
                <span className="text-emerald-500">+{status.additions}</span>{' '}
                <span className="text-rose-400">-{status.deletions}</span>
              </span>
            </button>

            {changeCount > 0 && changesOpen && (
              <ul className="max-h-32 space-y-0.5 overflow-y-auto border-t border-border/50 pt-1">
                {status.changes.slice(0, 40).map((change) => (
                  <li
                    key={change.path}
                    className="flex items-center gap-1.5 px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    <span className="w-3.5 shrink-0 text-muted-foreground/70">{change.status}</span>
                    <span className="truncate text-muted-foreground" title={change.path}>
                      {change.path}
                    </span>
                    {change.additions + change.deletions > 0 && (
                      <span className="ml-auto shrink-0 tabular-nums">
                        <span className="text-emerald-500">+{change.additions}</span>{' '}
                        <span className="text-rose-400">-{change.deletions}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <Popover open={branchOpen} onOpenChange={setBranchOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] hover:bg-accent/60"
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate font-mono">
                    {status.branch ?? t('detached')}
                  </span>
                  {(status.ahead > 0 || status.behind > 0) && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {status.ahead > 0 && `↑${status.ahead}`}
                      {status.behind > 0 && `↓${status.behind}`}
                    </span>
                  )}
                  <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                {status.branches.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('No branches')}</p>
                ) : (
                  status.branches.map((branch) => (
                    <button
                      key={branch}
                      type="button"
                      disabled={checkoutMutation.isPending}
                      onClick={() => checkoutMutation.mutate(branch)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs hover:bg-accent',
                        branch === status.branch && 'bg-accent/60',
                      )}
                    >
                      <Check
                        className={cn(
                          'h-3 w-3 shrink-0',
                          branch === status.branch ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="truncate">{branch}</span>
                    </button>
                  ))
                )}
              </PopoverContent>
            </Popover>

            {commitOpen ? (
              <form
                className="space-y-1.5 pt-0.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const message = commitMessage.trim();
                  if (message && !commitMutation.isPending) commitMutation.mutate(message);
                }}
              >
                <Textarea
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder={t('Commit message')}
                  rows={2}
                  className="min-h-[3rem] text-[11px]"
                  autoFocus
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    type="submit"
                    size="sm"
                    className="h-7 flex-1 text-[11px]"
                    disabled={!commitMessage.trim() || commitMutation.isPending}
                  >
                    {commitMutation.isPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : null}
                    {t('Commit all changes')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={() => setCommitOpen(false)}
                  >
                    {t('Cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                size="sm"
                className="mt-0.5 h-7 w-full text-[11px]"
                disabled={changeCount === 0}
                onClick={() => setCommitOpen(true)}
              >
                {t('Commit or push')}
              </Button>
            )}
          </>
        ) : (
          <PanelRow className="text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> {t('Loading...')}
          </PanelRow>
        )}

        {/* ── Goal ────────────────────────────────────────────────── */}
        <section className="rounded-lg border bg-card/50 p-2">
          <header className="flex items-center gap-1.5 px-0.5 pb-1">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">{t('Goal')}</span>
            <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {goalState}
            </span>
          </header>
          <div className="flex items-start gap-1.5 px-1.5 py-1 text-[11px]">
            <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              {t('No session goal is set; the engine follows your messages instead.')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-1.5 pt-1 font-mono text-[10px] text-muted-foreground">
            <span>{stats.turns}</span>
            <span className="opacity-40">·</span>
            {stats.context && (
              <>
                <span>{stats.context}</span>
                <span className="opacity-40">·</span>
              </>
            )}
            <span>{stats.tokens} tokens</span>
          </div>
        </section>

        {/* ── Progress ────────────────────────────────────────────── */}
        <section className="rounded-lg border bg-card/50 p-2">
          <header className="flex items-center gap-1.5 px-0.5 pb-1">
            <Check className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">{t('Process')}</span>
            {steps.length > 0 && (
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                {doneSteps}/{steps.length}
              </span>
            )}
          </header>

          {steps.length === 0 ? (
            <div className="px-1.5 py-1 text-[11px] text-muted-foreground">
              {loading ? t('Loading...') : t('The engine has not published a task list yet.')}
            </div>
          ) : (
            <ul className="space-y-0.5 pt-0.5">
              {steps.map((step, index) => (
                <li
                  key={`${index}:${step.step}`}
                  className="flex items-start gap-1.5 rounded-md px-1.5 py-1 text-[11px] leading-snug hover:bg-accent/40"
                >
                  <StepIcon status={step.status} />
                  <span
                    className={cn(
                      'min-w-0 break-words',
                      step.status === 'completed' && 'text-muted-foreground/60',
                      step.status === 'inProgress' && 'font-medium',
                    )}
                  >
                    {step.step}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Quiet row used by the repository block. */
function PanelRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-center gap-1.5 px-1.5 py-1 text-[11px]', className)}>
      {children}
    </div>
  );
}

/** Done steps check off, the active one gets an arrow, the rest stay hollow. */
function StepIcon({ status }: { status: TurnPlanStepStatus }) {
  if (status === 'completed') {
    return <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />;
  }
  if (status === 'inProgress') {
    return <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-foreground" />;
  }
  return <Circle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40" />;
}
