import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Terminal,
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
import { cn } from '@/lib/utils';
import {
  ompUpdateAddCustomMirrorMutation,
  ompUpdateCheckUpdateOptions,
  ompUpdateCheckUpdateQueryKey,
  ompUpdateGetMirrorsOptions,
  ompUpdateGetMirrorsQueryKey,
  ompUpdateUpgradeMutation,
} from '@/generated/api/@tanstack/react-query.gen';
import { showSnackbar } from '@/stores/snackbar-store';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getApiErrorMessage } from '@/lib/api-error';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OmpUpdateDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [outputLog, setOutputLog] = useState<string | null>(null);
  const [selectedMirrorId, setSelectedMirrorId] = useState<string>('auto');
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  // Version check query
  const updateQuery = useQuery(ompUpdateCheckUpdateOptions());
  const updateData = updateQuery.data;

  // Mirror latency query
  const mirrorsQuery = useQuery(
    ompUpdateGetMirrorsOptions({
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
  const manualCommand = useMemo(() => {
    if (!effectiveMirrorUrl || effectiveMirrorUrl === 'https://github.com/' || effectiveMirrorUrl === 'direct') {
      return updateData?.updateCommand || 'omp update';
    }
    if (effectiveMirrorUrl.startsWith('http://') || effectiveMirrorUrl.startsWith('socks')) {
      return `HTTPS_PROXY=${effectiveMirrorUrl} omp update`;
    }
    return `GH_PROXY=${effectiveMirrorUrl} omp update`;
  }, [effectiveMirrorUrl, updateData?.updateCommand]);

  // Upgrade mutation
  const upgradeMutation = useMutation({
    ...ompUpdateUpgradeMutation(),
    onSuccess: (data) => {
      setOutputLog(data.output || data.message);
      if (data.success) {
        showSnackbar(t('OMP upgrade completed successfully!'), 'success');
        void queryClient.invalidateQueries({ queryKey: ompUpdateCheckUpdateQueryKey() });
      } else {
        showSnackbar(data.message, 'error');
      }
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  // Add custom mirror mutation
  const addCustomMirrorMutation = useMutation({
    ...ompUpdateAddCustomMirrorMutation(),
    onSuccess: (data) => {
      showSnackbar(t('Custom mirror added'), 'success');
      setSelectedMirrorId(data.id);
      setCustomOpen(false);
      setCustomName('');
      setCustomUrl('');
      void queryClient.invalidateQueries({ queryKey: ompUpdateGetMirrorsQueryKey() });
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
      queryClient.invalidateQueries({ queryKey: ompUpdateCheckUpdateQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ompUpdateGetMirrorsQueryKey() }),
    ]);
    showSnackbar(t('Update status refreshed'), 'info');
  };

  const handleAddCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = customUrl.trim();
    if (!trimmedUrl) return;
    addCustomMirrorMutation.mutate({
      body: {
        name: customName.trim() || trimmedUrl,
        url: trimmedUrl,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>{t('OMP Version & Updates')}</DialogTitle>
              <DialogDescription className="text-xs">
                {t('Check Oh My Pi coding agent CLI version and release updates')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Version Status Box */}
          <div className="rounded-xl border bg-muted/40 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                  {t('Current Version')}
                </span>
                <span className="text-base font-mono font-bold text-foreground">
                  v{updateData?.currentVersion || '...'}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                  {t('Latest Version')}
                </span>
                <span className="text-base font-mono font-bold text-foreground">
                  v{updateData?.latestVersion || '...'}
                </span>
              </div>
            </div>

            {/* Status Alert */}
            {updateQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>{t('Checking for latest updates...')}</span>
              </div>
            ) : updateData?.hasUpdate ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
                  <p className="font-semibold">
                    {t('New version v{{version}} available!', { version: updateData.latestVersion })}
                  </p>
                  {updateData.releaseUrl && (
                    <a
                      href={updateData.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] underline text-emerald-600 dark:text-emerald-400"
                    >
                      {t('View release notes on GitHub')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-2.5 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-medium text-foreground">
                  {t('Your OMP engine is currently up to date')}
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
              <form onSubmit={handleAddCustomSubmit} className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
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
                    onClick={() => setCustomOpen(false)}
                    className="h-6 text-xs px-2"
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!customUrl.trim() || addCustomMirrorMutation.isPending}
                    className="h-6 text-xs px-2"
                  >
                    {addCustomMirrorMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    {t('Add')}
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
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMirrorId(m.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors',
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
                </button>
              ))}
            </div>
          </div>

          {/* Terminal Command Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                {t('Manual Update Command')}
              </span>
              <span className="text-[10px] text-muted-foreground">{t('Run in terminal')}</span>
            </label>
            <div className="flex items-center justify-between rounded-lg border bg-muted/60 px-3 py-2 font-mono text-xs text-foreground">
              <span className="truncate pr-2">{manualCommand}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => handleCopyCommand(manualCommand)}
                title={t('Copy command')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

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
            {updateData?.hasUpdate && (
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
                disabled={upgradeMutation.isPending}
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {upgradeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {t('Upgrade Now')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
