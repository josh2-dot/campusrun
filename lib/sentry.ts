// lib/sentry.ts
// Thin wrappers around Sentry.captureException so the rest of the codebase
// doesn't need to import @sentry/nextjs directly. Safe to call even if Sentry
// is disabled — these become no-ops.

import * as Sentry from '@sentry/nextjs'

type Context = {
  tags?:    Record<string, string>
  extra?:   Record<string, unknown>
  userId?:  string
  level?:   'fatal' | 'error' | 'warning' | 'info'
}

export function captureError(error: unknown, context: Context = {}) {
  try {
    const err = error instanceof Error ? error : new Error(String(error))

    if (context.userId) {
      Sentry.setUser({ id: context.userId })
    }

    Sentry.captureException(err, {
      tags:  context.tags,
      extra: context.extra,
      level: context.level ?? 'error',
    })
  } catch {
    // Sentry shouldn't ever throw — but if it does, swallow it.
    // We never want monitoring to break the app.
  }
}

export function captureMessage(message: string, context: Context = {}) {
  try {
    Sentry.captureMessage(message, {
      tags:  context.tags,
      extra: context.extra,
      level: context.level ?? 'info',
    })
  } catch { /* no-op */ }
}

// Set the current user for breadcrumb context
export function setUser(userId: string | null) {
  try {
    if (userId) Sentry.setUser({ id: userId })
    else        Sentry.setUser(null)
  } catch { /* no-op */ }
}
