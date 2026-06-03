// sentry.server.config.ts
// Server-side error tracking for API routes and server components.

import * as Sentry from '@sentry/nextjs'

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === 'production',

    // Don't capture expected business errors as alerts
    ignoreErrors: [
      // Auth failures aren't bugs
      'AuthApiError',
      'Forbidden',
      'Unauthorized',
    ],
  })
}
