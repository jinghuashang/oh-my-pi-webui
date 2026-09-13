/** Terminal category runtime settings. */
import { TerminalIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingEditor } from './setting-editor';
import { SettingsSection, SettingsSectionLoading } from './settings-section';
import { useCategorySettings } from './use-category-settings';
import { useTerminalStore } from '@/stores/terminal-store';

export function TerminalSettings() {
  const { t } = useTranslation();
  const refreshTerminalConfig = useTerminalStore((s) => s.refreshConfig);
  const ctx = useCategorySettings('terminal');

  const handleSave = (setting: Parameters<typeof ctx.handleSave>[0]) => {
    ctx.handleSave(setting);
    void refreshTerminalConfig();
  };

  const handleReset = (key: string) => {
    ctx.handleReset(key);
    void refreshTerminalConfig();
  };

  return (
    <SettingsSection
      icon={<TerminalIcon className="h-4 w-4" />}
      title={t('Terminal')}
      hint={t('Runtime changes apply only to new terminals and future detach timers.')}
      aside={
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {ctx.settings.length}
        </span>
      }
    >
      {ctx.isLoading ? (
        <SettingsSectionLoading label={t('Loading...')} />
      ) : (
        <div className="divide-y divide-border/50">
          {ctx.settings.map((setting) => (
            <SettingEditor
              key={setting.key}
              setting={setting}
              draft={ctx.drafts[setting.key] ?? ''}
              disabled={ctx.isSaving}
              onDraftChange={ctx.handleDraftChange}
              onSave={handleSave}
              onReset={handleReset}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
