import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FolderDown, FolderGit2, FolderPlus, GitBranch, GitFork, Loader2, Sparkles, Square, Terminal } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { showSnackbar } from '@/stores/snackbar-store';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  projectsCancelCloneMutation,
  projectsCloneProjectMutation,
  projectsCreateProjectMutation,
  projectsGetCloneProgressOptions,
  projectsGetCloneProgressQueryKey,
  projectsListProjectsOptions,
  threadsListOverviewOptions,
} from '@/generated/api/@tanstack/react-query.gen';
import { Progress } from '@/components/ui/progress';
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

  const [tab, setTab] = useState<'blank' | 'github'>('blank');

  // Blank project state
  const [name, setName] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [initGit, setInitGit] = useState(true);

  // GitHub clone state
  const [gitUrl, setGitUrl] = useState('');
  const [gitName, setGitName] = useState('');
  const [gitNameTouched, setGitNameTouched] = useState(false);
  const [branch, setBranch] = useState('');
  const [shallow, setShallow] = useState(true);
  const [gitInitialPrompt, setGitInitialPrompt] = useState('');

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

  const cloneMutation = useMutation({
    ...projectsCloneProjectMutation(),
    onSuccess: (data) => {
      showSnackbar(
        t('Repository "{{name}}" cloned and opened successfully', { name: data.name }),
        'success',
      );
      void queryClient.invalidateQueries({ queryKey: threadsListOverviewOptions().queryKey });
      void queryClient.invalidateQueries({ queryKey: projectsListProjectsOptions().queryKey });
      onClose();
      void navigate({ to: '/t/$threadId', params: { threadId: data.threadId } });
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  // Real-time git clone progress polling query
  const cloneProgressQuery = useQuery({
    ...projectsGetCloneProgressOptions(),
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return cloneMutation.isPending || st === 'cloning' ? 400 : false;
    },
  });

  // Cancel in-progress git clone mutation
  const cancelCloneMutation = useMutation({
    ...projectsCancelCloneMutation(),
    onSuccess: (data) => {
      const msg = typeof (data as Record<string, unknown>)?.message === 'string'
        ? ((data as Record<string, unknown>).message as string)
        : t('Git clone cancelled');
      showSnackbar(msg, 'info');
      void queryClient.invalidateQueries({ queryKey: projectsGetCloneProgressQueryKey() });
      cloneMutation.reset();
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  const isCloning = cloneMutation.isPending || cloneProgressQuery.data?.status === 'cloning';

  const handleGitUrlChange = (val: string) => {
    setGitUrl(val);
    if (!gitNameTouched) {
      const clean = val.trim().replace(/\.git$/, '').replace(/\/+$/, '');
      const lastPart = clean.split(/[/:]/).pop() || '';
      const derived = lastPart.replace(/[^a-zA-Z0-9_-]/g, '');
      if (derived) {
        setGitName(derived);
      }
    }
  };

  const sanitizedPreview = name.trim().replace(/[\/\\..]/g, '');
  const targetPathPreview = `${baseDir}/${sanitizedPreview || '...'}`;

  const sanitizedGitPreview = gitName.trim().replace(/[\/\\..]/g, '');
  const gitTargetPathPreview = `${baseDir}/${sanitizedGitPreview || '...'}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'blank') {
      const trimmed = name.trim();
      if (!trimmed) return;
      createMutation.mutate({
        body: {
          name: trimmed,
          initialPrompt: initialPrompt.trim() || undefined,
          initGit,
        },
      });
    } else {
      const trimmedUrl = gitUrl.trim();
      if (!trimmedUrl) return;
      cloneMutation.mutate({
        body: {
          url: trimmedUrl,
          name: gitName.trim() || undefined,
          branch: branch.trim() || undefined,
          shallow,
          initialPrompt: gitInitialPrompt.trim() || undefined,
        },
      });
    }
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

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 rounded-lg bg-muted/60 p-1 border">
          <button
            type="button"
            onClick={() => setTab('blank')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
              tab === 'blank'
                ? 'bg-background text-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            {t('Blank Project')}
          </button>
          <button
            type="button"
            onClick={() => setTab('github')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
              tab === 'github'
                ? 'bg-background text-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FolderDown className="h-3.5 w-3.5" />
            {t('Clone from GitHub')}
          </button>
        </div>

        {tab === 'blank' ? (
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
              <p
                className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground truncate"
                title={targetPathPreview}
              >
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
        ) : (
          <div className="space-y-3 pt-1">
            {/* GitHub URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {t('GitHub Repository URL')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={gitUrl}
                onChange={(e) => handleGitUrlChange(e.target.value)}
                placeholder={t('e.g. can1357/oh-my-pi or https://github.com/can1357/oh-my-pi')}
                className="text-xs font-mono"
                autoFocus
                required
              />
            </div>

            {/* Directory Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {t('Directory Name')}
              </label>
              <Input
                value={gitName}
                onChange={(e) => {
                  setGitName(e.target.value);
                  setGitNameTouched(true);
                }}
                placeholder={t('e.g. my-awesome-app')}
                className="text-xs"
              />
              <p
                className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground truncate"
                title={gitTargetPathPreview}
              >
                <FolderGit2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{gitTargetPathPreview}</span>
              </p>
            </div>

            {/* Branch / Tag */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {t('Branch / Tag (Optional)')}
              </label>
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder={t('Default branch (main/master)')}
                className="text-xs"
              />
            </div>

            {/* Fast shallow clone switch */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <GitFork className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs">{t('Fast Shallow Clone (--depth 1)')}</span>
              </div>
              <Switch checked={shallow} onCheckedChange={setShallow} />
            </div>

            {/* Initial Goal Prompt */}
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-medium text-foreground">
                <span>{t('Initial Requirement / Goal (Optional)')}</span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Sparkles className="h-2.5 w-2.5" />
                  {t('Auto-starts turn')}
                </span>
              </label>
              <Textarea
                value={gitInitialPrompt}
                onChange={(e) => setGitInitialPrompt(e.target.value)}
                placeholder={t('e.g. Analyze project structure and run setup')}
                rows={2}
                className="text-xs leading-relaxed"
              />
            </div>

            {/* Real-time Git Clone Progress Card & Output Log */}
            {isCloning && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="truncate">
                      {cloneProgressQuery.data?.stage || t('Cloning repository from GitHub...')}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelCloneMutation.mutate({})}
                    disabled={cancelCloneMutation.isPending}
                    className="h-6 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                    title={t('Cancel clone')}
                  >
                    <Square className="h-3 w-3 fill-current" />
                    <span>{t('Cancel')}</span>
                  </Button>
                </div>

                <Progress value={cloneProgressQuery.data?.percent || 10} className="h-2" />

                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span className="truncate">{cloneProgressQuery.data?.url || gitUrl}</span>
                  <span>{cloneProgressQuery.data?.percent || 0}%</span>
                </div>

                {cloneProgressQuery.data?.outputLog && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      <Terminal className="h-3 w-3" />
                      <span>{t('Clone Output Log')}:</span>
                    </div>
                    <pre className="max-h-28 overflow-auto rounded-md bg-black/90 p-2 font-mono text-[10px] text-emerald-400 whitespace-pre-wrap leading-tight">
                      {cloneProgressQuery.data.outputLog}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isCloning}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={
              createMutation.isPending ||
              isCloning ||
              (tab === 'blank' ? !name.trim() : !gitUrl.trim())
            }
            className="gap-1.5"
          >
            {createMutation.isPending || isCloning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : tab === 'blank' ? (
              <FolderPlus className="h-3.5 w-3.5" />
            ) : (
              <FolderDown className="h-3.5 w-3.5" />
            )}
            {createMutation.isPending
              ? t('Creating...')
              : isCloning
                ? t('Cloning repository from GitHub...')
                : tab === 'blank'
                  ? t('Create Project & Start')
                  : t('Clone & Start Project')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
