/**
 * Agent configuration: which model each omp role runs on, plus the rest of the
 * agent-level settings omp keeps in its own `[internal]` section.
 *
 * These decide what the product actually is — the default agent model, the fast
 * one for small jobs, the reasoning one, the planner, the subagent model — so
 * they live in General next to the other session-wide choices, while the Model
 * section keeps the raw sampling and transport parameters.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bot, Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { showSnackbar } from '@/stores/snackbar-store';
import { fetchOmpConfig, type OmpSettingItem, updateOmpSetting } from '@/api/omp-config-api';
import { useActiveModel } from '@/hooks/use-active-model';
import { getApiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { SettingRow } from './omp-category-settings';
import { SettingsSection } from './settings-section';

interface RoleDefinition {
  key: string;
  label: string;
  hint: string;
}

/** Roles omp assigns models to, in the order they matter to a user. */
const ROLES: RoleDefinition[] = [
  { key: 'default', label: '主模型', hint: '对话与实现的主力模型' },
  { key: 'smol', label: '快速模型', hint: '轻量任务与预热执行' },
  { key: 'slow', label: '深度推理模型', hint: '疑难问题的慢速推理' },
  { key: 'plan', label: '规划模型', hint: '架构规划与只读探索' },
  { key: 'task', label: '子代理模型', hint: '后台并行子智能体' },
  { key: 'vision', label: '视觉模型', hint: '图片理解与描述生成' },
  { key: 'designer', label: '设计模型', hint: 'UI 与视觉方案设计' },
  { key: 'commit', label: '提交信息模型', hint: '生成提交说明文本' },
  { key: 'tiny', label: '轻量任务模型', hint: '离线小任务与会话标题' },
  { key: 'advisor', label: '顾问模型', hint: '审查主模型的每轮输出' },
];

const ROLE_KEY = 'modelRoles';

export function AgentModelSettings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { models } = useActiveModel();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const configQuery = useQuery({
    queryKey: ['ompConfig'],
    queryFn: () => fetchOmpConfig(),
  });

  const agentItems: OmpSettingItem[] = useMemo(
    () =>
      configQuery.data?.categories.find((category) => category.id === 'agent')?.items ?? [],
    [configQuery.data],
  );

  const roles = useMemo(() => {
    const value = agentItems.find((item) => item.key === ROLE_KEY)?.value;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }, [agentItems]);

  const options = useMemo(() => {
    const names = models
      .map((model) => model.model)
      .filter((name) => typeof name === 'string' && name.length > 0);
    // A configured role may name a model the catalog no longer lists; showing
    // it keeps the current assignment visible instead of silently blanking it.
    for (const value of Object.values(roles)) {
      if (typeof value === 'string' && value && !names.includes(value)) names.push(value);
    }
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [models, roles]);

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      setSavingKey(key);
      await updateOmpSetting(key, value);
    },
    onSuccess: (_result, variables) => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['ompConfig'] });
    },
    onError: (error) => showSnackbar(getApiErrorMessage(error), 'error'),
    onSettled: () => setSavingKey(null),
  });

  // Roles omp knows but this list does not describe still deserve a row.
  const extraRoles = Object.keys(roles).filter(
    (role) => !ROLES.some((definition) => definition.key === role),
  );
  const orderedRoles: RoleDefinition[] = [
    ...ROLES.filter((definition) => definition.key in roles),
    ...extraRoles.map((role) => ({ key: role, label: role, hint: '' })),
  ];
  const otherItems = agentItems.filter((item) => item.key !== ROLE_KEY);

  return (
    <SettingsSection
      icon={<Bot className="h-4 w-4" />}
      title={t('Agent configuration')}
      hint={t('Each agent role runs on the model chosen here; the Model section keeps the sampling and transport parameters.')}
      aside={
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {orderedRoles.length} {t('roles')}
        </span>
      }
    >
      <div className="space-y-3.5">

        {configQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-[52px] animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : orderedRoles.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('No model roles configured.')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {orderedRoles.map((role) => (
              <RoleTile
                key={role.key}
                role={role}
                current={typeof roles[role.key] === 'string' ? (roles[role.key] as string) : ''}
                options={options}
                saving={savingKey === ROLE_KEY}
                onSelect={(model) =>
                  save.mutate({ key: ROLE_KEY, value: { ...roles, [role.key]: model } })
                }
              />
            ))}
          </div>
        )}

        {otherItems.length > 0 && (
          <div className="space-y-2 pt-1">
            <h3 className="text-[11px] font-medium text-muted-foreground">
              {t('Other agent settings')}
            </h3>
            <div className="divide-y divide-border/50 border-t border-border/50">
              {otherItems.map((item) => (
                <SettingRow
                  key={item.key}
                  item={item}
                  isZh={i18n.language.startsWith('zh')}
                  draftValue={drafts[item.key]}
                  isSaving={savingKey === item.key}
                  onDraftChange={(value) =>
                    setDrafts((prev) => ({ ...prev, [item.key]: value }))
                  }
                  onSave={(value) => save.mutate({ key: item.key, value })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

/** One role: its name on top, the model it runs on underneath. */
function RoleTile({
  role,
  current,
  options,
  saving,
  onSelect,
}: {
  role: RoleDefinition;
  current: string;
  options: string[];
  saving: boolean;
  onSelect: (model: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [options, search]);

  const shortName = current.split('/').pop() ?? current;

  return (
    <div className="rounded-lg border bg-background/60 px-2.5 py-2 transition-colors hover:border-border">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-medium leading-tight">{t(role.label)}</span>
        <span className="truncate text-[10px] text-muted-foreground/70">
          {t(role.hint)}
        </span>
        {saving && <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="mt-1.5 flex w-full items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-left transition-colors hover:bg-accent/50"
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-mono text-[11px]',
                !current && 'text-muted-foreground',
              )}
              title={current || undefined}
            >
              {shortName || t('Not set')}
            </span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <div className="relative border-b">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('Search models...')}
              className="h-9 rounded-none border-0 pl-8 text-xs focus-visible:ring-0"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t('No matching models.')}
              </p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (option !== current) onSelect(option);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] hover:bg-accent',
                    option === current && 'bg-accent/60',
                  )}
                >
                  <Check
                    className={cn(
                      'h-3 w-3 shrink-0',
                      option === current ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{option}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
