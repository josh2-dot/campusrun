'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CUSTOMER_CANCEL_REASONS } from '@/lib/cancel-reasons'
import { monogram } from '@/lib/utils'
import type { Order } from '@/types'
import { AlertTriangle, ChevronLeft, MessageCircle, Phone, Star } from 'lucide-react'

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'awaiting_runner', 'runner_assigned', 'preparing']
const MILESTONES = ['Placed', 'Confirmed', 'On the way', 'Delivered'] as const

function statusToStep(status: string): number {
  switch (status) {
    case 'pending':          return 0
    case 'confirmed':        return 1
    case 'awaiting_runner':  return 1
    case 'runner_assigned':  return 2
    case 'preparing':        return 2
    case 'picked_up':        return 2
    case 'delivered':        return 3
    default:                 return 0
  }
}

function statusLabel(s: string) {
  if (s === 'delivered')                              return 'Delivered!'
  if (s === 'cancelled')                             return 'Cancelled'
  if (s === 'needs_attention')                       return 'Finding runner'
  if (s === 'awaiting_runner')                       return 'Finding a runner…'
  if (s === 'runner_assigned' || s === 'preparing') return 'Runner is on it'
  if (s === 'picked_up')                             return 'Out for delivery'
  return 'Order placed'
}

/* ── CancelSheet ────────────────────────────────────────── */
function CancelSheet({ onConfirm, onClose, confirming }: {
  onConfirm: (reason: string) => void
  onClose: () => void
  confirming: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', maxWidth: 430, margin: '0 auto' }}>
      <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: '24px 24px 0 0', padding: '24px 20px 36px', border: '1px solid var(--line, #2A2825)', borderBottom: 'none' }}>
        <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 16px' }} />
        <p style={{ fontWeight: 900, fontSize: 18, margin: '0 0 4px', color: 'white' }}>Cancel order?</p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, margin: '0 0 20px' }}>Let us know why</p>
        {CUSTOMER_CANCEL_REASONS.map(r => (
          <button
            key={r.key}
            onClick={() => setSelected(r.key)}
            style={{ width: '100%', background: selected === r.key ? 'rgba(255,107,43,0.15)' : 'var(--bg-0, #0C0B09)', border: `2px solid ${selected === r.key ? '#FF6B2B' : 'var(--line, #2A2825)'}`, borderRadius: 14, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', fontFamily: "'Nunito', sans-serif" }}
          >
            <span style={{ fontSize: 20 }}>{r.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: selected === r.key ? '#FF6B2B' : 'rgba(255,255,255,0.8)' }}>{r.label}</span>
          </button>
        ))}
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600, margin: '8px 0 16px', textAlign: 'center' }}>
          Refunds are processed manually. Contact support if needed.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={confirming} style={{ flex: 1, background: 'var(--bg-2, #26241F)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 15, padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
            Keep order
          </button>
          <button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || confirming}
            style={{ flex: 1, background: selected ? 'var(--danger, #FF3B30)' : 'var(--bg-2, #26241F)', color: selected ? 'white' : '#555', fontWeight: 900, fontSize: 15, padding: '14px', borderRadius: 14, border: 'none', cursor: selected ? 'pointer' : 'not-allowed', fontFamily: "'Nunito', sans-serif", opacity: confirming ? 0.7 : 1 }}
          >
            {confirming ? 'Cancelling...' : 'Cancel order'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── DeliveryCodeCard ────────────────────────────────────── */
function DeliveryCodeCard({ code }: { code: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, border: '1px solid var(--line, #2A2825)' }}>
      <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 4px', color: 'white' }}>🔐 Delivery Code</p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: '0 0 14px' }}>
        Share this code only with your runner to confirm delivery
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
        {revealed
          ? code.split('').map((digit, i) => (
              <div key={i} style={{ width: 56, height: 64, borderRadius: 14, background: 'var(--bg-0, #0C0B09)', border: '2px solid var(--accent, #FF6B2B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: 'var(--accent, #FF6B2B)', fontFamily: "'Syne', sans-serif" }}>
                {digit}
              </div>
            ))
          : [0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 56, height: 64, borderRadius: 14, background: 'var(--bg-0, #0C0B09)', border: '2px solid var(--line, #2A2825)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#444' }}>•</div>
            ))
        }
      </div>
      <button onClick={() => setRevealed(r => !r)} className="press" style={{ width: '100%', background: revealed ? 'var(--bg-2, #26241F)' : 'rgba(255,107,43,0.15)', color: revealed ? 'rgba(255,255,255,0.5)' : 'var(--accent, #FF6B2B)', border: `1.5px solid ${revealed ? 'var(--line, #2A2825)' : 'rgba(255,107,43,0.3)'}`, borderRadius: 12, padding: '10px', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
        {revealed ? '🙈 Hide code' : '👁 Show code'}
      </button>
    </div>
  )
}

/* ── RatingPrompt ───────────────────────────────────────── */
function RatingPrompt({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [stars, setStars] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!stars) return
    setSubmitting(true)
    const res = await fetch('/api/orders/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, stars, comment }),
    })
    const { success } = await res.json()
    setSubmitting(false)
    if (success) { setDone(true); setTimeout(onDone, 1500) }
  }

  if (done) return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 24, border: '1px solid var(--line, #2A2825)', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>🙏</div>
      <p style={{ fontWeight: 800, fontSize: 16, color: 'white', margin: 0 }}>Thanks for rating!</p>
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 20, border: '1px solid rgba(255,107,43,0.3)' }}>
      <p style={{ fontWeight: 900, fontSize: 16, color: 'white', margin: '0 0 4px' }}>Rate your runner ⭐</p>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: '0 0 16px' }}>How was your delivery experience?</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setStars(n)} onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)} style={{ fontSize: 36, background: 'none', border: 'none', cursor: 'pointer', padding: 4, transition: 'transform 0.1s', transform: (hovered || stars) >= n ? 'scale(1.2)' : 'scale(1)' }}>
            {(hovered || stars) >= n ? '⭐' : '☆'}
          </button>
        ))}
      </div>
      {stars > 0 && (
        <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--accent, #FF6B2B)', margin: '0 0 12px' }}>
          {['', 'Poor 😔', 'Fair 😐', 'Good 👍', 'Great 😊', 'Excellent 🔥'][stars]}
        </p>
      )}
      <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment (optional)" maxLength={200} rows={2} style={{ width: '100%', background: 'var(--bg-0, #0C0B09)', border: '1px solid var(--line, #2A2825)', borderRadius: 12, padding: '10px 12px', color: 'white', fontSize: 13, fontFamily: "'Nunito', sans-serif", resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onDone} style={{ flex: 1, background: 'var(--bg-2, #26241F)', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 14, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Skip</button>
        <button onClick={submit} disabled={!stars || submitting} className="press" style={{ flex: 2, background: stars ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', color: stars ? 'white' : '#555', fontWeight: 900, fontSize: 15, padding: '12px', borderRadius: 12, border: 'none', cursor: stars ? 'pointer' : 'not-allowed', fontFamily: "'Nunito', sans-serif", opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Submitting...' : 'Submit Rating'}
        </button>
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────── */
export default function TrackingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [showCancel, setShowCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [alreadyRated, setAlreadyRated] = useState(false)

  useEffect(() => {
    const fetchOrder = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, is_pre_order, runner_assigned_at, picked_up_at, restaurant:restaurants(name, avg_prep_time), runner:users!runner_id(full_name, phone)')
        .eq('id', id)
        .single()

      if (data) {
        setOrder(data)
        setLoading(false)
        if (data.status === 'delivered' && !alreadyRated) {
          const { data: existing } = await supabase
            .from('ratings').select('id').eq('order_id', id).single()
          if (!existing) setShowRating(true)
          else setAlreadyRated(true)
        }
      }
    }

    fetchOrder()

    const channel = supabase
      .channel('track-order-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => fetchOrder())
      .subscribe()

    const poll = setInterval(fetchOrder, 5000)

    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const eta = useMemo(() => {
    if (!order) return null
    const rest = order.restaurant as { name?: string; avg_prep_time?: number } | null
    const prep = rest?.avg_prep_time ?? 15
    const o = order as Order & { runner_assigned_at?: string; picked_up_at?: string }

    let arriveAt: number
    let label: string
    let isRough = false

    if (o.picked_up_at) {
      // Runner has food — 10 min campus delivery
      arriveAt = new Date(o.picked_up_at).getTime() + 10 * 60_000
      label = 'Delivering'
    } else if (o.runner_assigned_at) {
      // Runner assigned — prep + 3 min travel to restaurant
      arriveAt = new Date(o.runner_assigned_at).getTime() + (prep + 3) * 60_000
      label = 'Preparing'
    } else {
      // Awaiting runner — rough estimate from order time
      arriveAt = new Date(order.created_at).getTime() + (prep + 15) * 60_000
      label = 'Finding runner'
      isRough = true
    }

    const remaining = Math.max(0, Math.round((arriveAt - now) / 60_000))
    return { remainingMin: remaining, label, isRough }
  }, [order, now])

  async function cancelOrder(reason: string) {
    setCancelling(true)
    const res = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: id, reason }),
    })
    const { success, error } = await res.json()
    setCancelling(false)
    setShowCancel(false)
    if (!success) alert(error || 'Could not cancel order')
  }

  if (loading) return <TrackingSkeleton />
  if (!order) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3, #6B6660)', background: 'var(--bg-0, #0C0B09)', minHeight: '100vh' }}>
      Order not found
    </div>
  )

  const step = statusToStep(order.status)
  const isDelivered    = order.status === 'delivered'
  const isCancelled    = order.status === 'cancelled'
  const needsAttention = order.status === 'needs_attention'
  const awaitingRunner = order.status === 'awaiting_runner'
  const isPickedUp     = order.status === 'picked_up'
  const canCancel      = CANCELLABLE_STATUSES.includes(order.status)
  const runner         = order.runner as { full_name: string; phone: string } | null
  const restaurant     = order.restaurant as { name: string } | null
  const deliveryCode   = (order as Order & { delivery_code?: string }).delivery_code
  const scheduledFor      = (order as Order & { scheduled_for?: string }).scheduled_for
  const isScheduledPending = order.status === 'confirmed' && !!scheduledFor && new Date(scheduledFor) > new Date(now)
  const minsUntilScheduled = scheduledFor ? Math.max(0, Math.round((new Date(scheduledFor).getTime() - now) / 60_000)) : 0
  const scheduledTimeLabel = scheduledFor ? new Date(scheduledFor).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : ''
  const accent = isDelivered ? 'var(--ok, #1DB954)' : needsAttention || isCancelled ? 'var(--danger, #FF3B30)' : isScheduledPending ? 'var(--warn, #FFB800)' : 'var(--accent, #FF6B2B)'

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      {showCancel && (
        <CancelSheet onConfirm={cancelOrder} onClose={() => setShowCancel(false)} confirming={cancelling} />
      )}

      {/* ETA HERO */}
      <div className="dot-texture" style={{ padding: '52px 18px 22px', background: isDelivered ? 'linear-gradient(180deg, #062a16, #0C0B09)' : needsAttention || isCancelled ? 'linear-gradient(180deg, #2A0A0A, #0C0B09)' : isScheduledPending ? 'linear-gradient(180deg, #1A1500, #0C0B09)' : 'linear-gradient(180deg, #1A1917, #0C0B09)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <button onClick={() => router.push('/orders')} className="press" style={{ background: 'var(--bg-2, #26241F)', color: 'white', fontWeight: 700, fontSize: 12, padding: '6px 10px 6px 8px', borderRadius: 8, border: '1px solid var(--line, #2A2825)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontFamily: 'inherit' }}>
            <ChevronLeft size={14} /> Orders
          </button>
          <span className="font-mono" style={{ color: accent, fontWeight: 700, fontSize: 11, letterSpacing: '0.16em' }}>{order.order_ref}</span>
        </div>

        {isDelivered ? (
          <>
            <p className="label-cap" style={{ color: 'var(--ok, #1DB954)', margin: 0, fontSize: 10 }}>Delivered</p>
            <h1 className="font-display" style={{ fontSize: 32, margin: '4px 0 0', color: 'white', lineHeight: 1.05 }}>Enjoy your meal!</h1>
          </>
        ) : isCancelled ? (
          <>
            <p className="label-cap" style={{ color: 'var(--danger, #FF3B30)', margin: 0, fontSize: 10 }}>Cancelled</p>
            <h1 className="font-display" style={{ fontSize: 28, margin: '4px 0 0', color: 'white', lineHeight: 1.05 }}>This order was cancelled</h1>
          </>
        ) : needsAttention ? (
          <>
            <p className="label-cap" style={{ color: 'var(--warn, #FFB800)', margin: 0, fontSize: 10 }}>Please wait</p>
            <h1 className="font-display" style={{ fontSize: 24, margin: '4px 0 6px', color: 'white', lineHeight: 1.05 }}>Finding your runner</h1>
            <p style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: 0 }}>We&apos;ll be in touch shortly.</p>
          </>
        ) : isScheduledPending ? (
          <>
            <p className="label-cap" style={{ color: 'var(--warn, #FFB800)', margin: 0, fontSize: 10 }}>{(order as Order & { is_pre_order?: boolean }).is_pre_order ? 'Pre-order' : 'Scheduled'}</p>
            <h1 className="font-display" style={{ fontSize: 30, margin: '4px 0 6px', color: 'white', lineHeight: 1.05 }}>
              {(order as Order & { is_pre_order?: boolean }).is_pre_order ? `Ready at ${scheduledTimeLabel}` : `Arriving at ${scheduledTimeLabel}`}
            </h1>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="font-display" style={{ fontSize: 46, color: 'var(--warn, #FFB800)', lineHeight: 1 }}>
                {minsUntilScheduled < 60
                  ? `${minsUntilScheduled}m`
                  : `${Math.floor(minsUntilScheduled / 60)}h ${minsUntilScheduled % 60}m`}
              </span>
              <span className="font-display" style={{ fontSize: 16, color: 'white' }}>{(order as Order & { is_pre_order?: boolean }).is_pre_order ? 'until ready' : 'until order starts'}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '6px 0 0' }}>
              {(order as Order & { is_pre_order?: boolean }).is_pre_order ? 'Skip the line' : 'Payment confirmed'} {restaurant ? <>· <b style={{ color: 'white', fontWeight: 800 }}>{restaurant.name}</b></> : null}
            </p>
          </>
        ) : (
          <>
            <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: 0, fontSize: 10 }}>
              {eta?.label ?? (awaitingRunner ? 'Searching' : 'Arrives in')}
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              {awaitingRunner ? (
                <span className="font-display" style={{ fontSize: 28, color: 'white' }}>Finding a runner…</span>
              ) : (
                <>
                  {eta?.isRough && <span className="font-display" style={{ fontSize: 16, color: 'var(--ink-3, #6B6660)', marginRight: 2 }}>est.</span>}
                  <span className="font-display" style={{ fontSize: 54, color: 'var(--accent, #FF6B2B)', lineHeight: 1 }}>~{eta?.remainingMin ?? '—'}</span>
                  <span className="font-display" style={{ fontSize: 18, color: 'white' }}>min</span>
                </>
              )}
              {!awaitingRunner && !eta?.isRough && ((eta?.remainingMin ?? 1) > 0
                ? <span className="pill pill-ok" style={{ marginLeft: 'auto' }}><span className="dot" />ON TIME</span>
                : <span className="pill pill-warn" style={{ marginLeft: 'auto' }}>RUNNING LATE</span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '6px 0 0' }}>
              {statusLabel(order.status)}{restaurant ? <> · <b style={{ color: 'white', fontWeight: 800 }}>{restaurant.name}</b></> : null}
            </p>
          </>
        )}

        {!isCancelled && !needsAttention && (
          <div style={{ marginTop: 22 }}>
            <ProgressBar step={step} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9.5, fontWeight: 700 }}>
              {MILESTONES.map((m, i) => (
                <span key={m} style={{ color: i <= step ? (i === step && !isDelivered ? (isScheduledPending ? 'var(--warn, #FFB800)' : 'var(--accent, #FF6B2B)') : 'white') : 'var(--ink-3, #6B6660)' }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* BODY */}
      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isDelivered && showRating && (
          <RatingPrompt orderId={id} onDone={() => { setShowRating(false); setAlreadyRated(true) }} />
        )}

        {deliveryCode && !isDelivered && !isCancelled && ['runner_assigned', 'picked_up', 'preparing'].includes(order.status) && (
          <DeliveryCodeCard code={deliveryCode} />
        )}

        {/* ── SCHEDULED ORDER INFO CARD ── */}
        {isScheduledPending && (
          <div style={{ background: 'rgba(255,184,0,0.07)', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 16, padding: '16px 16px 14px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,184,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{'⏰'}</div>
              <div>
                <p style={{ fontWeight: 800, fontSize: 14, color: 'var(--warn, #FFB800)', margin: 0 }}>Scheduled delivery</p>
                <p style={{ fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 500, margin: '4px 0 0', lineHeight: 1.5 }}>
                  Your food will be ordered at <b style={{ color: 'white' }}>{scheduledTimeLabel}</b>.
                  Your runner will be assigned ~30 minutes before then.
                </p>
                {minsUntilScheduled > 0 && (
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn, #FFB800)', margin: '8px 0 0' }}>
                    {minsUntilScheduled < 60
                      ? `${minsUntilScheduled} minutes to go`
                      : `${Math.floor(minsUntilScheduled / 60)}h ${minsUntilScheduled % 60}m to go`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {needsAttention && (
          <div style={{ background: 'rgba(255,184,0,0.07)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} color="#FFB800" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 800, fontSize: 14, color: 'var(--warn, #FFB800)', margin: 0 }}>Your payment is confirmed</p>
                <p style={{ fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 500, margin: '2px 0 0', lineHeight: 1.4 }}>
                  All runners are busy right now. We&apos;ll assign one as soon as they&apos;re free &mdash; usually a few minutes.
                </p>
              </div>
            </div>
            <a
              href={`https://wa.me/2348000000000?text=${encodeURIComponent(`Hi, my order ${order.order_ref || orderId} needs runner assignment. Can you help?`)}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', marginTop: 12, padding: '10px 12px', background: 'rgba(29,185,84,0.1)', border: '1px solid rgba(29,185,84,0.25)', borderRadius: 10, fontSize: 12, fontWeight: 800, color: 'var(--ok, #1DB954)', textAlign: 'center', textDecoration: 'none' }}
            >
              💬  Message support on WhatsApp
            </a>
          </div>
        )}

        {isCancelled && (
          <div style={{ background: '#1A0A0A', borderRadius: 16, padding: 20, border: '1px solid #2A1010', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>😔</div>
            <p style={{ fontWeight: 800, fontSize: 16, color: 'var(--danger, #FF3B30)', margin: '0 0 6px' }}>Order cancelled</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: 0 }}>
              {(order as Order & { cancelled_by?: string }).cancelled_by === 'runner'
                ? 'Your runner cancelled this order. A refund will be processed.'
                : 'You cancelled this order.'}
            </p>
          </div>
        )}

        {/* Runner card */}
        {runner && ['runner_assigned', 'preparing', 'picked_up'].includes(order.status) && (
          <div style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'repeating-linear-gradient(45deg, #FF6B2B 0 5px, #E55A1F 5px 10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="font-display" style={{ color: 'white', fontSize: 14 }}>{monogram(runner.full_name)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>{runner.full_name}</p>
                <p style={{ fontSize: 11, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Star size={11} fill="#FFB800" color="#FFB800" /> 4.9 · Your runner
                </p>
              </div>
              <span className="font-mono" style={{ color: 'var(--ok, #1DB954)', fontWeight: 700, fontSize: 9, letterSpacing: '0.14em' }}>● LIVE</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {/* ✅ FIXED: Message button now opens native SMS app */}
              <a
                href={`sms:${runner.phone}`}
                className="press"
                aria-label={`Send SMS to ${runner.full_name}`}
                style={{ flex: 1, background: 'var(--bg-2, #26241F)', color: 'white', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 12, border: '1px solid var(--line, #2A2825)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
              >
                <MessageCircle size={15} /> Message
              </a>
              <a
                href={`tel:${runner.phone}`}
                className="press"
                aria-label={`Call ${runner.full_name}`}
                style={{ flex: 1, background: 'var(--ok, #1DB954)', color: 'white', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 12, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
              >
                <Phone size={15} /> Call
              </a>
            </div>
          </div>
        )}

        {awaitingRunner && (
          <div style={{ background: 'var(--warn-dim, #1A1600)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 16, padding: '14px 16px' }}>
            <p className="label-cap" style={{ color: 'var(--warn, #FFB800)', margin: 0, fontSize: 10 }}>Searching</p>
            <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: '4px 0 0' }}>Looking for a runner near you</p>
            <p style={{ fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 500, margin: '4px 0 0', lineHeight: 1.4 }}>
              Usually takes less than 5 minutes. You&apos;ll get a notification when matched.
            </p>
          </div>
        )}

        <div style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: '14px 16px' }}>
          <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: 0, fontSize: 10 }}>Dropping at</p>
          <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: '4px 0 0', lineHeight: 1.4 }}>{order.delivery_address}</p>
          <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '6px 0 0' }}>Add a note for the runner →</p>
        </div>

        <div style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>From {restaurant?.name ?? 'restaurant'}</p>
            <span className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10 }}>{order.items?.length ?? 0} ITEMS</span>
          </div>
          {order.items?.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, padding: '4px 0' }}>
              <span>{item.name} ×{item.quantity}</span>
              <span>₦{(item.price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line, #2A2825)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: 'white' }}>Total paid</span>
            <span className="font-display" style={{ fontSize: 16, color: 'var(--accent, #FF6B2B)' }}>
              ₦{((order.food_total || 0) + (order.delivery_fee || 0)).toLocaleString()}
            </span>
          </div>
        </div>

        {canCancel && !isCancelled && (
          <button onClick={() => setShowCancel(true)} style={{ width: '100%', background: 'transparent', color: 'rgba(255,255,255,0.35)', fontWeight: 700, fontSize: 14, padding: '14px', borderRadius: 14, border: '1.5px solid var(--line, #2A2825)', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
            Cancel order
          </button>
        )}

        {isPickedUp && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
            🛵 Your runner has the food — cancellation is no longer possible
          </p>
        )}

        {isDelivered && (
          <>
            <button onClick={() => router.push('/home')} className="press" style={{ width: '100%', background: 'var(--ok, #1DB954)', color: 'white', fontWeight: 800, fontSize: 14, padding: 16, borderRadius: 16, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Order again 🍽️
            </button>
            <button onClick={() => router.push(`/receipt/${id}`)} style={{ width: '100%', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 14, padding: '12px', borderRadius: 14, border: '1px solid var(--line, #2A2825)', cursor: 'pointer', fontFamily: 'inherit' }}>
              View receipt 🧾
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ProgressBar({ step }: { step: number }) {
  const percent = (step / 3) * 100
  return (
    <div style={{ position: 'relative', height: 4, background: 'var(--bg-2, #26241F)', borderRadius: 2 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${percent}%`, borderRadius: 2, background: 'linear-gradient(to right, var(--ok, #1DB954), var(--accent, #FF6B2B))', transition: 'width 0.4s ease' }} />
      {[0, 1, 2, 3].map(i => {
        const at = (i / 3) * 100
        const done = i < step; const active = i === step
        const x = i === 0 ? 0 : i === 3 ? -10 : -5
        return (
          <span key={i} style={{ position: 'absolute', left: `${at}%`, top: active ? -6 : -3, transform: `translateX(${x}px)`, width: active ? 16 : 10, height: active ? 16 : 10, borderRadius: '50%', background: done ? 'var(--ok, #1DB954)' : active ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', border: active ? '3px solid var(--bg-0, #0C0B09)' : 'none', transition: 'all 0.3s ease' }} />
        )
      })}
    </div>
  )
}

function TrackingSkeleton() {
  return (
    <div className="mobile-container">
      <div style={{ padding: '56px 16px 24px', background: 'var(--bg-1, #1A1917)' }}>
        <div style={{ height: 12, width: 80, background: 'var(--bg-2, #26241F)', borderRadius: 6 }} />
        <div style={{ height: 48, width: '60%', background: 'var(--bg-2, #26241F)', borderRadius: 12, marginTop: 10 }} />
        <div style={{ height: 4, width: '100%', background: 'var(--bg-2, #26241F)', borderRadius: 2, marginTop: 22 }} />
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => <div key={i} style={{ height: 80, background: 'var(--bg-1, #1A1917)', borderRadius: 16 }} />)}
      </div>
    </div>
  )
}
