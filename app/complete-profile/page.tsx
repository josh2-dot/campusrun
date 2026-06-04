'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { validatePhone } from '@/lib/auth-errors'

export default function CompleteProfilePage() {
  const router   = useRouter()
  const supabase = createClient()
  const submitting = useRef(false)

  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [firstName, setFirstName] = useState('')
  const [phone,     setPhone]     = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error,     setError]     = useState('')

  // Load existing profile — pre-fill any data Google provided
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('users')
        .select('full_name, phone, role, onboarding_done')
        .eq('id', user.id)
        .single()

      // If they're already complete, route them onward instead of forcing them through
      if (profile && profile.phone && profile.full_name && profile.onboarding_done) {
        router.replace(profile.role === 'runner' ? '/dashboard' : '/home')
        return
      }
      if (profile && profile.phone && profile.full_name) {
        // Has the basics — just needs the onboarding tutorial
        router.replace(profile.role === 'runner' ? '/dashboard' : '/onboarding')
        return
      }

      // Pre-fill name from Google's data if present, otherwise empty
      if (profile?.full_name) setFirstName(profile.full_name)
      if (profile?.phone)     setPhone(profile.phone)

      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return

    const errs: Record<string, string> = {}
    if (!firstName.trim() || firstName.trim().length < 2) errs.name = 'Please enter your name'
    const phoneErr = validatePhone(phone.trim())
    if (phoneErr) errs.phone = phoneErr

    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    submitting.current = true
    setSaving(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { error: updateErr } = await supabase
      .from('users')
      .update({
        full_name: firstName.trim(),
        phone:     phone.trim(),
      })
      .eq('id', user.id)

    if (updateErr) {
      setError('Could not save your details. Please try again.')
      submitting.current = false
      setSaving(false)
      return
    }

    // Route to onboarding tutorial (customer) or dashboard (runner)
    const { data: profile } = await supabase
      .from('users').select('role').eq('id', user.id).single()

    router.replace(profile?.role === 'runner' ? '/dashboard' : '/onboarding')
  }

  if (loading) {
    return (
      <div className="mobile-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)' }}>
        <p style={{ color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>Loading…</p>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-1, #1A1917)',
    border: '1px solid var(--line, #2A2825)',
    borderRadius: 12,
    padding: '12px 14px',
    color: 'white',
    fontSize: 14,
    fontWeight: 600,
    outline: 'none',
    fontFamily: "'Nunito', sans-serif",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--ink-2, #A09A8E)',
    marginBottom: 6,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  }

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontFamily: "'Nunito', system-ui, sans-serif" }}>

      <div style={{ padding: '60px 20px 20px' }}>
        <span className="font-display" style={{ fontSize: 18, color: 'white', letterSpacing: '-0.01em' }}>CampusRun</span>
      </div>

      <div style={{ flex: 1, padding: '20px 20px 30px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p className="label-cap" style={{ color: 'var(--accent, #FF6B2B)', margin: '0 0 8px', fontSize: 10 }}>One last step</p>
        <h1 className="font-display" style={{ fontSize: 36, color: 'white', lineHeight: 1.0, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Tell us how<br />to reach you.
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 28px', lineHeight: 1.5 }}>
          Your phone number lets your runner contact you about delivery. We never share it.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Your name</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="e.g. Adaeze Okeke"
              autoComplete="name"
              style={inputStyle}
            />
            {fieldErrors.name && (
              <p style={{ color: 'var(--danger, #FF3B30)', fontSize: 12, fontWeight: 700, margin: '6px 0 0' }}>{fieldErrors.name}</p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="08012345678"
              autoComplete="tel"
              inputMode="numeric"
              style={inputStyle}
            />
            {fieldErrors.phone && (
              <p style={{ color: 'var(--danger, #FF3B30)', fontSize: 12, fontWeight: 700, margin: '6px 0 0' }}>{fieldErrors.phone}</p>
            )}
          </div>

          {error && (
            <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', color: 'var(--danger, #FF3B30)', padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="press"
            style={{
              width: '100%',
              background: 'var(--accent, #FF6B2B)',
              color: 'white',
              border: 'none',
              borderRadius: 14,
              padding: '14px 16px',
              cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 900,
              fontSize: 15,
              opacity: saving ? 0.7 : 1,
              marginTop: 8,
            }}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
