/**
 * Settings shell: a category rail plus the OMP configuration panes.
 *
 * omp presents its settings as a dense list of `key = value` rows grouped by
 * section. The web shell keeps that shape — one rail of sections, one aligned
 * value column — instead of scattering every option across its own card.
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileCode, FolderIcon, Shield, Sliders, TerminalIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/stores/theme-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { clearApiToken } from '@/auth-token';
import { resetSocket } from '@/socket';
import { cn } from '@/lib/utils';
import { fetchOmpConfig } from '@/api/omp-config-api';
import { GeneralSettings } from './general-settings';
import { TerminalSettings } from './terminal-settings';
import { FilesSettings } from './files-settings';
import { SecuritySettings } from './security-settings';
import { OmpCategorySettings } from './omp-category-settings';
import { RawConfigEditor } from './raw-config-editor';

/** OMP configuration sections, in omp's own order. */
const OMP_TABS = [
  { id: 'appearance', name: 'Appearance', icon: '🎨' },
  { id: 'model', name: 'Model', icon: '🤖' },
  { id: 'interaction', name: 'Interaction', icon: '📑' },
  { id: 'context', name: 'Context', icon: '📋' },
  { id: 'memory', name: 'Memory', icon: '🧠' },
  { id: 'files', name: 'Files', icon: '📁' },
  { id: 'shell', name: 'Shell', icon: '🖥️' },
  { id: 'tools', name: 'Tools', icon: '🔧' },
  { id: 'tasks', name: 'Tasks', icon: '📦' },
  { id: 'providers', name: 'Providers', icon: '🌐' },
  { id: 'plugins', name: 'Plugins', icon: '🧩' },
] as const;

/** Shell-level panes that sit beside the OMP sections. */
const SYSTEM_TABS = [
  { id: 'general', name: 'General', icon: Sliders },
  { id: 'terminal', name: 'Terminal', icon: TerminalIcon },
  { id: 'files', name: 'Files', icon: FolderIcon },
  { id: 'security', name: 'Security', icon: Shield },
  { id: 'raw', name: 'config.yml', icon: FileCode },
] as const;

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dark = useThemeStore((s) => s.dark);
  const toggleDark = useThemeStore((s) => s.toggleDark);
  const threadId = useTimelineStore((s) => s.threadId);
  const [activeSection, setActiveSection] = useState<string>('appearance');
  const ompQuery = useQuery({
    queryKey: ['ompConfig'],
    queryFn: () => fetchOmpConfig(),
  });

  const categories = ompQuery.data?.categories ?? [];
  const activeOmpCat = categories.find((c) => c.id === activeSection);

  const navigateBack = () => {
    if (threadId) {
      void navigate({ to: '/t/$threadId', params: { threadId } });
    } else {
      void navigate({ to: '/' });
    }
  };

  const handleLogout = () => {
    clearApiToken();
    resetSocket();
    void navigate({ to: '/login', search: { redirect: '/' } });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={navigateBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold tracking-tight">{t('Settings')}</h1>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {ompQuery.data ? t('{{count}} configurable options', { count: ompQuery.data.totalSettings }) : null}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Category rail: sections, then the shell panes omp itself has no tab for. */}
        <nav className="hidden w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r px-2 py-3 md:flex">
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {t('Oh My Pi (omp)')}
            </p>
            {OMP_TABS.map((tab) => {
              const count = categories.find((c) => c.id === tab.id)?.items.length;
              return (
                <RailButton
                  key={tab.id}
                  active={activeSection === tab.id}
                  onClick={() => setActiveSection(tab.id)}
                  icon={<span className="w-4 text-center">{tab.icon}</span>}
                  label={t(tab.name)}
                  count={count}
                />
              );
            })}
          </div>
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {t('WebUI')}
            </p>
            {SYSTEM_TABS.map((tab) => (
              <RailButton
                key={tab.id}
                active={activeSection === tab.id}
                onClick={() => setActiveSection(tab.id)}
                icon={<tab.icon className="h-3.5 w-3.5" />}
                label={t(tab.name)}
              />
            ))}
          </div>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Narrow screens keep the same sections as chips. */}
          <div className="flex gap-1 overflow-x-auto border-b px-3 py-2 md:hidden">
            {[...OMP_TABS, ...SYSTEM_TABS].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={cn(
                  'shrink-0 rounded-md px-2.5 py-1 text-xs',
                  activeSection === tab.id
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {t(tab.name)}
              </button>
            ))}
          </div>

          <div className="space-y-3 px-4 py-4 sm:px-6">
            {activeSection === 'general' && (
              <GeneralSettings
                dark={dark}
                toggleDark={toggleDark}
                language={i18n.language}
                changeLanguage={(lang) => void i18n.changeLanguage(lang)}
                onLogout={handleLogout}
              />
            )}
            {activeSection === 'security' && <SecuritySettings />}
            {activeSection === 'terminal' && <TerminalSettings />}
            {activeSection === 'files' && <FilesSettings />}
            {activeSection === 'raw' && <RawConfigEditor onSaved={() => void ompQuery.refetch()} />}
            {activeOmpCat && (
              <OmpCategorySettings
                category={activeOmpCat}
                onRefresh={() => void ompQuery.refetch()}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RailButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">{count}</span>
      )}
    </button>
  );
}
