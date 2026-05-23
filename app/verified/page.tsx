'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VerifiedPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [name,   setName]   = useState('')
  const [role,   setRole]   = useState('customer')
  const [countdown, setCd]  = useState(4)

  useEffect(() => {
    // Get user details for personalised message
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, role, onboarding_done')
        .eq('id', user.id)
        .single()
      if (profile) {
        setName(profile.full_name?.split(' ')[0] ?? '')
        setRole(profile.role ?? 'customer')
      }
    })

    // Auto-redirect after 4 seconds
    const interval = setInterval(() => {
      setCd(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect when countdown hits 0
  useEffect(() => {
    if (countdown === 0) {
      if (role === 'runner') router.replace('/dashboard')
      else router.replace('/onboarding')
    }
  }, [countdown, role, router])

  function handleContinue() {
    if (role === 'runner') router.replace('/dashboard')
    else router.replace('/onboarding')
  }

  return (
    <div style={{
      maxWidth: 430, margin: '0 auto', minHeight: '100vh',
      background: '#0C0B09',
      fontFamily: "'Nunito', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 28px',
    }}>

      {/* Animated check */}
      <div className="fade-up-1" style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'rgba(29,185,84,0.12)',
        border: '2px solid rgba(29,185,84,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        boxShadow: '0 0 32px rgba(29,185,84,0.15)',
      }}>
        <span style={{ fontSize: 40 }}>✓</span>
      </div>

      {/* Heading */}
      <p className="label-cap fade-up-2" style={{ color: '#1DB954', fontSize: 10, margin: '0 0 10px', letterSpacing: '0.15em', textAlign: 'center' }}>
        EMAIL VERIFIED
      </p>
      <h1 className="font-display fade-up-2" style={{
        fontSize: 36, color: 'white', lineHeight: 1.05,
        margin: '0 0 12px', letterSpacing: '-0.02em', textAlign: 'center',
      }}>
        {name ? `You're in, ${name}.` : "You're in."}
      </h1>
      <p className="fade-up-3" style={{
        fontSize: 14, color: '#6B6660', fontWeight: 600,
        margin: '0 0 40px', textAlign: 'center', lineHeight: 1.6,
      }}>
        {role === 'runner'
          ? 'Your account is verified. Head to your dashboard to go online and start earning.'
          : 'Your account is verified. Let\'s show you how CampusRun works — takes 30 seconds.'}
      </p>

      {/* CTA */}
      <button onClick={handleContinue} className="press"
        style={{
          width: '100%', background: '#FF6B2B', color: 'white',
          fontWeight: 900, fontSize: 16, padding: '16px',
          borderRadius: 14, border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {role === 'runner' ? 'Go to dashboard' : 'Show me around'} <span style={{ fontSize: 18 }}>→</span>
      </button>

      {/* Countdown */}
      <p style={{ fontSize: 12, color: '#3A3830', fontWeight: 600 }}>
        {countdown > 0
          ? `Continuing automatically in ${countdown}s…`
          : 'Redirecting…'}
      </p>
    </div>
  )
}
