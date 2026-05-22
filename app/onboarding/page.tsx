'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Encoding-safe currency/symbol constants
const N = '\u20A6'   // \u20A6 = Naira sign

const SLIDES = [
  {
    id:      'order',
    badge:   'ORDERING',
    badgeCls:'pill-accent',
    emoji:   '\uD83C\uDF7D\uFE0F', // \uD83C\uDF7D = fork and knife with plate
    title:   'Food to your door,\ndelivered by students',
    body:    `Browse restaurants on campus, add to your cart, and pay once. Your food is picked up and dropped exactly where you are \u2014 hostel room, lecture hall, or gate.`,
    accent:  '#FF6B2B',
    bg:      'rgba(255,107,43,0.06)',
    border:  'rgba(255,107,43,0.18)',
    stat1:   { val: `${N}500`, lbl: 'flat delivery fee' },
    stat2:   { val: '<20m',    lbl: 'avg delivery time' },
  },
  {
    id:      'payment',
    badge:   'PAYMENTS',
    badgeCls:'pill-info',
    emoji:   '\uD83D\uDCB3', // \uD83D\uDCB3 = credit card
    title:   'Pay via bank\ntransfer or USSD',
    body:    `After placing your order you are redirected to Paystack. Pay by bank transfer or USSD \u2014 no card needed. Your order is confirmed the moment payment clears.`,
    accent:  '#4A9EFF',
    bg:      'rgba(74,158,255,0.06)',
    border:  'rgba(74,158,255,0.18)',
    stat1:   { val: 'USSD',     lbl: 'no card needed'  },
    stat2:   { val: '100%',     lbl: 'secure checkout'  },
  },
  {
    id:      'code',
    badge:   'DELIVERY',
    badgeCls:'pill-warn',
    emoji:   '\uD83D\uDD10', // \uD83D\uDD10 = closed lock
    title:   'Confirm delivery\nwith a secret code',
    body:    `You get a 4-digit delivery code on your tracking screen after your runner picks up the food. Share it only when the runner arrives at your door \u2014 they enter it to close the order.`,
    accent:  '#FFB800',
    bg:      'rgba(255,184,0,0.06)',
    border:  'rgba(255,184,0,0.18)',
    stat1:   { val: '4-digit', lbl: 'delivery code'    },
    stat2:   { val: 'Live',    lbl: 'order tracking'   },
  },
  {
    id:      'runner',
    badge:   'EARN',
    badgeCls:'pill-ok',
    emoji:   '\uD83D\uDEF5', // \uD83D\uDEF5 = motor scooter
    title:   `Earn ${N}300 per\ndelivery as a runner`,
    body:    `Already a student? Apply as a runner from your profile page. Toggle availability on when you want to work, accept orders near you, and get paid per drop. Zero commitment.`,
    accent:  '#1DB954',
    bg:      'rgba(29,185,84,0.06)',
    border:  'rgba(29,185,84,0.18)',
    stat1:   { val: `${N}300`, lbl: 'per delivery'     },
    stat2:   { val: 'Flex',    lbl: 'no schedule'      },
  },
]

export default function OnboardingPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [slide,  setSlide]  = useState(0)
  const [saving, setSaving] = useState(false)
  const [dir,    setDir]    = useState<'forward' | 'back'>('forward')
  const [animKey, setAnimKey] = useState(0)

  const current = SLIDES[slide]
  const isLast  = slide === SLIDES.length - 1
  const isFirst = slide === 0

  useEffect(() => { setAnimKey(k => k + 1) }, [slide])

  async function finish() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('users').update({ onboarding_done: true }).eq('id', user.id)
    }
    router.replace('/home')
  }

  function go(next: number) {
    setDir(next > slide ? 'forward' : 'back')
    setSlide(next)
  }

  function next() { if (isLast) { finish() } else { go(slide + 1) } }
  function back() { if (!isFirst) go(slide - 1) }

  return (
    <div
      className="mobile-container"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', fontFamily: "'Nunito', system-ui, sans-serif" }}
    >
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(32px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-32px); }
          to   { opacity: 1; transform: translateX(0);     }
        }
        .slide-fwd { animation: slideInRight 0.28s ease forwards; }
        .slide-bck { animation: slideInLeft  0.28s ease forwards; }
      `}</style>

      {/* ── TOP BAR ── */}
      <div
        className="dot-texture"
        style={{ padding: '52px 20px 20px', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Logo wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent, #FF6B2B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
              {'\uD83D\uDEF5'}
            </div>
            <span className="font-display" style={{ color: 'white', fontSize: 15, letterSpacing: '-0.01em' }}>CampusRun</span>
          </div>

          {/* Skip */}
          <button
            onClick={finish}
            disabled={saving}
            style={{ background: 'none', border: 'none', color: 'var(--ink-3, #6B6660)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px' }}
          >
            Skip
          </button>
        </div>

        {/* Step track */}
        <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                flex: i === slide ? 3 : 1,
                height: 4, borderRadius: 2,
                background: i <= slide ? current.accent : 'var(--bg-2, #26241F)',
                border: 'none', cursor: 'pointer', padding: 0,
                transition: 'flex 0.25s ease, background 0.25s ease',
              }}
            />
          ))}
        </div>
        <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '8px 0 0', fontSize: 9 }}>
          {slide + 1} of {SLIDES.length}
        </p>
      </div>

      {/* ── SLIDE CONTENT ── */}
      <div
        key={animKey}
        className={dir === 'forward' ? 'slide-fwd' : 'slide-bck'}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 20px 24px', gap: 20 }}
      >
        {/* Badge + icon row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: 20, flexShrink: 0,
              background: current.bg, border: `1.5px solid ${current.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
            }}
          >
            {current.emoji}
          </div>
          <div>
            <span className={`pill ${current.badgeCls}`} style={{ marginBottom: 8, display: 'inline-flex' }}>
              {current.badge}
            </span>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <StatChip val={current.stat1.val} lbl={current.stat1.lbl} accent={current.accent} />
              <StatChip val={current.stat2.val} lbl={current.stat2.lbl} accent={current.accent} />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1
          className="font-display"
          style={{
            color: 'white', fontSize: 30, margin: 0, lineHeight: 1.1,
            whiteSpace: 'pre-line',
          }}
        >
          {current.title}
        </h1>

        {/* Body */}
        <p
          style={{
            color: 'var(--ink-2, #A09A8E)', fontSize: 15, fontWeight: 500,
            margin: 0, lineHeight: 1.75,
          }}
        >
          {current.body}
        </p>

        {/* Visual explainer card — different per slide */}
        <ExplainerCard slide={current.id} accent={current.accent} />
      </div>

      {/* ── BOTTOM ACTIONS ── */}
      <div style={{ padding: '0 20px 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={next}
          disabled={saving}
          className="press"
          style={{
            width: '100%', fontWeight: 900, fontSize: 16, padding: '16px',
            borderRadius: 16, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
            background: current.accent, color: 'white',
            transition: 'background 0.25s',
          }}
        >
          {saving ? 'Getting started...' : isLast ? "Let's eat!" : 'Next'}
        </button>

        {!isFirst && (
          <button
            onClick={back}
            style={{ width: '100%', background: 'none', border: 'none', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 14, padding: '10px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Back
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────── */

function StatChip({ val, lbl, accent }: { val: string; lbl: string; accent: string }) {
  return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 8, padding: '5px 10px', border: '1px solid var(--line, #2A2825)' }}>
      <p style={{ fontWeight: 900, fontSize: 13, color: accent, margin: 0, lineHeight: 1 }}>{val}</p>
      <p className="label-cap" style={{ fontSize: 8, color: 'var(--ink-3, #6B6660)', margin: '3px 0 0' }}>{lbl}</p>
    </div>
  )
}

function ExplainerCard({ slide, accent }: { slide: string; accent: string }) {
  const N   = '\u20A6'
  const DOT = '\u00B7'

  if (slide === 'order') return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 14, border: '1px solid var(--line, #2A2825)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: 0, fontSize: 9 }}>Example order</p>
      {[
        { name: 'Jollof rice + chicken', qty: 1, price: 1200 },
        { name: 'Chilled Coke',          qty: 2, price: 400  },
      ].map(item => (
        <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--ink-2, #A09A8E)' }}>
          <span>{item.name} x{item.qty}</span>
          <span style={{ color: 'white' }}>{N}{(item.price * item.qty).toLocaleString()}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--line-soft, #1F1D1B)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3, #6B6660)' }}>Food {DOT} Delivery</span>
        <span style={{ fontSize: 14, fontWeight: 900, color: accent }}>{N}1,600 {DOT} {N}500</span>
      </div>
    </div>
  )

  if (slide === 'payment') return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 14, border: '1px solid var(--line, #2A2825)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: 0, fontSize: 9 }}>Payment options</p>
      {[
        { icon: '\uD83C\uDFE6', label: 'Bank transfer', sub: 'Get account number, transfer from any app' },
        { icon: '\uD83D\uDCF1', label: 'USSD',          sub: 'Dial a code — works without internet'      },
        { icon: '\uD83D\uDCB3', label: 'Card',          sub: 'Debit or credit, Paystack secured'          },
      ].map(m => (
        <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-2, #26241F)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{m.icon}</div>
          <div>
            <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>{m.label}</p>
            <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '1px 0 0' }}>{m.sub}</p>
          </div>
        </div>
      ))}
    </div>
  )

  if (slide === 'code') return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)', textAlign: 'center' }}>
      <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '0 0 12px', fontSize: 9 }}>Your delivery code looks like this</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        {['4', '7', '2', '9'].map((d, i) => (
          <div key={i} style={{ width: 52, height: 60, borderRadius: 12, background: 'var(--bg-0, #0C0B09)', border: `2px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: accent, fontFamily: "'Syne', sans-serif" }}>
            {d}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: 0 }}>
        Only share this when your runner is standing in front of you
      </p>
    </div>
  )

  if (slide === 'runner') return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 14, border: '1px solid var(--line, #2A2825)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: 0, fontSize: 9 }}>How runner pay works</p>
      {[
        { label: 'Customer pays',     val: `${N}2,150`, note: 'food + delivery'  },
        { label: 'Restaurant gets',   val: `${N}1,500`, note: 'food cost'        },
        { label: 'You earn',          val: `${N}300`,   note: 'per delivery', accent: true },
        { label: 'Platform keeps',    val: `${N}200`,   note: 'operations'    },
      ].map(row => (
        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2, #A09A8E)' }}>{row.label}</span>
          <span style={{ fontSize: 13, fontWeight: row.accent ? 900 : 700, color: row.accent ? accent : 'white' }}>
            {row.val} <span style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>{row.note}</span>
          </span>
        </div>
      ))}
    </div>
  )

  return null
}
