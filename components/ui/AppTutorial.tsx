'use client'

// components/ui/AppTutorial.tsx
// Full-screen step-by-step walkthrough that teaches new users how CampusRun works.
// Triggered from the profile page ("How CampusRun works") or first-time after onboarding.
// Self-contained — no library needed. Slides through illustrated steps with progress dots.

import { useState } from 'react'

interface TutorialStep {
  emoji:    string
  capLabel: string
  title:    string
  body:     string
  visual?:  React.ReactNode  // optional inline mock illustration
}

const STEPS: TutorialStep[] = [
  {
    emoji: '👋',
    capLabel: 'WELCOME',
    title: 'Food, without the walk.',
    body: "CampusRun delivers food from campus restaurants to your hostel or block. Fellow students run the deliveries — ₦500 delivery, under 15 minutes. Here's how it works in 30 seconds.",
  },
  {
    emoji: '⭐',
    capLabel: 'STEP 1',
    title: 'Find what you want',
    body: "On the home page, you'll see featured dishes at the top — what's popular today. Below that, every open restaurant on campus. Tap any restaurant to browse their full menu.",
    visual: <FeaturedMock />,
  },
  {
    emoji: '🍽️',
    capLabel: 'STEP 2',
    title: 'Build your plate',
    body: "For dishes like Jollof or Fried Rice, you'll pick a portion size and add sides. For swallows like Eba or Pounded Yam, you choose between garri or fufu. Everything customisable, like ordering in person.",
    visual: <BuildPlateMock />,
  },
  {
    emoji: '💳',
    capLabel: 'STEP 3',
    title: 'Pay through Paystack',
    body: "Add your hostel block to delivery address, pick a time (now or schedule for later), and pay through Paystack. Bank transfer or USSD — no card needed. You'll see a small processing fee at checkout (about ₦100 + 1.5%) — that's what Paystack charges, not us. Payment is held until your food arrives.",
  },
  {
    emoji: '🏃',
    capLabel: 'STEP 4',
    title: 'Track your runner live',
    body: "After payment, you'll see your order being prepared, then picked up, then delivered. Real-time ETA. You'll also get a 4-digit code — give this to your runner when they arrive so they know they have the right person.",
    visual: <TrackMock />,
  },
  {
    emoji: '✨',
    capLabel: 'STEP 5',
    title: 'Skip the queue with pre-orders',
    body: "Some restaurants (like Amanam, has long queues) let you pre-order hours in advance. Pay before peak time, food is ready when you arrive. No queue, no wait. Look for the ⚡ pre-order tag on the home page.",
  },
  {
    emoji: '⭐',
    capLabel: 'STEP 6',
    title: 'Rate your runner',
    body: "After your food arrives, rate the runner from 1 to 5 stars. Good runners get more orders. You can also reorder from past orders with one tap from your Orders page.",
  },
  {
    emoji: '🎁',
    capLabel: 'STEP 7',
    title: 'Share with friends',
    body: "Tap 'Share CampusRun' on your profile to get a QR code you can send to friends on WhatsApp or save as your status. The more people on the platform, the faster everyone's food arrives.",
  },
  {
    emoji: '🚀',
    capLabel: "YOU'RE READY",
    title: "That's the whole app.",
    body: "Questions? Tap 'Need help?' on your profile to chat with us on WhatsApp. Now go order something — your food is waiting.",
  },
]

export function AppTutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isFirst = step === 0
  const isLast  = step === STEPS.length - 1

  function next() {
    if (isLast) onClose()
    else setStep(s => s + 1)
  }
  function prev() {
    if (!isFirst) setStep(s => s - 1)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#0C0B09',
      fontFamily: "'Nunito', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      maxWidth: 430, margin: '0 auto',
      animation: 'fadeIn 0.2s ease',
    }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes slideIn { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }`}</style>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' }}>
        <button onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#A09A8E', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          Skip
        </button>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6B6660', fontWeight: 700, letterSpacing: '0.1em' }}>
          {step + 1} / {STEPS.length}
        </span>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, padding: '20px 24px 0' }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? '#FF6B2B' : '#1F1D1B',
            transition: 'background 0.25s',
          }} />
        ))}
      </div>

      {/* Body — scrollable if content is long */}
      <div style={{ flex: 1, padding: '40px 28px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div key={step} style={{ animation: 'slideIn 0.3s ease' }}>

          {/* Visual / emoji */}
          {current.visual ? (
            <div style={{ marginBottom: 28 }}>{current.visual}</div>
          ) : (
            <div style={{
              width: 88, height: 88, borderRadius: 24,
              background: 'rgba(255,107,43,0.1)',
              border: '1px solid rgba(255,107,43,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 44, marginBottom: 28,
            }}>
              {current.emoji}
            </div>
          )}

          {/* Cap label */}
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, fontWeight: 700,
            color: '#FF6B2B',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            margin: '0 0 10px',
          }}>
            {current.capLabel}
          </p>

          {/* Title */}
          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 32, fontWeight: 800,
            color: 'white', lineHeight: 1.05,
            letterSpacing: '-0.02em',
            margin: '0 0 14px',
          }}>
            {current.title}
          </h2>

          {/* Body */}
          <p style={{ fontSize: 15, color: '#A09A8E', fontWeight: 600, lineHeight: 1.6, margin: 0 }}>
            {current.body}
          </p>
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ padding: '16px 24px 32px', display: 'flex', gap: 10 }}>
        {!isFirst && (
          <button onClick={prev} className="press"
            style={{ flex: '0 0 auto', padding: '14px 20px', background: '#1A1917', border: '1px solid #2A2825', color: '#A09A8E', fontWeight: 800, fontSize: 14, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            ← Back
          </button>
        )}
        <button onClick={next} className="press"
          style={{ flex: 1, padding: '14px', background: '#FF6B2B', border: 'none', color: 'white', fontWeight: 900, fontSize: 16, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {isLast ? "Let's go" : 'Next'} <span style={{ fontSize: 18 }}>→</span>
        </button>
      </div>
    </div>
  )
}

// ── Inline mock illustrations ─────────────────────────────────────────

function FeaturedMock() {
  return (
    <div style={{ width: '100%', borderRadius: 16, padding: 16, background: '#141310', border: '1px solid #1F1D1B' }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, color: '#6B6660', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 12px' }}>
        Popular dishes <span style={{ color: '#FF6B2B' }}>· 4 dishes</span>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {['🍛', '🍗', '🥘', '🥗'].map((emoji, i) => (
          <div key={i} style={{ flex: 1, background: '#1A1917', borderRadius: 10, padding: '14px 8px', textAlign: 'center', border: '1px solid #2A2825' }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{emoji}</div>
            <div style={{ fontSize: 9, color: '#FF6B2B', fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>₦{[1200, 1500, 1800, 900][i]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BuildPlateMock() {
  return (
    <div style={{ width: '100%', borderRadius: 16, padding: 16, background: '#141310', border: '1px solid #1F1D1B' }}>
      <p style={{ fontWeight: 800, color: 'white', fontSize: 14, margin: '0 0 12px' }}>Jollof Rice</p>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6B6660', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>Pick your portion</p>
      {[
        { size: 'Small', price: '₦800', selected: false },
        { size: 'Medium', price: '₦1,200', selected: true },
        { size: 'Large', price: '₦1,600', selected: false },
      ].map(p => (
        <div key={p.size} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, marginBottom: 4, background: p.selected ? 'rgba(255,107,43,0.1)' : 'transparent', border: p.selected ? '1px solid rgba(255,107,43,0.3)' : '1px solid transparent' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: p.selected ? '#FF6B2B' : '#A09A8E' }}>{p.size}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: p.selected ? '#FF6B2B' : '#6B6660' }}>{p.price}</span>
        </div>
      ))}
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6B6660', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '12px 0 8px' }}>Add a side</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['+ Chicken', '+ Plantain', '+ Egg'].map(s => (
          <span key={s} style={{ fontSize: 11, padding: '6px 10px', borderRadius: 16, background: '#1A1917', border: '1px solid #2A2825', color: '#A09A8E', fontWeight: 700 }}>{s}</span>
        ))}
      </div>
    </div>
  )
}

function TrackMock() {
  return (
    <div style={{ width: '100%', borderRadius: 16, padding: 16, background: '#141310', border: '1px solid #1F1D1B' }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, color: '#FF6B2B', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 6px' }}>
        Arrives in
      </p>
      <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 36, color: '#FF6B2B', fontWeight: 800, lineHeight: 1, margin: '0 0 16px' }}>
        ~12 <span style={{ fontSize: 14, color: 'white' }}>min</span>
      </p>
      {[
        { label: 'Payment received', done: true },
        { label: 'Runner picked up', done: true },
        { label: 'On the way', done: false, active: true },
        { label: 'Delivered',       done: false },
      ].map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            background: s.done ? '#1DB954' : (s.active ? '#FF6B2B' : '#2A2825'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: 'white', fontWeight: 900,
          }}>
            {s.done ? '✓' : ''}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: s.done ? 'white' : (s.active ? '#FF6B2B' : '#6B6660') }}>{s.label}</span>
        </div>
      ))}
      <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.2)', borderRadius: 10, textAlign: 'center' }}>
        <p style={{ fontSize: 10, color: '#6B6660', fontWeight: 700, margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Show your runner</p>
        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, color: '#FF6B2B', fontWeight: 800, letterSpacing: '0.3em', margin: '4px 0 0' }}>4 8 2 7</p>
      </div>
    </div>
  )
}
