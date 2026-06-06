// components/ui/HomeQuickActions.tsx
'use client'

import { useEffect, useState } from 'react'
import { Bell, Download, ChevronRight } from 'lucide-react'
import { getPushState, subscribePush } from '@/lib/push'

const DISMISS_KEY_PUSH    = 'campusrun_push_dismiss_until'
const DISMISS_KEY_INSTALL = 'campusrun_install_dismiss_until'
const SNOOZE_DAYS         = 14

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

// Singleton — capture the install event globally so it works regardless of which page mounts first
let cachedInstallPrompt: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    cachedInstallPrompt = e as BeforeInstallPromptEvent
  })
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  // iOS
  if ((window.navigator as { standalone?: boolean }).standalone) return true
  // Android / Desktop
  return window.matchMedia('(display-mode: standalone)').matches
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent)
}

function isSnoozed(key: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    const until = parseInt(localStorage.getItem(key) ?? '0')
    return until > Date.now()
  } catch { return false }
}

function snooze(key: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000))
  } catch { /* no-op */ }
}

export function HomeQuickActions() {
  const [pushState,   setPushState]   = useState<'unsupported' | 'denied' | 'off' | 'on' | 'loading'>('loading')
  const [installable, setInstallable] = useState<'unsupported' | 'installed' | 'ready'>('unsupported')
  const [iosFlow,     setIosFlow]     = useState(false)
  const [pushDismissed,    setPushDismissed]    = useState(false)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [working,     setWorking]     = useState<'push' | 'install' | null>(null)

  useEffect(() => {
    // Push state
    getPushState().then(s => setPushState(s)).catch(() => setPushState('off'))

    // Install state
    if (isInStandaloneMode()) {
      setInstallable('installed')
    } else if (cachedInstallPrompt || isIOS()) {
      setInstallable('ready')
    } else {
      // Could become ready if beforeinstallprompt fires later
      const recheck = setTimeout(() => {
        if (cachedInstallPrompt) setInstallable('ready')
      }, 1500)
      return () => clearTimeout(recheck)
    }

    // Dismiss state from localStorage
    setPushDismissed(isSnoozed(DISMISS_KEY_PUSH))
    setInstallDismissed(isSnoozed(DISMISS_KEY_INSTALL))
  }, [])

  async function handlePush() {
    if (working) return
    setWorking('push')
    const { ok, error } = await subscribePush()
    if (ok) {
      setPushState('on')
    } else if (error) {
      alert(error)
    }
    setWorking(null)
  }

  async function handleInstall() {
    if (working) return
    setWorking('install')

    if (cachedInstallPrompt) {
      try {
        await cachedInstallPrompt.prompt()
        const { outcome } = await cachedInstallPrompt.userChoice
        if (outcome === 'accepted') {
          setInstallable('installed')
          cachedInstallPrompt = null
        }
      } catch { /* user dismissed */ }
    } else if (isIOS()) {
      setIosFlow(true)
    }

    setWorking(null)
  }

  function dismissPush() {
    snooze(DISMISS_KEY_PUSH)
    setPushDismissed(true)
  }

  function dismissInstall() {
    snooze(DISMISS_KEY_INSTALL)
    setInstallDismissed(true)
  }

  // Determine which banners to render
  const showPush    = pushState === 'off' && !pushDismissed
  const showInstall = installable === 'ready' && !installDismissed

  if (!showPush && !showInstall && !iosFlow) return null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {showPush && (
          <ActionBanner
            icon={<Bell size={18} />}
            iconBg="rgba(255,107,43,0.12)"
            iconColor="#FF6B2B"
            title="Turn on order alerts"
            subtitle="Know the second your food is ready"
            onTap={handlePush}
            onDismiss={dismissPush}
            loading={working === 'push'}
          />
        )}

        {showInstall && (
          <ActionBanner
            icon={<Download size={18} />}
            iconBg="rgba(74,158,255,0.12)"
            iconColor="#4A9EFF"
            title="Install CampusRun"
            subtitle="Tap once to order. No more browser tabs."
            onTap={handleInstall}
            onDismiss={dismissInstall}
            loading={working === 'install'}
          />
        )}
      </div>

      {iosFlow && <IOSInstallSheet onClose={() => setIosFlow(false)} />}
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */

function ActionBanner({
  icon, iconBg, iconColor, title, subtitle, onTap, onDismiss, loading,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  subtitle: string
  onTap: () => void
  onDismiss: () => void
  loading: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--bg-1, #1A1917)',
        border: '1px solid var(--line, #2A2825)',
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: 10,
          background: iconBg, color: iconColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <button
        onClick={onTap}
        disabled={loading}
        className="press"
        aria-label={title}
        style={{
          flex: 1, minWidth: 0,
          background: 'transparent', border: 'none', padding: 0,
          textAlign: 'left', cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>
          {loading ? 'Just a sec…' : title}
        </p>
        <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
          {subtitle}
        </p>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'transparent', border: 'none', padding: '6px 8px',
            color: 'var(--ink-3, #6B6660)', fontSize: 10, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Later
        </button>
        <ChevronRight size={16} color="var(--ink-3, #6B6660)" />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */

function IOSInstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 80,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        maxWidth: 430, margin: '0 auto',
        animation: 'crFadeIn 0.2s ease',
      }}
    >
      <style>{`
        @keyframes crFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes crSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
      <div
        style={{
          width: '100%',
          background: 'var(--bg-1, #1A1917)',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: '14px 24px 36px',
          border: '1px solid var(--line, #2A2825)',
          borderBottom: 'none',
          animation: 'crSlideUp 0.25s ease',
          fontFamily: "'Nunito', system-ui, sans-serif",
        }}
      >
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
              <div
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--accent, #FF6B2B)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 13, flexShrink: 0,
                }}
              >
                {step.n}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{step.title}</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0', lineHeight: 1.5 }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%', background: 'transparent',
            border: '1px solid var(--line, #2A2825)', borderRadius: 14,
            padding: '12px', color: 'var(--ink-2, #A09A8E)',
            fontWeight: 800, fontSize: 14, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
