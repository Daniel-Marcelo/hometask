import type { Priority } from '../data/types'

const labels: Record<Priority, string> = {
  urgent: 'Urgent',
  medium: 'Medium',
  low: 'Low',
  very_low: 'Very low',
}

/**
 * Priority chip. Terracotta fill for urgent only; every other priority
 * renders as a neutral muted outline chip.
 */
export function PriorityChip({ priority }: { priority: Priority }) {
  const className =
    priority === 'urgent' ? 'ht-chip ht-chip--urgent' : 'ht-chip'
  return <span className={className}>{labels[priority]}</span>
}
