export interface CancelReason { key: string; label: string; emoji: string }

export const RUNNER_CANCEL_REASONS: CancelReason[] = [
  { key: 'food_not_available',    label: 'Food not available at restaurant', emoji: '🚫' },
  { key: 'restaurant_closed',     label: 'Restaurant is closed',             emoji: '🔒' },
  { key: 'order_taking_too_long', label: 'Order taking too long to prepare', emoji: '⏱️' },
  { key: 'unable_to_locate',      label: 'Unable to locate customer',        emoji: '📍' },
  { key: 'personal_emergency',    label: 'Personal emergency',               emoji: '🆘' },
]

export const CUSTOMER_CANCEL_REASONS: CancelReason[] = [
  { key: 'changed_mind',       label: 'I changed my mind',  emoji: '🤔' },
  { key: 'ordered_by_mistake', label: 'Ordered by mistake', emoji: '😅' },
  { key: 'taking_too_long',    label: 'Taking too long',    emoji: '⏳' },
]

export function getCancelLabel(key: string): string {
  return [...RUNNER_CANCEL_REASONS, ...CUSTOMER_CANCEL_REASONS].find(r => r.key === key)?.label ?? key
}