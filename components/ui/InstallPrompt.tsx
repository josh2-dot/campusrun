'use client'

// components/ui/InstallPrompt.tsx
// Shows a contextual "Add to Home Screen" prompt.
// Android: captures beforeinstallprompt and shows a native-feeling bottom sheet.
// iOS:     detects Safari on iPhone/iPad and shows step-by-step manual instructions.
// Dismissed state persists in localStorage so it doesn't re-appear every visit.

import { useEffect, useState } from 'react'

type Platform = 'android' | 'ios' | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const DISMISS_KEY = 'campusrun_install_dismissed'
const DISMISS_DAYS = 14  // re-prompt after 14 days

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = parseInt(raw, 10)
    const daysAgo = (Date.now() - ts) / (1000 * 60 * 60 * 24)
    return daysAgo < DISMISS_DAYS
  } catch { return false }
}

function setDismissed() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  )
}

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return null
  const ua = window.navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS/.test(ua)  // Safari only, not Chrome on iOS
  if (isIOS) return 'ios'
  // Android check handled by beforeinstallprompt event
  return null
}

export function InstallPrompt() {
  const [show,     setShow]     = useState(false)
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Don't show if already installed or dismissed recently
    if (isInStandaloneMode() || isDismissed()) return

    // Android — capture the browser's install event
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setPlatform('android')
      // Small delay so it doesn't pop up the instant the page loads
      setTimeout(() => setShow(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS — no event, detect manually
    const plat = detectPlatform()
    if (plat === 'ios') {
      setTimeout(() => {
        setPlatform('ios')
        setShow(true)
      }, 3000)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    setDismissed()
    setShow(false)
  }

  async function handleAndroidInstall() {
    if (!deferredPrompt) return
    setInstalling(true)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShow(false)
    } else {
      setInstalling(false)
      dismiss()
    }
    setDeferredPrompt(null)
  }

  if (!show) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90 }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: '#1A1917',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '12px 24px 40px',
        border: '1px solid #2A2825', borderBottom: 'none',
        zIndex: 91,
        fontFamily: "'Nunito', system-ui, sans-serif",
        animation: 'slideUp 0.25s ease',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }`}</style>

        {/* Handle */}
        <div style={{ width: 36, height: 4, background: '#2A2825', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Icon + heading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#FF6B2B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 16px rgba(255,107,43,0.3)' }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>⚡</span>
          </div>
          <div>
            <p style={{ fontWeight: 900, fontSize: 17, color: 'white', margin: 0, lineHeight: 1.2 }}>
              Add CampusRun to your home screen
            </p>
            <p style={{ fontSize: 13, color: '#6B6660', fontWeight: 600, margin: '4px 0 0' }}>
              Faster. No browser bar. One tap to order.
            </p>
          </div>
        </div>

        {/* Android flow */}
        {platform === 'android' && (
          <>
            <div style={{ background: '#0C0B09', borderRadius: 14, padding: '12px 14px', marginBottom: 16, border: '1px solid #2A2825' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>🏃</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#A09A8E', margin: 0 }}>Works like a real app — no Play Store needed</p>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {['Instant load', 'Push notifications', 'Works offline'].map(f => (
                  <span key={f} style={{ fontSize: 11, color: '#6B6660', fontWeight: 700 }}>✓ {f}</span>
                ))}
              </div>
            </div>

            <button
              onClick={handleAndroidInstall}
              disabled={installing}
              style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 16, padding: '15px', borderRadius: 14, border: 'none', cursor: installing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: installing ? 0.7 : 1, marginBottom: 10 }}
            >
              {installing ? 'Installing…' : 'Add to Home Screen →'}
            </button>
            <button onClick={dismiss} style={{ width: '100%', background: 'transparent', border: 'none', color: '#6B6660', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0' }}>
              Maybe later
            </button>
          </>
        )}

        {/* iOS flow */}
        {platform === 'ios' && (
          <>
            <p style={{ fontSize: 12, color: '#6B6660', fontWeight: 800, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Two taps to install
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0C0B09', borderRadius: 12, padding: '12px 14px', border: '1px solid #2A2825' }}>
                <div style={{ width: 36, height: 36, background: '#1A1917', borderRadius: 8, border: '1px solid #2A2825', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {/* Share icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                </div>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>Tap the Share button</p>
                  <p style={{ fontSize: 12, color: '#6B6660', fontWeight: 600, margin: '2px 0 0' }}>The ↑ icon at the bottom of Safari</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0C0B09', borderRadius: 12, padding: '12px 14px', border: '1px solid #2A2825' }}>
                <div style={{ width: 36, height: 36, background: '#1A1917', borderRadius: 8, border: '1px solid #2A2825', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 18 }}>➕</span>
                </div>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>Tap "Add to Home Screen"</p>
                  <p style={{ fontSize: 12, color: '#6B6660', fontWeight: 600, margin: '2px 0 0' }}>Scroll down in the share sheet</p>
                </div>
              </div>

            </div>

            <button onClick={dismiss} style={{ width: '100%', background: 'transparent', border: '1px solid #2A2825', color: '#A09A8E', fontWeight: 700, fontSize: 14, padding: '13px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Got it
            </button>
          </>
        )}
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────
   InstallButton — manual trigger from the profile page.
   Captures beforeinstallprompt globally so we can fire it on tap.
   On iOS, shows a sheet with manual Add-to-Home-Screen instructions.
   Hides if app is already installed (display-mode: standalone).
   ───────────────────────────────────────────────────────────── */

let cachedPrompt: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    cachedPrompt = e as BeforeInstallPromptEvent
  })
}

export function InstallButton() {
  const [installed, setInstalled] = useState(false)
  const [showIOSSheet, setShowIOSSheet] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (isInStandaloneMode()) {
      setInstalled(true)
      return
    }
    // On unsupported browsers (e.g. desktop Safari, Firefox without PWA), hide
    const ua = navigator.userAgent
    const isIOSSafari = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua)
    if (!cachedPrompt && !isIOSSafari) {
      // Wait a moment in case event fires after mount
      setTimeout(() => {
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
        if (!cachedPrompt && !isIOS) setSupported(false)
      }, 1500)
    }
  }, [])

  async function handleClick() {
    if (cachedPrompt) {
      await cachedPrompt.prompt()
      const { outcome } = await cachedPrompt.userChoice
      if (outcome === 'accepted') {
        setInstalled(true)
        cachedPrompt = null
      }
      return
    }
    // iOS — show manual instructions
    setShowIOSSheet(true)
  }

  if (installed || !supported) return null

  return (
    <>
      <button
        onClick={handleClick}
        className="press"
        style={{ width: '100%', background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,107,43,0.12)', color: 'var(--accent, #FF6B2B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>
          📲
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>Install CampusRun</p>
          <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>Add to home screen — opens like a real app</p>
        </div>
        <span style={{ color: 'var(--ink-3, #6B6660)', fontSize: 18 }}>›</span>
      </button>

      {showIOSSheet && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowIOSSheet(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', maxWidth: 430, margin: '0 auto', animation: 'crFadeIn 0.2s ease' }}
        >
          <style>{`@keyframes crFadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes crSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
          <div style={{ width: '100%', background: 'var(--bg-1, #1A1917)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '14px 24px 36px', border: '1px solid var(--line, #2A2825)', borderBottom: 'none', animation: 'crSlideUp 0.25s ease', fontFamily: "'Nunito', system-ui, sans-serif" }}>
            <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 18px' }} />
            <p className="label-cap" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 10, margin: '0 0 6px' }}>Install on iPhone</p>
            <h2 className="font-display" style={{ fontSize: 22, color: 'white', margin: '0 0 14px' }}>3 quick steps</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {[
                { n: '1', title: 'Tap the Share button', body: 'The square with the arrow pointing up — at the bottom of Safari.' },
                { n: '2', title: 'Scroll and tap "Add to Home Screen"', body: 'You\'ll see the option in the action sheet.' },
                { n: '3', title: 'Tap "Add"', body: 'CampusRun will appear on your home screen like any app.' },
              ].map(step => (
                <div key={step.n} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, flexShrink: 0 }}>{step.n}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{step.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0', lineHeight: 1.5 }}>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowIOSSheet(false)} style={{ width: '100%', background: 'transparent', border: '1px solid var(--line, #2A2825)', borderRadius: 14, padding: '12px', color: 'var(--ink-2, #A09A8E)', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
