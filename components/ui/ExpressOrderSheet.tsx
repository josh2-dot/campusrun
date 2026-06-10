// components/ui/ExpressOrderSheet.tsx
'use client'

import { useState } from 'react'
import { ShoppingBag, X, ChevronDown } from 'lucide-react'

interface ExpressOrderSheetProps {
  /** Where to return after auth completes */
  intent?:     string
  /** Optional context for the headline */
  contextText?: string
  /** Callback after successful magic link redirect — usually a no-op since the redirect handles it */
  onSuccess?:  () => void
  onClose:     () => void
}

export function ExpressOrderSheet({ contextText, onClose }: ExpressOrderSheetProps) {
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [email,   setEmail]   = useState('')
  const [showEmail, setShowEmail] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit() {
    if (loading) return
    setError('')

    if (name.trim().length < 2) { setError('Please enter your name'); return }
    if (!phone.trim())          { setError('Phone number is required'); return }

    setLoading(true)

    try {
      const res = await fetch('/api/express-order/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:  name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setLoading(false)
        return
      }

      // Redirect to the magic link — this signs them in and routes to /checkout
      window.location.href = data.magic_link
    } catch {
      setError('Network issue. Try again.')
      setLoading(false)
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
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
          disabled={loading}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'transparent', border: 'none',
            color: 'var(--ink-3, #6B6660)', cursor: loading ? 'not-allowed' : 'pointer', padding: 6,
          }}
        >
          <X size={18} />
        </button>

        <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 22px' }} />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 18,
            background: 'rgba(255,107,43,0.12)',
            color: '#FF6B2B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShoppingBag size={26} />
          </div>
        </div>

        <h2 className="font-display" style={{ fontSize: 24, color: 'white', margin: '0 0 6px', textAlign: 'center', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
          Almost done
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 22px', textAlign: 'center', lineHeight: 1.5 }}>
          {contextText ?? "Tell us how to reach you. We'll save your details so next time is faster."}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Your name" value={name} onChange={setName} placeholder="Adaobi Okeke" autoComplete="name" />
          <Field label="Phone (your runner uses this)" value={phone} onChange={setPhone} placeholder="08012345678" autoComplete="tel" type="tel" inputMode="numeric" />

          {!showEmail && (
            <button
              onClick={() => setShowEmail(true)}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--accent, #FF6B2B)', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', padding: '4px 0', textAlign: 'left',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <ChevronDown size={14} /> Add email for receipts (optional)
            </button>
          )}
          {showEmail && (
            <Field label="Email (for receipts)" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" type="email" />
          )}

          {error && (
            <p style={{ color: 'var(--danger, #FF3B30)', fontSize: 12, fontWeight: 700, margin: 0 }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="press"
            style={{
              width: '100%',
              background: 'var(--accent, #FF6B2B)',
              color: 'white',
              border: 'none',
              borderRadius: 14,
              padding: '14px 16px',
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 900,
              fontSize: 15,
              opacity: loading ? 0.7 : 1,
              marginTop: 6,
            }}
          >
            {loading ? 'Just a moment…' : 'Continue to payment'}
          </button>

          <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '6px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
            By continuing you create a CampusRun account.<br />
            Already have one?{' '}
            <a href="/login" style={{ color: '#FF6B2B', fontWeight: 800, textDecoration: 'underline' }}>Log in</a>
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, autoComplete, type = 'text', inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  type?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url' | 'search' | 'decimal' | 'none'
}) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-2, #A09A8E)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        style={{
          width: '100%',
          background: 'var(--bg-0, #0C0B09)',
          border: '1px solid var(--line, #2A2825)',
          borderRadius: 12,
          padding: '12px 14px',
          color: 'white',
          fontSize: 14,
          fontWeight: 600,
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
