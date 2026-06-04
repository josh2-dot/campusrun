// components/ui/GoogleSignInButton.tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup'

export function GoogleSignInButton({ mode = 'signin' }: { mode?: Mode }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleClick() {
    if (loading) return
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/complete-profile`,
        queryParams: {
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    })

    if (error) {
      setError('Could not start Google sign-in. Please try again.')
      setLoading(false)
    }
    // On success: browser is redirected to Google by Supabase, this component unmounts
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Subtle divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 6px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--line-soft, #1F1D1B)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3, #6B6660)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--line-soft, #1F1D1B)' }} />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="press"
        style={{
          width: '100%',
          background: 'white',
          color: '#1A1917',
          border: '1px solid var(--line, #2A2825)',
          borderRadius: 14,
          padding: '13px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          fontWeight: 800,
          fontSize: 14,
          opacity: loading ? 0.7 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {/* Google G logo */}
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" />
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" />
        </svg>
        <span>{loading ? 'Connecting…' : mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}</span>
      </button>

      {error && (
        <p style={{ color: 'var(--danger, #FF3B30)', fontSize: 12, fontWeight: 700, margin: 0, textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  )
}
