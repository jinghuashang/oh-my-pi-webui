/** General settings: appearance, language, agent configuration, runtime knobs, session. */
import { Globe, LogOut, Moon, Palette, Settings2, Sun, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AgentModelSettings } from './agent-model-settings';
import { SettingEditor } from './setting-editor';
import { SettingsSection, SettingsSectionLoading } from './settings-section';
import { useCategorySettings } from './use-category-settings';

interface Props {
  dark: boolean;
  toggleDark: () => void;
  language: string;
  changeLanguage: (lang: string) => void;
  onLogout: () => void;
}

export function GeneralSettings({
  dark,
  toggleDark,
  language,
  changeLanguage,
  onLogout,
}: Props) {
  const { t } = useTranslation();
  const runtimeSettings = useCategorySettings('general');

  return (
    <div className="space-y-3">
      <SettingsSection icon={<Palette className="h-4 w-4" />} title={t('Appearance')}>
        <div className="divide-y divide-border/50">
          <div className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5">
              {dark ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
              <span className="text-[13px]">{t('Theme')}</span>
            </div>
            <Button variant="outline" size="sm" className="h-7" onClick={toggleDark}>
              {dark ? t('Light mode') : t('Dark mode')}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px]">{t('Language')}</span>
            </div>
            <div className="flex gap-1">
              <Button
                variant={language.startsWith('zh') ? 'default' : 'outline'}
                size="sm"
                className="h-7"
                onClick={() => changeLanguage('zh-CN')}
              >
                简体中文
              </Button>
              <Button
                variant={!language.startsWith('zh') ? 'default' : 'outline'}
                size="sm"
                className="h-7"
                onClick={() => changeLanguage('en')}
              >
                English
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <AgentModelSettings />

      <SettingsSection
        icon={<Settings2 className="h-4 w-4" />}
        title={t('Runtime Settings')}
        hint={t(
          'Idle thread subscriptions are cleaned up in the browser while active or approval-blocked threads stay subscribed.',
        )}
        aside={
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {runtimeSettings.settings.length}
          </span>
        }
      >
        {runtimeSettings.isLoading ? (
          <SettingsSectionLoading label={t('Loading...')} />
        ) : (
          <div className="divide-y divide-border/50">
            {runtimeSettings.settings.map((setting) => (
              <SettingEditor
                key={setting.key}
                setting={setting}
                draft={runtimeSettings.drafts[setting.key] ?? ''}
                disabled={runtimeSettings.isSaving}
                onDraftChange={runtimeSettings.handleDraftChange}
                onSave={runtimeSettings.handleSave}
                onReset={runtimeSettings.handleReset}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection icon={<UserRound className="h-4 w-4" />} title={t('Account')}>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <LogOut className="h-4 w-4 text-destructive" />
            <span className="text-[13px]">{t('Sign out of this session')}</span>
          </div>
          <Button variant="destructive" size="sm" className="h-7" onClick={onLogout}>
            {t('Logout')}
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
