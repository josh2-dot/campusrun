'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BottomNav } from '@/components/ui/BottomNav'
import { useCartStore } from '@/store/cart'
import type { UserRole } from '@/types'

const WHATSAPP_NUMBER = '2348068404839'
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=Hi%2C%20I%20need%20help%20with%20my%20CampusRun%20order.`

interface ProfileUser {
  id: string
  full_name: string
  email: string
  phone: string
  role: UserRole
  matric_number?: string
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
const { lastAddress } = useCartStore()

  const [user, setUser] = useState<ProfileUser | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [runnerAppStatus, setRunnerAppStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }

      const { data: userData, error } = await supabase
        .from('users')
        .select('id, full_name, email, phone, role, matric_number')
        .eq('id', authUser.id)
        .single()

      if (error || !userData) {
        // Fallback: use auth data so page is never blank
        setUser({
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name ?? 'User',
          email: authUser.email ?? '',
          phone: authUser.user_metadata?.phone ?? '',
          role: 'customer',
        })
        setLoading(false)
        return
      }

      setUser(userData)

      // Load runner application status (non-blocking — failure is fine)
      const { data: appData } = await supabase
        .from('runner_applications')
        .select('status')
        .eq('user_id', authUser.id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .single()

      setRunnerAppStatus(appData?.status ?? null)
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function switchToCustomer() {
    if (!user || switching) return
    setSwitching(true)
    await supabase.from('users').update({ role: 'customer' }).eq('id', user.id)
    setUser({ ...user, role: 'customer' })
    setSwitching(false)
    router.push('/home')
  }

  async function handleRunnerSwitch() {
    if (!user) return
    if (user.role === 'runner') { switchToCustomer(); return }
    if (runnerAppStatus === 'approved') {
      setSwitching(true)
      await supabase.from('users').update({ role: 'runner' }).eq('id', user.id)
      setUser({ ...user, role: 'runner' })
      setSwitching(false)
      router.push('/dashboard')
      return
    }
    router.push('/apply-runner')
  }

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontSize: 40 }}>👤</div>
  )

  // Guaranteed non-null below (fallback ensures this)
  const u = user!
  const isCustomer = u.role === 'customer'
  const isRunner   = u.role === 'runner'
  const runnerBtnDisabled = runnerAppStatus === 'pending' || runnerAppStatus === 'rejected' || switching

  const initials = u.full_name
    .trim().split(/\s+/).filter(Boolean)
    .map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'U'

  return (
    <div
      className="mobile-container"
      style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}
    >
      {/* ── HERO ── */}
      <div className="dot-texture" style={{ padding: '52px 20px 24px', borderBottom: '1px solid var(--line, #2A2825)', textAlign: 'center' }}>
        {/* Avatar */}
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,107,43,0.12)', border: '2px solid rgba(255,107,43,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <span className="font-display" style={{ fontSize: 26, color: 'var(--accent, #FF6B2B)' }}>{initials}</span>
        </div>
        <h1 style={{ color: 'white', fontSize: 20, fontWeight: 900, margin: '0 0 3px' }}>{u.full_name}</h1>
        <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 13, fontWeight: 600, margin: 0 }}>{u.email}</p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-2, #26241F)', borderRadius: 20, padding: '5px 14px', marginTop: 10, border: '1px solid var(--line, #2A2825)' }}>
          <span style={{ fontSize: 12 }}>{isRunner ? '🛵' : '🍽️'}</span>
          <span style={{ color: 'var(--accent, #FF6B2B)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {u.role} mode
          </span>
        </div>
      </div>

      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── MODE SWITCHER ── */}
        <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)' }}>
          <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 3px', color: 'white' }}>Switch mode</p>
          <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 14px' }}>
            Order food as a customer or earn money as a runner.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Customer tile */}
            <button
              onClick={() => isRunner && switchToCustomer()}
              disabled={isCustomer || switching}
              style={{
                padding: '14px 10px', borderRadius: 14,
                border: `2px solid ${isCustomer ? 'var(--accent, #FF6B2B)' : 'var(--line, #2A2825)'}`,
                background: isCustomer ? 'rgba(255,107,43,0.07)' : 'var(--bg-0, #0C0B09)',
                cursor: isCustomer ? 'default' : 'pointer', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>🍽️</div>
              <p style={{ fontWeight: 800, fontSize: 13, color: isCustomer ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)', margin: '0 0 2px' }}>Customer</p>
              <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0 }}>Order food</p>
              {isCustomer && (
                <div style={{ marginTop: 8, background: 'var(--accent, #FF6B2B)', borderRadius: 6, padding: '2px 8px', display: 'inline-block' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'white' }}>ACTIVE</span>
                </div>
              )}
            </button>

            {/* Runner tile */}
            <button
              onClick={handleRunnerSwitch}
              disabled={runnerBtnDisabled}
              style={{
                padding: '14px 10px', borderRadius: 14,
                border: `2px solid ${isRunner ? 'var(--ok, #1DB954)' : 'var(--line, #2A2825)'}`,
                background: isRunner ? 'rgba(29,185,84,0.07)' : 'var(--bg-0, #0C0B09)',
                cursor: runnerBtnDisabled ? 'default' : 'pointer', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>🛵</div>
              <p style={{ fontWeight: 800, fontSize: 13, color: isRunner ? 'var(--ok, #1DB954)' : 'var(--ink-3, #6B6660)', margin: '0 0 2px' }}>Runner</p>
              <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0 }}>Earn ₦300/drop</p>
              {isRunner && (
                <div style={{ marginTop: 8, background: 'var(--ok, #1DB954)', borderRadius: 6, padding: '2px 8px', display: 'inline-block' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'white' }}>ACTIVE</span>
                </div>
              )}
              {!isRunner && runnerAppStatus === 'pending' && (
                <div style={{ marginTop: 8, background: 'var(--warn-dim, #1A1600)', borderRadius: 6, padding: '2px 8px', display: 'inline-block', border: '1px solid rgba(255,184,0,0.2)' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--warn, #FFB800)' }}>PENDING</span>
                </div>
              )}
              {!isRunner && !runnerAppStatus && (
                <p style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '6px 0 0' }}>Tap to apply</p>
              )}
            </button>
          </div>
          {runnerAppStatus === 'rejected' && (
            <p style={{ fontSize: 12, color: 'var(--danger, #FF3B30)', fontWeight: 600, textAlign: 'center', marginTop: 10 }}>
              Application rejected. Contact support below.
            </p>
          )}
        </div>

        {/* ── RECENT DELIVERY ADDRESS ── */}
        {lastAddress && (
          <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>📍 Recent address</p>
              <Link
                href="/checkout"
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #FF6B2B)', textDecoration: 'none' }}
              >
                Order here →
              </Link>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
              {lastAddress}
            </p>
            <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '8px 0 0' }}>
              This is pre-filled at checkout. You can always change it.
            </p>
          </div>
        )}

        {/* ── ACCOUNT DETAILS ── */}
        <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)' }}>
          <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 8px', color: 'white' }}>Account details</p>
          {[
            { label: 'Full name', val: u.full_name },
            { label: 'Email',     val: u.email     },
            { label: 'Phone',     val: u.phone     },
            // Only show matric for runners
            ...(isRunner && u.matric_number ? [{ label: 'Matric', val: u.matric_number }] : []),
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3, #6B6660)' }}>{item.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white', maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.val}</span>
            </div>
          ))}
        </div>

        {/* ── SUPPORT ── */}
        <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)' }}>
          <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 4px', color: 'white' }}>Need help?</p>
          <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 12px' }}>
            Issues with your order, refunds, or account — we&apos;re on WhatsApp.
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="press"
            style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(29,185,84,0.06)', borderRadius: 14, padding: '12px 16px', textDecoration: 'none', border: '1px solid rgba(29,185,84,0.18)' }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--ok, #1DB954)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>💬</div>
            <div>
              <p style={{ fontWeight: 800, fontSize: 14, color: 'var(--ok, #1DB954)', margin: 0 }}>Chat on WhatsApp</p>
              <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>Usually replies within 30 minutes</p>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--ok, #1DB954)', fontSize: 18 }}>›</span>
          </a>
        </div>


        {/* ── SHARE THE APP ── */}
        <button
          onClick={() => setShowShare(true)}
          className="press"
          style={{ width: '100%', background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent, #FF6B2B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎁</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>Share CampusRun</p>
            <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>Tell your friends — they'll thank you</p>
          </div>
          <span style={{ color: 'var(--ink-3, #6B6660)', fontSize: 18 }}>›</span>
        </button>

        {/* ── SHARE SHEET ── */}
        {showShare && <ShareSheet onClose={() => setShowShare(false)} userName={user?.full_name} />}

        {/* ── HOW IT WORKS ── */}
        <button
          onClick={() => router.push('/onboarding')}
          style={{ width: '100%', background: 'var(--bg-1, #1A1917)', color: 'var(--ink-2, #A09A8E)', fontWeight: 700, fontSize: 14, padding: '14px 16px', borderRadius: 16, border: '1px solid var(--line, #2A2825)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <span style={{ fontSize: 18 }}>ℹ️</span>
          How CampusRun works
          <span style={{ marginLeft: 'auto' }}>›</span>
        </button>

        {/* ── SIGN OUT ── */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{ width: '100%', background: 'var(--bg-1, #1A1917)', color: 'var(--danger, #FF3B30)', fontWeight: 800, fontSize: 15, padding: '16px', borderRadius: 16, border: '1px solid var(--line, #2A2825)', cursor: 'pointer', fontFamily: 'inherit', opacity: signingOut ? 0.6 : 1 }}
        >
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>

      <BottomNav active="profile" />
    </div>
  )
}

// ── Share sheet ───────────────────────────────────────────────
function ShareSheet({ onClose, userName }: { onClose: () => void; userName?: string }) {
  const url       = 'https://campusrun.food'
  const shareText = `Order food from campus restaurants, no queue. Try CampusRun: ${url}`
  // QR via free API — no library needed
  const qrUrl     = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}&color=0C0B09&bgcolor=FFFFFF&margin=8`

  const [copied,  setCopied]  = useState(false)
  const [sharing, setSharing] = useState(false)

  async function handleNativeShare() {
    if (sharing) return
    setSharing(true)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CampusRun', text: shareText, url })
      } else {
        await navigator.clipboard.writeText(shareText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch { /* user cancelled */ }
    setSharing(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', maxWidth: 430, margin: '0 auto', animation: 'fadeIn 0.2s ease' }}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
      <div style={{ width: '100%', background: 'var(--bg-1, #1A1917)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '14px 24px 36px', border: '1px solid var(--line, #2A2825)', borderBottom: 'none', animation: 'slideUp 0.25s ease', fontFamily: "'Nunito', system-ui, sans-serif" }}>

        {/* Handle */}
        <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 18px' }} />

        {/* Header */}
        <p className="label-cap" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 10, margin: '0 0 6px' }}>Share CampusRun</p>
        <h2 className="font-display" style={{ fontSize: 22, color: 'white', margin: '0 0 6px' }}>Spread the word</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 20px' }}>
          {userName ? `Help your friends discover the easiest way to order food on campus.` : 'Help your friends discover CampusRun.'}
        </p>

        {/* QR card */}
        <div style={{ background: 'white', borderRadius: 18, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="CampusRun QR code" width={200} height={200} style={{ display: 'block', borderRadius: 8 }} />
          <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 800, margin: '10px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>SCAN OR VISIT</p>
          <p className="font-display" style={{ fontSize: 18, color: '#0C0B09', margin: '2px 0 0' }}>campusrun.food</p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <button onClick={handleWhatsApp} className="press"
            style={{ background: 'rgba(29,185,84,0.1)', border: '1px solid rgba(29,185,84,0.25)', color: 'var(--ok, #1DB954)', fontWeight: 800, fontSize: 13, padding: '12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            💬 WhatsApp
          </button>
          <button onClick={handleNativeShare} disabled={sharing} className="press"
            style={{ background: 'var(--bg-2, #26241F)', border: '1px solid var(--line, #2A2825)', color: 'white', fontWeight: 800, fontSize: 13, padding: '12px', borderRadius: 12, cursor: sharing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: sharing ? 0.6 : 1 }}>
            ↗ More apps
          </button>
        </div>

        <button onClick={handleCopy} className="press"
          style={{ width: '100%', background: 'transparent', border: '1px solid var(--line, #2A2825)', color: copied ? 'var(--ok, #1DB954)' : 'var(--ink-2, #A09A8E)', fontWeight: 800, fontSize: 13, padding: '12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
          {copied ? '✓ Link copied' : '📋 Copy link'}
        </button>

        <button onClick={onClose}
          style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0' }}>
          Close
        </button>
      </div>
    </div>
  )
}
