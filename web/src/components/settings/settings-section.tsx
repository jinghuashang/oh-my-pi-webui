/**
 * One settings section: a titled card that every pane in the settings page is
 * built from.
 *
 * Sections used to alternate between bare headings over floating cards and
 * cards with internal headers, separated by rules — three rhythms in one
 * column. Everything now shares this shell, so the only vertical spacing is the
 * gap between two of them.
 */
import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  /** One line under the header explaining what the section governs. */
  hint?: string;
  /** Trailing element in the header row, e.g. a count or an action. */
  aside?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({ icon, title, hint, aside, children }: Props) {
  return (
    <section className="rounded-xl border bg-card/40">
      <header className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-[13px] font-medium">{title}</h2>
        {aside ? <span className="ml-auto flex items-center gap-1.5">{aside}</span> : null}
      </header>
      <div className="space-y-2 px-3.5 py-3">
        {hint ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/** Flat row inside a section body, spaced by the caller's dividers. */
export function SettingsRow({ children }: { children: ReactNode }) {
  return <div className="px-0.5 py-2.5">{children}</div>;
}

/** Placeholder shown while a section's values are still loading. */
export function SettingsSectionLoading({ label }: { label: string }) {
  return (
    <p className="py-3 text-center text-xs text-muted-foreground">{label}</p>
  );
}
