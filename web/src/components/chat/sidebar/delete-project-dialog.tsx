import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FolderX, Info, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { showSnackbar } from '@/stores/snackbar-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  filesGetRootsQueryKey,
  projectsDeleteProjectMutation,
  projectsListProjectsQueryKey,
  threadsListOverviewOptions,
  threadsListOverviewQueryKey,
} from '@/generated/api/@tanstack/react-query.gen';

interface Props {
  open: boolean;
  onClose: () => void;
  workspacePath: string | null;
  workspaceName?: string;
}

export function DeleteProjectDialog({
  open,
  onClose,
  workspacePath,
  workspaceName,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {open && workspacePath && (
        <DeleteProjectContent
          workspacePath={workspacePath}
          workspaceName={workspaceName}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function DeleteProjectContent({
  workspacePath,
  workspaceName,
  onClose,
}: {
  workspacePath: string;
  workspaceName?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deleteDirectory, setDeleteDirectory] = useState(false);

  // Query overview threads to find conversations in this workspace
  const overviewQuery = useQuery(threadsListOverviewOptions({ query: { limit: 100 } }));
  const threadsInProject = (overviewQuery.data?.data ?? []).filter((row) => {
    const cwd = row.thread?.cwd;
    if (!cwd) return false;
    const normalizedCwd = cwd.replace(/\\/g, '/').toLowerCase();
    const normalizedTarget = workspacePath.replace(/\\/g, '/').toLowerCase();
    return (
      normalizedCwd === normalizedTarget ||
      normalizedCwd.startsWith(normalizedTarget.endsWith('/') ? normalizedTarget : `${normalizedTarget}/`)
    );
  });
  const hasRemainingThreads = threadsInProject.length > 0;
  const name =
    workspaceName ||
    workspacePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ||
    'project';

  const deleteMutation = useMutation({
    ...projectsDeleteProjectMutation(),
    onSuccess: (data) => {
      showSnackbar(
        data.deletedDirectory
          ? t('Project "{{name}}" and local directory deleted successfully', { name: data.name })
          : t('Project "{{name}}" removed successfully', { name: data.name }),
        'success',
      );

      // Invalidate queries
      void queryClient.invalidateQueries({ queryKey: threadsListOverviewQueryKey() });
      void queryClient.invalidateQueries({ queryKey: projectsListProjectsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: filesGetRootsQueryKey() });

      // If active thread is in this workspace, navigate to home
      const currentCwd = useTimelineStore.getState().threadCwd;
      if (currentCwd && (currentCwd === workspacePath || currentCwd.startsWith(workspacePath))) {
        useTimelineStore.getState().clearThread();
        void navigate({ to: '/' });
      }

      onClose();
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate({
      path: { name },
      query: { deleteDirectory },
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <FolderX className="h-4 w-4" />
          </div>
          <div>
            <DialogTitle>{t('Delete Project')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t('Delete project from WebUI workspace and optionally clean up disk files')}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 pt-1">
        <div className="rounded-xl border bg-muted/40 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('Project Name')}:</span>
            <span className="font-semibold text-foreground font-mono">{name}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('Directory Path')}:</span>
            <span className="font-mono text-[11px] text-foreground truncate max-w-[260px]" title={workspacePath}>
              {workspacePath}
            </span>
          </div>
        </div>

        {/* Remaining Threads Warning / Blocker */}
        {hasRemainingThreads ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold">
                  {t('Cannot delete project: {{count}} conversation(s) still active', {
                    count: threadsInProject.length,
                  })}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t('To prevent accidental data loss, please delete all conversations under this project before removing the project.')}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-background/60 p-2 space-y-1 max-h-24 overflow-y-auto border border-amber-500/20">
              {threadsInProject.slice(0, 5).map((tRow) => (
                <div key={tRow.thread.id} className="flex items-center gap-1.5 text-[11px] font-mono text-foreground truncate">
                  <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{tRow.thread.preview || tRow.thread.id}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
              {t('All conversations under this project have been cleared. Ready to delete.')}
            </span>
          </div>
        )}
        {/* Delete Local Directory Checkbox */}
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteDirectory}
              onChange={(e) => setDeleteDirectory(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-destructive focus:ring-destructive accent-destructive"
            />
            <div className="space-y-0.5 flex-1">
              <span className="text-xs font-semibold text-destructive block">
                {t('Also delete local directory on disk')}
              </span>
              <span className="text-[11px] text-muted-foreground block leading-relaxed">
                {t('If checked, the physical folder and all files inside will be permanently deleted from disk.')}
              </span>
            </div>
          </label>

          {deleteDirectory && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive pt-1 border-t border-destructive/10">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{t('Warning: Physical files cannot be recovered once deleted!')}</span>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={deleteMutation.isPending}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={deleteMutation.isPending || hasRemainingThreads}
          className="gap-1.5"
        >
          {deleteMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {t('Delete')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
