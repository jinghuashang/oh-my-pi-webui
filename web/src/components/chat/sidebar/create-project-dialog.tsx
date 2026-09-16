import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FolderGit2, FolderPlus, GitBranch, Loader2, Sparkles } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { showSnackbar } from '@/stores/snackbar-store';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  projectsCreateProjectMutation,
  projectsListProjectsOptions,
  threadsListOverviewOptions,
} from '@/generated/api/@tanstack/react-query.gen';
interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {open && <CreateProjectContent onClose={onClose} />}
    </Dialog>
  );
}

function CreateProjectContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [initGit, setInitGit] = useState(true);

  const projectsQuery = useQuery(projectsListProjectsOptions());
  const baseDir = projectsQuery.data?.baseDir ?? 'data/projects';
  const existingProjects = projectsQuery.data?.projects ?? [];

  const createMutation = useMutation({
    ...projectsCreateProjectMutation(),
    onSuccess: (data) => {
      showSnackbar(t('Project "{{name}}" created successfully', { name: data.name }), 'success');
      void queryClient.invalidateQueries({ queryKey: threadsListOverviewOptions().queryKey });
      void queryClient.invalidateQueries({ queryKey: projectsListProjectsOptions().queryKey });
      onClose();
      void navigate({ to: '/t/$threadId', params: { threadId: data.threadId } });
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  const sanitizedPreview = name.trim().replace(/[\/\\..]/g, '');
  const targetPathPreview = `${baseDir}/${sanitizedPreview || '...'}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createMutation.mutate({
      body: {
        name: trimmed,
        initialPrompt: initialPrompt.trim() || undefined,
        initGit,
      },
    });
  };

  return (
    <DialogContent className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderPlus className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>{t('New Project Session')}</DialogTitle>
              <DialogDescription className="text-xs">
                {t('Create project directory under data/projects and start session')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {/* Project Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t('Project Name')} <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g. my-awesome-app')}
              className="text-xs"
              autoFocus
              required
            />
            <p className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground truncate" title={targetPathPreview}>
              <FolderGit2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{targetPathPreview}</span>
            </p>
          </div>

          {/* Initial Prompt */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>{t('Initial Requirement / Goal (Optional)')}</span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Sparkles className="h-2.5 w-2.5" />
                {t('Auto-starts turn')}
              </span>
            </label>
            <Textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder={t('e.g. Build a snake game with Vue 3 and Tailwind CSS')}
              rows={2}
              className="text-xs leading-relaxed"
            />
          </div>

          {/* Git init toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs">{t('Initialize Git Repository (git init)')}</span>
            </div>
            <Switch checked={initGit} onCheckedChange={setInitGit} />
          </div>

          {/* Existing Projects Quick Entry */}
          {existingProjects.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t('Existing Projects under data/ ({{count}})', { count: existingProjects.length })}:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {existingProjects.slice(0, 8).map((proj) => (
                  <Badge
                    key={proj.path}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent text-[10px] font-mono py-0.5"
                    onClick={() => setName(proj.name)}
                  >
                    {proj.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!name.trim() || createMutation.isPending}
            className="gap-1.5"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderPlus className="h-3.5 w-3.5" />
            )}
            {t('Create Project & Start')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
