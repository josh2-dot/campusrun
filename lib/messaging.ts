// lib/messaging.ts
// Utilities for in-app chat — phone filtering, rate limiting, types.

export type MessageRow = {
  id:          string
  order_id:    string
  sender_id:   string | null
  sender_role: 'customer' | 'runner' | 'system'
  text:        string
  created_at:  string
  read_at:     string | null
  reported:    boolean
}

/**
 * Filters out Nigerian phone numbers, emails, and obvious WhatsApp invitations
 * from message text. This is the main defense against off-platform backdoors.
 *
 * Patterns caught:
 *   - 11-digit Nigerian numbers starting with 070/080/081/090/091/...
 *   - +234 international format
 *   - Email addresses (basic)
 *   - "whatsapp", "wa.me", "telegram", "t.me"
 */
export function filterContactInfo(text: string): { clean: string; blocked: boolean } {
  let blocked = false
  let clean = text

  // Nigerian mobile numbers — with or without spaces/dashes
  const nigerianPhone = /(?:\+234|234|0)\s*[789]\s*[01]\s*\d(?:\s*\d){7}/g
  if (nigerianPhone.test(clean)) {
    blocked = true
    clean = clean.replace(nigerianPhone, '[contact info blocked]')
  }

  // Generic email
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  if (emailRegex.test(clean)) {
    blocked = true
    clean = clean.replace(emailRegex, '[contact info blocked]')
  }

  // WhatsApp / Telegram / Snap mentions
  const offPlatform = /\b(whats?app|wa\.me|telegram|t\.me|snapchat|snap\b)\b/gi
  if (offPlatform.test(clean)) {
    blocked = true
    clean = clean.replace(offPlatform, '[off-platform reference removed]')
  }

  return { clean, blocked }
}

/**
 * Simple in-memory rate limiter per user-id.
 * 10 messages per minute. Resets sliding window.
 * For multi-instance Vercel deployments this is per-instance, which is fine
 * — at our scale, the user is sticky to one instance for the duration of a session.
 */
const rateBuckets = new Map<string, number[]>()
const RATE_LIMIT_MS  = 60_000
const RATE_LIMIT_MAX = 10

export function checkRateLimit(userId: string): { ok: boolean; remaining: number } {
  const now = Date.now()
  const arr = (rateBuckets.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_MS)
  if (arr.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(userId, arr)
    return { ok: false, remaining: 0 }
  }
  arr.push(now)
  rateBuckets.set(userId, arr)
  return { ok: true, remaining: RATE_LIMIT_MAX - arr.length }
}

// Active order statuses where chat is allowed
export const CHAT_OPEN_STATUSES = ['runner_assigned', 'picked_up', 'needs_attention'] as const
