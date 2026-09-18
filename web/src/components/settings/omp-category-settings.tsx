/**
 * One OMP configuration section, laid out like the row list the engine prints.
 *
 * Every row is `name · key = value`: the option on the left, its control in one
 * right-aligned column, and the engine's own explanation underneath. Rows stay
 * flat with a hairline separator instead of becoming a card per option, so a
 * section of 58 settings stays scannable. All eleven OMP sections render
 * through this component, which is what keeps their rhythm identical.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, RotateCw, Save, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { showSnackbar } from '@/stores/snackbar-store';
import { cn } from '@/lib/utils';
import {
  type OmpCategory,
  type OmpSettingItem,
  updateOmpSetting,
} from '@/api/omp-config-api';
import { getOmpSettingI18n, humanizeKey } from '@/lib/omp-setting-translations';
import { SettingsSection } from './settings-section';

interface Props {
  category: OmpCategory;
  onRefresh: () => void;
}

export function OmpCategorySettings({ category, onRefresh }: Props) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const isZh = i18n.language.startsWith('zh');

  // Model-role assignments are agent configuration and live in General, so the
  // Model section lists parameters only.
  const sourceItems = useMemo(
    () => category.items.filter((item) => item.key !== 'modelRoles'),
    [category.items],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sourceItems;
    return sourceItems.filter((item) => {
      const translated = getOmpSettingI18n(item.key, item.description);
      const title = isZh ? translated.title : humanizeKey(item.key);
      const desc = isZh && translated.desc ? translated.desc : item.description;
      return (
        item.key.toLowerCase().includes(query) ||
        title.toLowerCase().includes(query) ||
        desc.toLowerCase().includes(query)
      );
    });
  }, [sourceItems, search]);

  const handleSave = async (key: string, valueToSave: unknown) => {
    setSavingKey(key);
    try {
      const res = await updateOmpSetting(key, valueToSave);
      showSnackbar(res.message || t('Setting saved successfully'), 'success');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      onRefresh();
    } catch (err) {
      showSnackbar(t('Failed to save setting: {{msg}}', { msg: String(err) }), 'error');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <SettingsSection
      icon={<span className="text-[15px] leading-none">{category.icon}</span>}
      title={t(category.name)}
      hint={t('Configure {{name}} runtime parameters for Oh My Pi (omp).', {
        name: t(category.name),
      })}
      aside={
        <>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {filteredItems.length}/{category.items.length}
          </span>
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search settings...')}
              className="h-6 w-40 pl-7 text-[11px]"
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onRefresh}
            title={t('Refresh')}
          >
            <RotateCw className="h-3 w-3" />
          </Button>
        </>
      }
    >
      {filteredItems.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t('No matching settings found.')}
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {filteredItems.map((item) => (
            <SettingRow
              key={item.key}
              item={item}
              isZh={isZh}
              draftValue={drafts[item.key]}
              isSaving={savingKey === item.key}
              onDraftChange={(val) => setDrafts((prev) => ({ ...prev, [item.key]: val }))}
              onSave={(val) => void handleSave(item.key, val)}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

export function SettingRow({
  item,
  isZh,
  draftValue,
  isSaving,
  onDraftChange,
  onSave,
}: {
  item: OmpSettingItem;
  isZh: boolean;
  draftValue?: string;
  isSaving: boolean;
  onDraftChange: (val: string) => void;
  onSave: (val: unknown) => void;
}) {
  const translated = getOmpSettingI18n(item.key, item.description);
  const title = isZh ? translated.title : humanizeKey(item.key);
  const description = isZh && translated.desc ? translated.desc : item.description;
  const current = item.value;

  return (
    <div className="flex flex-col gap-2.5 py-3 transition-colors hover:bg-accent/20 sm:flex-row sm:items-start sm:gap-6 sm:px-1">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium leading-tight">{title}</span>
          <code className="rounded bg-muted/60 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
            {item.key}
          </code>
          {item.type !== 'boolean' && (
            <Badge
              variant="outline"
              className="px-1.5 py-0 font-mono text-[9px] uppercase text-muted-foreground/70"
            >
              {item.type}
            </Badge>
          )}
          {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        {description ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-start gap-1.5 sm:w-[248px] sm:justify-end sm:pt-0.5">
        <SettingControl
          item={item}
          current={current}
          draftValue={draftValue}
          isSaving={isSaving}
          onDraftChange={onDraftChange}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

function SettingControl({
  item,
  current,
  draftValue,
  isSaving,
  onDraftChange,
  onSave,
}: {
  item: OmpSettingItem;
  current: unknown;
  draftValue?: string;
  isSaving: boolean;
  onDraftChange: (val: string) => void;
  onSave: (val: unknown) => void;
}) {
  const { t } = useTranslation();

  if (item.type === 'boolean') {
    return (
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {current ? 'true' : 'false'}
        </span>
        <Switch
          checked={Boolean(current)}
          disabled={isSaving}
          onCheckedChange={(checked) => onSave(checked)}
        />
      </div>
    );
  }

  if (item.type === 'enum' && item.options?.length) {
    return (
      <select
        value={String(current ?? '')}
        disabled={isSaving}
        onChange={(e) => onSave(e.target.value)}
        className="h-7 w-full max-w-[248px] rounded-md border border-input bg-background px-2 font-mono text-[11px] shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {item.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (item.type === 'array' || item.type === 'record') {
    const value =
      draftValue !== undefined
        ? draftValue
        : current === null || current === undefined
          ? ''
          : JSON.stringify(current, null, 1);
    const dirty = draftValue !== undefined;
    return (
      <div className="flex w-full items-start gap-1.5">
        <Textarea
          value={value}
          onChange={(e) => onDraftChange(e.target.value)}
          disabled={isSaving}
          rows={2}
          spellCheck={false}
          className="min-h-[3.25rem] w-full font-mono text-[11px] leading-snug"
        />
        <Button
          size="icon"
          variant={dirty ? 'default' : 'ghost'}
          className="h-7 w-7 shrink-0"
          disabled={isSaving || !dirty}
          title={t('Save')}
          onClick={() => {
            try {
              onSave(JSON.parse(draftValue ?? 'null'));
            } catch {
              showSnackbar(t('Invalid JSON format'), 'error');
            }
          }}
        >
          <Save className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const value = draftValue !== undefined ? draftValue : String(current ?? '');
  const dirty = draftValue !== undefined && draftValue !== String(current ?? '');
  return (
    <div className="flex w-full items-center gap-1.5">
      <Input
        type={item.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onDraftChange(e.target.value)}
        disabled={isSaving}
        spellCheck={false}
        className={cn('h-7 w-full font-mono text-[11px]', !item.value && 'text-muted-foreground')}
      />
      <Button
        size="icon"
        variant={dirty ? 'default' : 'ghost'}
        className="h-7 w-7 shrink-0"
        disabled={isSaving || !dirty}
        title={t('Save')}
        onClick={() => {
          if (item.type === 'number') {
            const parsed = Number(draftValue);
            if (Number.isNaN(parsed)) {
              showSnackbar(t('Invalid number'), 'error');
              return;
            }
            onSave(parsed);
            return;
          }
          onSave(draftValue ?? '');
        }}
      >
        {isSaving ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
