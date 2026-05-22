import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(naira: number): string {
  return `₦${naira.toLocaleString('en-NG')}`
}

export function generateOrderRef(): string {
  const num = Math.floor(Math.random() * 9000) + 1000
  return `CR-${num}`
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending payment',
    confirmed: 'Order confirmed',
    awaiting_runner: 'Finding runner...',
    runner_assigned: 'Runner assigned',
    preparing: 'Preparing your food',
    picked_up: 'On the way!',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    needs_attention: 'Issue — contact support',
  }
  return labels[status] ?? status
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'text-yellow-600 bg-yellow-50',
    confirmed: 'text-blue-600 bg-blue-50',
    awaiting_runner: 'text-orange-600 bg-orange-50',
    runner_assigned: 'text-orange-600 bg-orange-50',
    preparing: 'text-orange-600 bg-orange-50',
    picked_up: 'text-green-600 bg-green-50',
    delivered: 'text-green-700 bg-green-100',
    cancelled: 'text-gray-500 bg-gray-100',
    needs_attention: 'text-red-600 bg-red-50',
  }
  return colors[status] ?? 'text-gray-600 bg-gray-100'
}

export const DELIVERY_FEE = 500
export const PLATFORM_CUT = 200
export const RUNNER_EARNINGS = 300

export function monogram(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function fmtDuration(ms: number): string {
  if (ms <= 0) return '0m'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
