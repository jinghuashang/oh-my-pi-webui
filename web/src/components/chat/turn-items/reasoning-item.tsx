/**
 * Renders one reasoning block the way the omp transcript does.
 *
 * omp prints thinking as dimmed body text under the message it belongs to —
 * no header, no chevron, no box — so the web transcript keeps the same shape
 * instead of inventing a disclosure control the engine never had.
 */
import type { TurnItem } from '@/types/timeline';

interface Props {
  item: Extract<TurnItem, { type: 'reasoning' }>;
}

export function ReasoningItem({ item }: Props) {
  if (!item.content) return null;

  return (
    <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground/70 italic">
      {item.content}
    </div>
  );
}
