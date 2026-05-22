'use client'

// app/SessionRefresher.tsx
// Keeps Supabase session alive when PWA is reopened from home screen or backgrounded.
// Supabase stores the session in localStorage, but on mobile PWAs the session can
// appear expired when the app resumes. This component refreshes it proactively.

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SessionRefresher() {
  useEffect(() => {
    const supabase = createClient()

    // Refresh session immediately on mount (catches PWA reopen)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Session exists — refresh the token to extend it
        supabase.auth.refreshSession()
      }
    })

    // Refresh when app comes back to foreground (tab/PWA resume)
    function handleVisibilityChange() {
      if (!document.hidden) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) supabase.auth.refreshSession()
        })
      }
    }

    // Refresh every 10 minutes while app is open
    const interval = setInterval(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) supabase.auth.refreshSession()
      })
    }, 10 * 60 * 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(interval)
    }
  }, [])

  return null
}
