import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Terminal,
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
import { cn } from '@/lib/utils';
import {
  ompUpdateCheckUpdateOptions,
  ompUpdateCheckUpdateQueryKey,
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

  const updateQuery = useQuery(ompUpdateCheckUpdateOptions());
  const updateData = updateQuery.data;

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

  const handleCopyCommand = async (cmd: string) => {
    await copyTextToClipboard(cmd);
    showSnackbar(t('Command copied to clipboard'), 'success');
  };

  const handleRefresh = async () => {
    setOutputLog(null);
    await queryClient.invalidateQueries({ queryKey: ompUpdateCheckUpdateQueryKey() });
    showSnackbar(t('Update status refreshed'), 'info');
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
              <span>{updateData?.updateCommand || 'omp update'}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleCopyCommand(updateData?.updateCommand || 'omp update')}
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
            disabled={updateQuery.isFetching}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', updateQuery.isFetching && 'animate-spin')} />
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
                onClick={() => upgradeMutation.mutate({ body: {} })}
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
