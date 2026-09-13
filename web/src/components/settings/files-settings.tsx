/** Files category runtime settings. */
import { FolderIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingEditor } from './setting-editor';
import { SettingsSection, SettingsSectionLoading } from './settings-section';
import { useCategorySettings } from './use-category-settings';

export function FilesSettings() {
  const { t } = useTranslation();
  const ctx = useCategorySettings('files');

  return (
    <SettingsSection
      icon={<FolderIcon className="h-4 w-4" />}
      title={t('Files')}
      hint={t('File upload limits take effect after server restart.')}
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
