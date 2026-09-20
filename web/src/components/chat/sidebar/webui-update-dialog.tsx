import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  Flame,
  Gauge,
  GitBranch,
  GitCommit,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  ompUpdateAddCustomMirrorMutation,
  ompUpdateDeleteCustomMirrorMutation,
  ompUpdateEditCustomMirrorMutation,
  webuiUpdateCancelUpgradeMutation,
  webuiUpdateCheckUpdateOptions,
  webuiUpdateCheckUpdateQueryKey,
  webuiUpdateGetMirrorsOptions,
  webuiUpdateGetMirrorsQueryKey,
  webuiUpdateGetProgressOptions,
  webuiUpdateGetProgressQueryKey,
  webuiUpdateUpgradeMutation,
} from '@/generated/api/@tanstack/react-query.gen';
import { showSnackbar } from '@/stores/snackbar-store';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getApiErrorMessage } from '@/lib/api-error';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WebuiUpdateDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [outputLog, setOutputLog] = useState<string | null>(null);
  const [selectedMirrorId, setSelectedMirrorId] = useState<string>('auto');
  const [customOpen, setCustomOpen] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [cmdTab, setCmdTab] = useState<'git' | 'docker'>('git');
  const updateQuery = useQuery(webuiUpdateCheckUpdateOptions());
  const updateData = updateQuery.data;

  // Default to Docker tab if running inside container
  useEffect(() => {
    if (updateData?.isDocker) {
      setCmdTab('docker');
    }
  }, [updateData?.isDocker]);

  // Mirror latency query
  const mirrorsQuery = useQuery(
    webuiUpdateGetMirrorsOptions({
      query: { ping: true },
    }),
  );
  const mirrors = mirrorsQuery.data?.mirrors ?? [];
  const fastestMirror = mirrors.find((m) => m.isFastest) ?? mirrors.find((m) => m.available);

  // Resolved mirror URL based on user selection
  const effectiveMirrorUrl = useMemo(() => {
    if (selectedMirrorId === 'auto') {
      return fastestMirror?.url;
    }
    const found = mirrors.find((m) => m.id === selectedMirrorId);
    return found?.url;
  }, [selectedMirrorId, fastestMirror, mirrors]);

  // Terminal command preview
  const gitCommand = useMemo(() => {
    if (!effectiveMirrorUrl || effectiveMirrorUrl === 'https://github.com/' || effectiveMirrorUrl === 'direct') {
      return 'git pull origin main && pnpm build';
    }
    if (effectiveMirrorUrl.startsWith('http://') || effectiveMirrorUrl.startsWith('socks')) {
      return `HTTPS_PROXY=${effectiveMirrorUrl} git pull origin main && pnpm build`;
    }
    const prefix = effectiveMirrorUrl.endsWith('/') ? effectiveMirrorUrl : `${effectiveMirrorUrl}/`;
    return `git pull ${prefix}https://github.com/jinghuashang/oh-my-pi-webui.git main && pnpm build`;
  }, [effectiveMirrorUrl]);

  const dockerCommand = useMemo(() => {
    return updateData?.dockerCommand || 'git pull && docker compose up -d --build';
  }, [updateData?.dockerCommand]);

  // Upgrade mutation
  const upgradeMutation = useMutation({
    ...webuiUpdateUpgradeMutation(),
    onSuccess: (data) => {
      setOutputLog(data.output || data.message);
      if (data.success) {
        showSnackbar(t('WebUI updated successfully! Please refresh or restart.'), 'success');
        void queryClient.invalidateQueries({ queryKey: webuiUpdateCheckUpdateQueryKey() });
      } else {
        showSnackbar(data.message, 'error');
      }
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });
  // Real-time progress polling query while upgrading
  const progressQuery = useQuery({
    ...webuiUpdateGetProgressOptions(),
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return upgradeMutation.isPending || st === 'pulling' || st === 'building' ? 400 : false;
    },
  });

  // Cancel in-progress upgrade mutation
  const cancelMutation = useMutation({
    ...webuiUpdateCancelUpgradeMutation(),
    onSuccess: (data) => {
      const msg = typeof (data as Record<string, unknown>)?.message === 'string' ? ((data as Record<string, unknown>).message as string) : t('Update cancelled');
      showSnackbar(msg, 'info');
      void queryClient.invalidateQueries({ queryKey: webuiUpdateGetProgressQueryKey() });
      upgradeMutation.reset();
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  const isRunning =
    upgradeMutation.isPending ||
    progressQuery.data?.status === 'pulling' ||
    progressQuery.data?.status === 'building';
  // Add custom mirror mutation
  const addCustomMirrorMutation = useMutation({
    ...ompUpdateAddCustomMirrorMutation(),
    onSuccess: (data) => {
      showSnackbar(t('Custom mirror added'), 'success');
      setSelectedMirrorId(data.id);
      setCustomOpen(false);
      setEditingCustomId(null);
      setCustomName('');
      setCustomUrl('');
      void queryClient.invalidateQueries({ queryKey: webuiUpdateGetMirrorsQueryKey() });
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  // Edit custom mirror mutation
  const editCustomMirrorMutation = useMutation({
    ...ompUpdateEditCustomMirrorMutation(),
    onSuccess: () => {
      showSnackbar(t('Custom mirror updated'), 'success');
      setCustomOpen(false);
      setEditingCustomId(null);
      setCustomName('');
      setCustomUrl('');
      void queryClient.invalidateQueries({ queryKey: webuiUpdateGetMirrorsQueryKey() });
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  // Delete custom mirror mutation
  const deleteCustomMirrorMutation = useMutation({
    ...ompUpdateDeleteCustomMirrorMutation(),
    onSuccess: () => {
      showSnackbar(t('Custom mirror deleted'), 'info');
      void queryClient.invalidateQueries({ queryKey: webuiUpdateGetMirrorsQueryKey() });
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });
  const handleCopyCommand = async (cmd: string) => {
    await copyTextToClipboard(cmd);
    showSnackbar(t('Command copied to clipboard'), 'success');
  };

  const handleRefresh = async () => {
    setOutputLog(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: webuiUpdateCheckUpdateQueryKey() }),
      queryClient.invalidateQueries({ queryKey: webuiUpdateGetMirrorsQueryKey() }),
    ]);
    showSnackbar(t('Update status refreshed'), 'info');
  };

  const handleAddOrEditCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = customUrl.trim();
    if (!trimmedUrl) return;
    if (editingCustomId) {
      editCustomMirrorMutation.mutate({
        path: { id: editingCustomId },
        body: {
          name: customName.trim() || trimmedUrl,
          url: trimmedUrl,
        },
      });
    } else {
      addCustomMirrorMutation.mutate({
        body: {
          name: customName.trim() || trimmedUrl,
          url: trimmedUrl,
        },
      });
    }
  };

  const handleStartEditMirror = (e: React.MouseEvent, m: { id: string; name: string; url: string }) => {
    e.stopPropagation();
    setEditingCustomId(m.id);
    setCustomName(m.name);
    setCustomUrl(m.url);
    setCustomOpen(true);
  };

  const handleDeleteMirror = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (selectedMirrorId === id) setSelectedMirrorId('auto');
    deleteCustomMirrorMutation.mutate({ path: { id } });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-w-lg overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>{t('Oh My Pi WebUI Updates')}</DialogTitle>
              <DialogDescription className="text-xs">
                {t('Check WebUI GitHub commits, release updates and mirror acceleration')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1 min-w-0 max-w-full">
          {/* Version & Commit Status Box */}
          <div className="rounded-xl border bg-muted/40 p-3.5 space-y-3 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                  {t('Current Commit')}
                </span>
                <span className="text-sm font-mono font-bold text-foreground flex items-center gap-1.5 mt-0.5">
                  <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{updateData?.currentCommit || '...'}</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    (v{updateData?.currentVersion || '0.1.0'})
                  </span>
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                  {t('Remote Latest')}
                </span>
                <span className="text-sm font-mono font-bold text-foreground flex items-center justify-end gap-1.5 mt-0.5">
                  <GitCommit className="h-3.5 w-3.5 text-primary" />
                  <span>{updateData?.latestCommit || '...'}</span>
                </span>
              </div>
            </div>

            {/* Status Alert */}
            {updateQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>{t('Checking for WebUI updates...')}</span>
              </div>
            ) : updateData?.isDocker && updateData?.hasUpdate ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <Flame className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-700 dark:text-emerald-300 space-y-1 flex-1">
                    <p className="font-semibold">
                      {t('Docker Container In-Place Update Available (Commit {{commit}})', { commit: updateData?.latestCommit })}
                    </p>
                    {updateData.commitMessage && (
                      <p className="text-[11px] font-mono text-muted-foreground line-clamp-2">
                        {updateData.commitMessage}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t('WebUI will hot-patch container files via GitHub mirror and synchronize build overlay to persistent volume (./data/webui_overlay).')}
                    </p>
                  </div>
                </div>
              </div>
            ) : updateData?.currentCommit === 'unknown' ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <Flame className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1 flex-1">
                    <p className="font-semibold">
                      {t('Running in lean/container environment without local Git commit tag')}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t('Remote latest commit is {{commit}}. You can pull the latest update or rebuild below.', {
                        commit: updateData?.latestCommit,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ) : updateData?.hasUpdate ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-700 dark:text-emerald-300 space-y-1 flex-1">
                    <p className="font-semibold">
                      {t('New WebUI commit available!')}
                    </p>
                    {updateData.commitMessage && (
                      <p className="font-mono text-[11px] text-foreground/80 bg-background/50 rounded p-1 line-clamp-2 break-all">
                        {updateData.commitMessage}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                      <span>{updateData.commitAuthor ? `by ${updateData.commitAuthor}` : ''}</span>
                      <a
                        href={`${updateData.repoUrl}/commit/${updateData.latestCommit}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 underline text-emerald-600 dark:text-emerald-400"
                      >
                        {t('View commit on GitHub')}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-2.5 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-medium text-foreground">
                  {t('Your WebUI is up to date with the latest commit')}
                </span>
              </div>
            )}
          </div>

          {/* Mirror Proxy & Speed Test Section */}
          <div className="rounded-xl border bg-card p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <span>{t('Update Mirror & Proxy')}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => mirrorsQuery.refetch()}
                  disabled={mirrorsQuery.isFetching}
                  className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                >
                  <Gauge className={cn('h-3 w-3', mirrorsQuery.isFetching && 'animate-spin')} />
                  <span>{t('Speed Test')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomOpen(!customOpen)}
                  className="h-6 px-1.5 text-[11px] gap-1"
                >
                  <Plus className="h-3 w-3" />
                  <span>{t('Add Custom Mirror')}</span>
                </Button>
              </div>
            </div>

            {/* Custom Mirror Inline Input Form */}
            {customOpen && (
              <form onSubmit={handleAddOrEditCustomSubmit} className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground pb-0.5">
                  <span>{editingCustomId ? t('Edit Custom Mirror') : t('Add Custom Mirror')}</span>
                  {editingCustomId && (
                    <span className="text-[10px] text-muted-foreground font-mono">ID: {editingCustomId}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={t('Mirror Name')}
                    className="h-7 text-xs font-mono"
                  />
                  <Input
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder={t('Mirror URL or Proxy')}
                    className="h-7 text-xs font-mono"
                    required
                  />
                </div>
                <div className="flex justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCustomOpen(false);
                      setEditingCustomId(null);
                      setCustomName('');
                      setCustomUrl('');
                    }}
                    className="h-6 text-xs px-2"
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!customUrl.trim() || addCustomMirrorMutation.isPending || editCustomMirrorMutation.isPending}
                    className="h-6 text-xs px-2"
                  >
                    {(addCustomMirrorMutation.isPending || editCustomMirrorMutation.isPending) && (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    )}
                    {editingCustomId ? t('Save') : t('Add')}
                  </Button>
                </div>
              </form>
            )}

            {/* Mirror Selection Chips */}
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {/* Auto Fastest option */}
              <button
                type="button"
                onClick={() => setSelectedMirrorId('auto')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors',
                  selectedMirrorId === 'auto'
                    ? 'border-primary bg-primary/10 font-semibold text-primary shadow-xs'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <Zap className="h-3 w-3 text-amber-500" />
                <span>{t('Auto Fastest')}</span>
                {fastestMirror?.latencyMs && fastestMirror.latencyMs > 0 ? (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                    {fastestMirror.latencyMs}ms
                  </Badge>
                ) : null}
              </button>

              {/* Individual Mirrors */}
              {mirrors.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMirrorId(m.id)}
                  className={cn(
                    'group flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors cursor-pointer',
                    selectedMirrorId === m.id
                      ? 'border-primary bg-primary/10 font-semibold text-primary shadow-xs'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  <span>{t(m.name)}</span>
                  {m.latencyMs && m.latencyMs > 0 ? (
                    <span
                      className={cn(
                        'font-mono text-[10px]',
                        m.latencyMs < 1000
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {m.latencyMs}ms
                    </span>
                  ) : m.latencyMs === -1 ? (
                    <span className="font-mono text-[10px] text-muted-foreground/60">timeout</span>
                  ) : null}

                  {m.isCustom && (
                    <div className="flex items-center gap-0.5 ml-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleStartEditMirror(e, m)}
                        className="p-0.5 rounded hover:bg-muted hover:text-foreground"
                        title={t('Edit mirror')}
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteMirror(e, m.id)}
                        className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
                        title={t('Delete mirror')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Terminal Command Box */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('Manual Update Command')}</span>
              </label>

              <div className="flex items-center gap-1 border rounded p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setCmdTab('git')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
                    cmdTab === 'git' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground',
                  )}
                >
                  Git
                </button>
                <button
                  type="button"
                  onClick={() => setCmdTab('docker')}
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
                    cmdTab === 'docker' ? 'bg-background shadow-xs text-foreground font-semibold' : 'text-muted-foreground',
                  )}
                >
                  Docker
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/60 px-3 py-2 font-mono text-xs text-foreground min-w-0 overflow-hidden">
              <span className="truncate min-w-0 flex-1 pr-2">{cmdTab === 'git' ? gitCommand : dockerCommand}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => handleCopyCommand(cmdTab === 'git' ? gitCommand : dockerCommand)}
                title={t('Copy command')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Real-time WebUI Upgrade Progress Card */}
          {isRunning && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2 min-w-0">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="truncate">
                    {progressQuery.data?.stage || t('Updating WebUI...')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {progressQuery.data?.speedFormatted && (
                    <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      {progressQuery.data.speedFormatted}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelMutation.mutate({})}
                    disabled={cancelMutation.isPending}
                    className="h-6 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                    title={t('Cancel update')}
                  >
                    <Square className="h-3 w-3 fill-current" />
                    <span>{t('Cancel')}</span>
                  </Button>
                </div>
              </div>
              <Progress value={progressQuery.data?.percent || 0} className="h-2" />

              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>{progressQuery.data?.stage || ''}</span>
                <span>{progressQuery.data?.percent || 0}%</span>
              </div>
            </div>
          )}

          {/* Output Log if upgrade was executed */}
          {outputLog && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('Execution Log')}:</span>
              <pre className="max-h-36 overflow-auto rounded-lg bg-black/90 p-2.5 font-mono text-[11px] text-emerald-400 whitespace-pre-wrap">
                {outputLog}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={updateQuery.isFetching || mirrorsQuery.isFetching}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (updateQuery.isFetching || mirrorsQuery.isFetching) && 'animate-spin')} />
            {t('Check Again')}
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
              {t('Close')}
            </Button>
            {updateData?.canAutoUpdate ? (
              (updateData?.hasUpdate || updateData?.currentCommit === 'unknown') && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    upgradeMutation.mutate({
                      body: {
                        mirrorUrl: effectiveMirrorUrl,
                      },
                    })
                  }
                  disabled={isRunning}
                >
                  {upgradeMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {t('Upgrade WebUI')}
                </Button>
              )
            ) : (
              (updateData?.hasUpdate || updateData?.isDocker || updateData?.currentCommit === 'unknown') && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleCopyCommand(cmdTab === 'git' ? gitCommand : dockerCommand)}
                  className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t('Copy Host Update Command')}
                </Button>
              )
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
