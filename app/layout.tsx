import type { Metadata, Viewport } from 'next'
import './globals.css'
import SessionRefresher from './SessionRefresher'

export const metadata: Metadata = {
  title: 'CampusRun — Campus Food Delivery',
  description: 'Order food from campus restaurants, delivered by fellow students.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#FF6B2B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Explicit viewport meta — belt-and-suspenders for mobile browsers that
            don't re-apply viewport metadata cleanly after OAuth redirects. Without
            this, the first sign-in lands at desktop width until the page is refreshed. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
        <meta name="HandheldFriendly" content="true" />
        <meta name="MobileOptimized" content="width" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Rubik+Glitch&family=Syne:wght@700;800&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <SessionRefresher />
        {children}
      </body>
    </html>
  )
}
