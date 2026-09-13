/** Security category runtime settings. */
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingEditor } from './setting-editor';
import { SettingsSection, SettingsSectionLoading } from './settings-section';
import { useCategorySettings } from './use-category-settings';

export function SecuritySettings() {
  const { t } = useTranslation();
  const ctx = useCategorySettings('security');

  return (
    <SettingsSection
      icon={<Shield className="h-4 w-4" />}
      title={t('Security')}
      hint={t('Workspace root changes take effect immediately for new file operations.')}
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
              onSave={ctx.handleSave}
              onReset={ctx.handleReset}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
