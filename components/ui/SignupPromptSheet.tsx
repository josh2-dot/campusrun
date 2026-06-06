// components/ui/SignupPromptSheet.tsx
'use client'

import { useRouter } from 'next/navigation'
import { ShoppingBag, X } from 'lucide-react'
import { GoogleSignInButton } from './GoogleSignInButton'

interface SignupPromptSheetProps {
  /** Where to return after signup (e.g. '/checkout') */
  intent?:     string
  /** Optional context — e.g. restaurant name or cart summary */
  contextText?: string
  onClose:     () => void
}

export function SignupPromptSheet({ intent = '/checkout', contextText, onClose }: SignupPromptSheetProps) {
  const router = useRouter()

  function goSignup() {
    // Preserve where they were heading — login/signup will read ?next= and route back after auth
    const url = `/signup?next=${encodeURIComponent(intent)}`
    router.push(url)
  }

  function goLogin() {
    const url = `/login?next=${encodeURIComponent(intent)}`
    router.push(url)
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        maxWidth: 430, margin: '0 auto',
        animation: 'crFadeIn 0.2s ease',
        fontFamily: "'Nunito', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes crFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes crSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>

      <div
        style={{
          width: '100%',
          background: 'var(--bg-1, #1A1917)',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: '14px 24px 30px',
          border: '1px solid var(--line, #2A2825)',
          borderBottom: 'none',
          animation: 'crSlideUp 0.25s ease',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'transparent', border: 'none',
            color: 'var(--ink-3, #6B6660)', cursor: 'pointer', padding: 6,
          }}
        >
          <X size={18} />
        </button>

        <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 22px' }} />

        {/* Hero icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 18,
              background: 'rgba(255,107,43,0.12)',
              color: '#FF6B2B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ShoppingBag size={26} />
          </div>
        </div>

        <h2 className="font-display" style={{ fontSize: 24, color: 'white', margin: '0 0 6px', textAlign: 'center', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
          Almost there
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 22px', textAlign: 'center', lineHeight: 1.5 }}>
          {contextText ?? 'Sign up to send your order. Takes 30 seconds, no card needed.'}
        </p>

        {/* Google — primary path */}
        <GoogleSignInButton mode="signup" />

        {/* Email signup */}
        <button
          onClick={goSignup}
          className="press"
          style={{
            width: '100%',
            background: 'var(--accent, #FF6B2B)',
            color: 'white',
            border: 'none',
            borderRadius: 14,
            padding: '13px 16px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: 14,
            marginTop: 12,
          }}
        >
          Create account with email
        </button>

        {/* Login link */}
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '14px 0 0' }}>
          Already have an account?{' '}
          <button
            onClick={goLogin}
            style={{
              background: 'transparent', border: 'none',
              color: '#FF6B2B', fontWeight: 800, fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit',
              padding: 0, textDecoration: 'underline',
            }}
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  )
}
