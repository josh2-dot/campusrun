// lib/pre-order.ts
// Helpers for computing pre-order windows in Nigeria local time (UTC+1, no DST).

export type PreOrderConfig = {
  pre_order_enabled?:        boolean
  peak_open_time?:           string | null      // 'HH:MM:SS' in WAT
  pre_order_window_minutes?: number
  post_peak_delay_minutes?:  number
}

export type WindowState =
  | { phase: 'inactive' }                                                   // pre-order disabled
  | { phase: 'before' }                                                     // too early today
  | { phase: 'pre_order_open';  peakAt: Date; opensAt: Date; closesAt: Date }
  | { phase: 'post_peak';       peakAt: Date; postPeakUntil: Date }         // longer wait warning
  | { phase: 'closed_today' }                                               // peak + delay passed

/**
 * Compute today's pre-order window for a restaurant.
 * - opensAt:  peak_time - window_minutes  (e.g. 17:00 if peak is 19:00)
 * - peakAt:   today @ peak_open_time
 * - closesAt: peakAt (orders after this go to post-peak / regular flow)
 *
 * Nigeria has no DST so we can simply parse 'HH:MM:SS' against today's date
 * using UTC math + a +1h shift.
 */
export function computeWindow(now: Date, cfg: PreOrderConfig): WindowState {
  if (!cfg.pre_order_enabled || !cfg.peak_open_time) return { phase: 'inactive' }

  const [hh, mm, ss = '0'] = cfg.peak_open_time.split(':')
  const peakHour   = parseInt(hh, 10)
  const peakMinute = parseInt(mm, 10)
  const peakSec    = parseInt(ss, 10)

  // Build "today's peak time" in WAT (UTC+1).
  // We construct it as UTC and then subtract 1 hour to get the WAT moment.
  const yyyy = now.getUTCFullYear()
  const m    = now.getUTCMonth()
  const d    = now.getUTCDate()
  // peak instant in WAT = UTC hh-1
  const peakAt = new Date(Date.UTC(yyyy, m, d, peakHour - 1, peakMinute, peakSec))

  // If "today's peak" is already > 23h ago, treat it as tomorrow's peak for the customer
  // (admin still sees today's closed pool). We don't auto-roll here — we leave it.

  const windowMs   = (cfg.pre_order_window_minutes ?? 120) * 60_000
  const postPeakMs = (cfg.post_peak_delay_minutes  ?? 30) * 60_000
  const opensAt    = new Date(peakAt.getTime() - windowMs)
  const closesAt   = peakAt
  const postEnd    = new Date(peakAt.getTime() + postPeakMs)

  if (now < opensAt) return { phase: 'before' }
  if (now < closesAt) return { phase: 'pre_order_open', peakAt, opensAt, closesAt }
  if (now < postEnd)  return { phase: 'post_peak', peakAt, postPeakUntil: postEnd }
  return { phase: 'closed_today' }
}

/** Format a Date as "7:00 PM" (Nigeria locale). */
export function fmtPeakTime(d: Date): string {
  return d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true })
}
