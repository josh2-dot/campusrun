// sentry.client.config.ts
// Browser-side error tracking. Captures uncaught errors, unhandled rejections,
// and explicit Sentry.captureException calls in client components.

import * as Sentry from '@sentry/nextjs'

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,

    // Performance: track 10% of transactions to stay within free tier
    tracesSampleRate: 0.1,

    // Session replays — only on errors, never on healthy sessions
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // Don't send events from local dev
    enabled: process.env.NODE_ENV === 'production',

    // Filter out noise
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network blips that aren't actionable
      'Network request failed',
      'NetworkError when attempting to fetch resource',
      'Load failed',
      // User cancellations
      'AbortError',
      // Browser quirks
      'Non-Error promise rejection captured',
    ],

    beforeSend(event) {
      // Strip query strings that might contain sensitive data
      if (event.request?.url) {
        event.request.url = event.request.url.split('?')[0]
      }
      return event
    },
  })
}
