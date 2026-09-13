/**
 * Compact "how long ago" labels for list rows.
 *
 * Sidebar rows have one narrow column for the age of a conversation, so the
 * label is a single unit — `2分钟前` in Chinese, `2m` in English — rather than a
 * sentence that would push the title out.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Formats a timestamp as a compact age.
 *
 * @param timestamp - Epoch milliseconds, or null when the row has no timestamp.
 * @param language - Active i18n language, used to pick unit wording.
 * @returns Localized age label, or an empty string when there is nothing to show.
 */
export function formatRelativeAge(
  timestamp: number | null | undefined,
  language: string,
): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';

  const elapsed = Date.now() - timestamp;
  if (elapsed < MINUTE) return language.startsWith('zh') ? '刚刚' : 'now';

  const [count, unit] =
    elapsed < HOUR
      ? [Math.floor(elapsed / MINUTE), 'm']
      : elapsed < DAY
        ? [Math.floor(elapsed / HOUR), 'h']
        : [Math.floor(elapsed / DAY), 'd'];

  return language.startsWith('zh')
    ? `${count}${unit === 'm' ? '分钟' : unit === 'h' ? '小时' : '天'}前`
    : `${count}${unit}`;
}

/**
 * Full local timestamp for the same value, used as the row's tooltip.
 *
 * @param timestamp - Epoch milliseconds.
 * @param language - Active i18n language.
 * @returns Local date and time, or an empty string when the value is unusable.
 */
export function formatAbsoluteAge(
  timestamp: number | null | undefined,
  language: string,
): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString(language.startsWith('zh') ? 'zh-CN' : 'en-US');
}
