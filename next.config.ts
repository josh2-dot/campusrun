import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  /* config options here */
}

// Sentry config — only activates when env vars are set
const sentryWebpackPluginOptions = {
  // Suppresses source map upload logs during build
  silent: true,
  org:    process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Don't upload source maps in dev / preview deployments
  disableLogger: true,
}

// Only wrap with Sentry config if DSN is set — otherwise pass through
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig
