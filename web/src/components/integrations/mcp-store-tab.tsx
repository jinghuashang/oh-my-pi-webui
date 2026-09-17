import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  Flame,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  mcpServersDeleteServerMutation,
  mcpServersGetStoreOptions,
  mcpServersGetStoreQueryKey,
  mcpServersInstallServerMutation,
  mcpServersListServersQueryKey,
  mcpServersToggleServerMutation,
} from '@/generated/api/@tanstack/react-query.gen';
import { showSnackbar } from '@/stores/snackbar-store';
import { getApiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import type { McpStoreItemDto } from '@/generated/api/types.gen';

const STORAGE_MIRROR_KEY = 'omp_github_mirror';

export function McpStoreTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // GitHub mirror state
  const [selectedMirror, setSelectedMirror] = useState<string>(() => {
    return localStorage.getItem(STORAGE_MIRROR_KEY) || 'https://ghfast.top/';
  });

  const handleMirrorChange = (mirror: string) => {
    setSelectedMirror(mirror);
    localStorage.setItem(STORAGE_MIRROR_KEY, mirror);
    showSnackbar(t('GitHub mirror updated to {{mirror}}', { mirror }), 'info');
  };

  // Search filter
  const [search, setSearch] = useState('');
  const [activeSource, setActiveSource] = useState<'official' | 'mcpservers-org'>('official');

  // Custom MCP modal
  const [customOpen, setCustomOpen] = useState(false);

  // Store query
  const storeQuery = useQuery(
    mcpServersGetStoreOptions({
      query: { source: activeSource },
    }),
  );
  const storeItems = storeQuery.data?.items ?? [];
  const defaultMirrors = [
    { id: 'ghproxy', name: 'ghproxy.net (Fast Proxy)', url: 'https://ghproxy.net/' },
    { id: 'ghddlc', name: 'gh.ddlc.top (Node Proxy)', url: 'https://gh.ddlc.top/' },
    { id: 'ghfast', name: 'ghfast.top (Proxy)', url: 'https://ghfast.top/' },
    { id: 'gitmirror', name: 'hub.gitmirror.com (Mirror)', url: 'https://hub.gitmirror.com/' },
    { id: 'kkgithub', name: 'kkgithub.com (Overseas Node)', url: 'https://kkgithub.com/' },
  ];
  const rawMirrors = storeQuery.data?.mirrors;
  const mirrors: Array<{ id: string; name: string; url: string }> =
    Array.isArray(rawMirrors) && rawMirrors.length > 0
      ? rawMirrors.map((m, idx) => {
          if (typeof m === 'string') return { id: `m-${idx}`, name: m, url: m };
          const obj = m as Record<string, string>;
          return {
            id: obj.id || `m-${idx}`,
            name: obj.name || obj.url || 'Mirror',
            url: obj.url || '',
          };
        })
      : defaultMirrors;
  const invalidateQueries = () => {
    void queryClient.invalidateQueries({ queryKey: mcpServersGetStoreQueryKey() });
    void queryClient.invalidateQueries({ queryKey: mcpServersListServersQueryKey() });
  };

  // Install mutation
  const installMutation = useMutation({
    ...mcpServersInstallServerMutation(),
    onSuccess: (res) => {
      showSnackbar(t('MCP server "{{name}}" installed successfully', { name: res.name }), 'success');
      invalidateQueries();
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  // Toggle mutation
  const toggleMutation = useMutation({
    ...mcpServersToggleServerMutation(),
    onSuccess: (res) => {
      showSnackbar(
        res.enabled
          ? t('MCP server "{{name}}" enabled', { name: res.name })
          : t('MCP server "{{name}}" disabled', { name: res.name }),
        'info',
      );
      invalidateQueries();
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    ...mcpServersDeleteServerMutation(),
    onSuccess: (res) => {
      showSnackbar(t('MCP server "{{name}}" removed', { name: res.name }), 'success');
      invalidateQueries();
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  const filteredItems = storeItems.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Mirror Acceleration Bar */}
      <div className="rounded-xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {t('MCP Extension Store')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('One-click install verified Model Context Protocol servers for OMP agent.')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomOpen(true)}
              className="gap-1.5 text-xs h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('Custom MCP')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => storeQuery.refetch()}
              disabled={storeQuery.isFetching}
              className="h-8 w-8 p-0"
              title={t('Refresh store')}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', storeQuery.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* GitHub Mirror Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-medium text-foreground">{t('GitHub Mirror Acceleration')}:</span>
            <span className="text-[11px] text-muted-foreground hidden md:inline">
              {t('Accelerate git/github package downloads for MCPs like Serena')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {mirrors.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleMirrorChange(m.url)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] transition-colors border',
                  selectedMirror === m.url
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(m.name)}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search MCP servers by name, description, or category...')}
            className="pl-8 text-xs h-9"
          />
        </div>

        {/* Store Source Selector */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/40 p-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSource('official')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeSource === 'official'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>{t('OMP WebUI Official Store')}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">5</Badge>
            </button>
            <button
              type="button"
              onClick={() => setActiveSource('mcpservers-org')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeSource === 'mcpservers-org'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Globe className="h-3.5 w-3.5 text-blue-500" />
              <span>{t('MCPServers.org Community')}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">10+</Badge>
            </button>
          </div>

          {activeSource === 'mcpservers-org' && (
            <a
              href="https://mcpservers.org/zh-CN/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline px-2 py-0.5"
            >
              <span>{t('Explore mcpservers.org')}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Grid of MCP Cards */}
      {storeQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-12 w-full" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          <Server className="mx-auto h-8 w-8 opacity-40 mb-2" />
          <p className="text-sm font-medium">{t('No MCP servers found')}</p>
          <p className="text-xs">{t('Try adjusting your search keyword or add a custom MCP server.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredItems.map((item) => (
            <McpStoreCard
              key={item.name}
              item={item}
              mirrorUrl={selectedMirror}
              isInstalling={installMutation.isPending && installMutation.variables?.body?.name === item.name}
              isToggling={toggleMutation.isPending && toggleMutation.variables?.body?.name === item.name}
              isDeleting={deleteMutation.isPending && deleteMutation.variables?.path?.name === item.name}
              onInstall={(config) =>
                installMutation.mutate({
                  body: {
                    name: item.name,
                    config,
                    mirrorUrl: selectedMirror,
                  },
                })
              }
              onToggle={(enabled) =>
                toggleMutation.mutate({
                  body: {
                    name: item.name,
                    enabled,
                  },
                })
              }
              onDelete={() =>
                deleteMutation.mutate({
                  path: { name: item.name },
                })
              }
            />
          ))}
        </div>
      )}

      {/* Custom MCP Dialog */}
      <CustomMcpDialog
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        mirrorUrl={selectedMirror}
        onSaved={invalidateQueries}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Store Card
// ---------------------------------------------------------------------------

function McpStoreCard({
  item,
  mirrorUrl,
  isInstalling,
  isToggling,
  isDeleting,
  onInstall,
  onToggle,
  onDelete,
}: {
  item: McpStoreItemDto;
  mirrorUrl: string;
  isInstalling: boolean;
  isToggling: boolean;
  isDeleting: boolean;
  onInstall: (config: Record<string, unknown>) => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [showConfig, setShowConfig] = useState(false);

  // Icon selector
  const getIcon = () => {
    switch (item.name) {
      case 'exa':
        return <Globe className="h-5 w-5 text-blue-500" />;
      case 'context7':
        return <Zap className="h-5 w-5 text-amber-500" />;
      case 'playwright':
        return <Bot className="h-5 w-5 text-emerald-500" />;
      case 'deepwiki':
        return <Sparkles className="h-5 w-5 text-purple-500" />;
      case 'serena':
        return <ShieldCheck className="h-5 w-5 text-rose-500" />;
      default:
        return <Server className="h-5 w-5 text-primary" />;
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col justify-between rounded-xl border bg-card p-4 transition-all shadow-sm hover:shadow',
        item.installed ? 'border-primary/30 bg-primary/[0.02]' : 'hover:border-border/80',
      )}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/70 border">
              {getIcon()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">{t(item.title)}</h3>
                <span className="font-mono text-[10px] text-muted-foreground">({item.name})</span>
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {t(item.category)}
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 uppercase">
                  {item.type}
                </Badge>
                {item.hasGithubSource && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400">
                    {t('GitHub Acceleration Available')}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          {item.installed ? (
            <Badge
              className={cn(
                'text-[11px] px-2 py-0.5 gap-1',
                item.enabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-muted text-muted-foreground border-border',
              )}
              variant="outline"
            >
              <CheckCircle2 className="h-3 w-3" />
              {item.enabled ? t('Active') : t('Disabled')}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {t('Not installed')}
            </Badge>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {t(item.description)}
        </p>

        {/* Collapsible Config Preview */}
        <div>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            {showConfig ? t('Hide Config ▲') : t('View Config ▼')}
          </button>
          {showConfig && (
            <pre className="mt-1.5 max-h-32 overflow-auto rounded-lg bg-muted/60 p-2 font-mono text-[10px] text-muted-foreground border">
              {JSON.stringify(item.config, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t mt-3">
        {item.installed ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={item.enabled}
                onCheckedChange={onToggle}
                disabled={isToggling}
                className="scale-90"
              />
              <span className="text-xs text-muted-foreground">
                {item.enabled ? t('Enabled') : t('Disabled')}
              </span>
            </div>
            {isToggling && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            {item.hasGithubSource && mirrorUrl !== 'direct' ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                {t('Mirror enabled')}
              </span>
            ) : null}
          </div>
        )}

        <div className="flex items-center gap-2">
          {item.installed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 px-2.5"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {t('Uninstall')}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onInstall(item.config)}
              disabled={isInstalling}
              className="h-8 text-xs gap-1.5 px-3"
            >
              {isInstalling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {t('Install MCP')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom MCP Dialog
// ---------------------------------------------------------------------------

function CustomMcpDialog({
  open,
  onClose,
  mirrorUrl,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mirrorUrl: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<'stdio' | 'http'>('stdio');
  const [commandOrUrl, setCommandOrUrl] = useState('');
  const [args, setArgs] = useState('');
  const [envJson, setEnvJson] = useState('');
  const [applyMirror, setApplyMirror] = useState(true);

  const installMutation = useMutation({
    ...mcpServersInstallServerMutation(),
    onSuccess: (res) => {
      showSnackbar(t('Custom MCP "{{name}}" added successfully', { name: res.name }), 'success');
      onSaved();
      onClose();
    },
    onError: (err) => {
      showSnackbar(getApiErrorMessage(err), 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    let config: Record<string, unknown>;
    if (type === 'http') {
      config = {
        type: 'http',
        url: commandOrUrl.trim(),
      };
    } else {
      let parsedArgs: string[] = [];
      if (args.trim()) {
        try {
          if (args.trim().startsWith('[')) {
            parsedArgs = JSON.parse(args.trim()) as string[];
          } else {
            parsedArgs = args.trim().split(/\s+/);
          }
        } catch {
          parsedArgs = args.trim().split(/\s+/);
        }
      }

      let parsedEnv: Record<string, string> | undefined;
      if (envJson.trim()) {
        try {
          parsedEnv = JSON.parse(envJson.trim()) as Record<string, string>;
        } catch {
          showSnackbar(t('Environment variables must be valid JSON object'), 'error');
          return;
        }
      }

      config = {
        type: 'stdio',
        command: commandOrUrl.trim(),
        args: parsedArgs,
        env: parsedEnv,
      };
    }

    installMutation.mutate({
      body: {
        name: trimmedName,
        config,
        mirrorUrl: applyMirror ? mirrorUrl : undefined,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('Add Custom MCP Server')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t('Configure and register a custom Model Context Protocol server in mcp.json')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            {/* Server Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                {t('Server Name / Identifier')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. my-custom-mcp"
                className="text-xs font-mono"
                required
              />
            </div>

            {/* Protocol Type */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">{t('Transport Type')}</label>
              <div className="grid grid-cols-2 rounded-lg bg-muted/60 p-1 border">
                <button
                  type="button"
                  onClick={() => setType('stdio')}
                  className={cn(
                    'py-1 text-xs font-medium rounded-md transition-colors',
                    type === 'stdio' ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {t('stdio (CLI / Command)')}
                </button>
                <button
                  type="button"
                  onClick={() => setType('http')}
                  className={cn(
                    'py-1 text-xs font-medium rounded-md transition-colors',
                    type === 'http' ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {t('http / sse (Remote URL)')}
                </button>
              </div>
            </div>

            {/* Command or URL */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                {type === 'stdio' ? t('Command') : t('Server Endpoint URL')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={commandOrUrl}
                onChange={(e) => setCommandOrUrl(e.target.value)}
                placeholder={type === 'stdio' ? 'e.g. npx or uvx or python' : 'e.g. https://mcp.example.com/mcp'}
                className="text-xs font-mono"
                required
              />
            </div>

            {type === 'stdio' && (
              <>
                {/* Arguments */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    {t('Command Arguments (space-delimited or JSON array)')}
                  </label>
                  <Input
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    placeholder='-y @modelcontextprotocol/server-filesystem /path'
                    className="text-xs font-mono"
                  />
                </div>

                {/* Env Vars */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    {t('Environment Variables (JSON object, Optional)')}
                  </label>
                  <Textarea
                    value={envJson}
                    onChange={(e) => setEnvJson(e.target.value)}
                    placeholder='{ "API_KEY": "xxx" }'
                    rows={2}
                    className="text-xs font-mono"
                  />
                </div>
              </>
            )}

            {/* Apply GitHub Mirror Toggle */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <div className="space-y-0.5">
                <span className="text-xs font-medium block">{t('Apply GitHub Mirror Acceleration')}</span>
                <span className="text-[10px] text-muted-foreground">
                  {mirrorUrl !== 'direct' ? mirrorUrl : t('Direct connection')}
                </span>
              </div>
              <Switch checked={applyMirror} onCheckedChange={setApplyMirror} />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || !commandOrUrl.trim() || installMutation.isPending}>
              {installMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {t('Add MCP Server')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
