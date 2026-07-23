'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RUNNER_CANCEL_REASONS } from '@/lib/cancel-reasons'
import type { Order } from '@/types'
import { OrderItemList } from '@/components/ui/OrderItemList'
import { OrderChat } from '@/components/ui/OrderChat'
import { CHAT_OPEN_STATUSES } from '@/lib/messaging'

const S = {
page: { maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' as const },
  header: { background: '#0C0B09', padding: '56px 20px 20px' },
  backBtn: { color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 0, marginBottom: 8, display: 'block' },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 900, margin: '0 0 4px', fontFamily: "'Syne', sans-serif" },
  refBadge: { display: 'inline-block', background: 'rgba(255,107,43,0.2)', borderRadius: 8, padding: '3px 10px', color: '#FF6B2B', fontSize: 12, fontWeight: 800 },
  earningsBadge: { background: '#1DB954', borderRadius: 10, padding: '10px 14px', marginTop: 12, display: 'inline-block' },
  body: { flex: 1, overflowY: 'auto' as const, padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 12 },
card: { background: '#1A1917', borderRadius: 16, padding: 16, border: '1px solid #2A2825' },
  cardTitle: { fontWeight: 800, fontSize: 14, margin: '0 0 12px', color: 'white'},
  stepDot: (state: 'done' | 'active' | 'pending') => ({ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0, background: state === 'done' ? '#1DB954' : state === 'active' ? '#FF6B2B' : '#2A2825', color: state === 'pending' ? '#bbb' : 'white' }),
  stepLine: (done: boolean) => ({ width: 2, height: 28, margin: '4px 0', background: done ? '#1DB954' : '#2A2825' }),
  avatarCircle: { width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,107,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 },
callBtn: { background: 'rgba(29,185,84,0.15)', color: '#1DB954', width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' },
codeInputWrap: { display: 'flex', gap: 10, justifyContent: 'center', margin: '16px 0' },
codeDigit: (filled: boolean, error: boolean) => ({ width: 56, height: 64, borderRadius: 14, border: `2px solid ${error ? '#FF3B30' : filled ? '#FF6B2B' : '#2A2825'}`, fontSize: 28, fontWeight: 900, textAlign: 'center' as const, color: 'white', background: error ? 'rgba(255,59,48,0.15)' : filled ? 'rgba(255,107,43,0.15)' : '#0C0B09', outline: 'none', fontFamily: "'Nunito', sans-serif", transition: 'border-color 0.15s, background 0.15s' }),
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end', maxWidth: 430, margin: '0 auto' },
sheet: { background: '#1A1917', borderRadius: '24px 24px 0 0', padding: '24px 20px 36px' },
sheetTitle: { fontWeight: 900, fontSize: 18, margin: '0 0 4px', color: 'white' },
sheetSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, margin: '0 0 20px' },
reasonBtn: (selected: boolean) => ({ width: '100%', background: selected ? 'rgba(255,107,43,0.15)' : '#0C0B09', border: `2px solid ${selected ? '#FF6B2B' : '#2A2825'}`, borderRadius: 14, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left' as const, fontFamily: "'Nunito', sans-serif" }),
reasonEmoji: { fontSize: 20, flexShrink: 0 },
reasonLabel: (selected: boolean) => ({ fontSize: 14, fontWeight: 700, color: selected ? '#FF6B2B' : 'rgba(255,255,255,0.8)' }),
btnPrimary: (color: string, disabled?: boolean) => ({ width: '100%', background: disabled ? '#333' : color, color: 'white', fontWeight: 900, fontSize: 17, padding: 16, borderRadius: 16, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', system-ui, sans-serif", opacity: disabled ? 0.7 : 1, transition: 'opacity 0.15s' }),
btnGhost: { width: '100%', background: 'transparent', color: '#FF3B30', fontWeight: 700, fontSize: 14, padding: '12px', borderRadius: 14, border: '1.5px solid rgba(255,59,48,0.3)', cursor: 'pointer', fontFamily: "'Nunito', system-ui, sans-serif", marginTop: 8 },
successBox: { background: 'rgba(29,185,84,0.1)', borderRadius: 16, padding: 24, textAlign: 'center' as const, border: '1px solid rgba(29,185,84,0.3)' },
}

function CodeInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: boolean }) {
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs[i - 1].current?.focus()
      onChange(value.slice(0, i - 1))
    }
  }

  function handleChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const char = e.target.value.replace(/\D/g, '').slice(-1)
    const next = value.slice(0, i) + char + value.slice(i + 1)
    onChange(next.slice(0, 4))
    if (char && i < 3) refs[i + 1].current?.focus()
  }

  return (
    <div style={S.codeInputWrap}>
      {[0, 1, 2, 3].map(i => (
        <input key={i} ref={refs[i]} type="tel" inputMode="numeric" maxLength={1} value={value[i] ?? ''} onChange={e => handleChange(i, e)} onKeyDown={e => handleKey(i, e)} style={S.codeDigit(!!value[i], error)} />
      ))}
    </div>
  )
}

function CancelSheet({ onConfirm, onClose, confirming }: { onConfirm: (reason: string) => void; onClose: () => void; confirming: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div style={S.overlay}>
      <div style={S.sheet}>
        <p style={S.sheetTitle}>Cancel this order?</p>
        <p style={S.sheetSub}>Select a reason — this helps us improve</p>
        {RUNNER_CANCEL_REASONS.map(r => (
          <button key={r.key} style={S.reasonBtn(selected === r.key)} onClick={() => setSelected(r.key)}>
            <span style={S.reasonEmoji}>{r.emoji}</span>
            <span style={S.reasonLabel(selected === r.key)}>{r.label}</span>
          </button>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button style={{ flex: 1, background: '#F5F5F0', color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 15, padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }} onClick={onClose} disabled={confirming}>Go back</button>
          <button style={{ flex: 1, background: selected ? '#FF3B30' : '#E8E8E0', color: selected ? 'white' : '#aaa', fontWeight: 900, fontSize: 15, padding: '14px', borderRadius: 14, border: 'none', cursor: selected ? 'pointer' : 'not-allowed', fontFamily: "'Nunito', sans-serif", opacity: confirming ? 0.7 : 1 }} onClick={() => selected && onConfirm(selected)} disabled={!selected || confirming}>
            {confirming ? 'Cancelling...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── RefundSheet (runner-funded direct-pay) ─────────────── */
function RefundSheet({ onConfirm, onClose, refunding }: {
  onConfirm: (reason: string) => void; onClose: () => void; refunding: boolean
}) {
  const [reason, setReason] = useState<string | null>(null)
  const REASONS = [
    { key: 'restaurant_closed',  emoji: '🚫', label: 'Restaurant is closed' },
    { key: 'item_unavailable',   emoji: '❌', label: "Item isn't available" },
    { key: 'restaurant_refused', emoji: '🙅', label: 'Restaurant refused to sell' },
    { key: 'other',              emoji: '⚠️', label: 'Something else' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', fontFamily: "'Nunito', sans-serif" }} onClick={onClose}>
      <div style={{ background: '#1A1917', width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '20px 20px 32px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#2A2825', borderRadius: 2, margin: '0 auto 16px' }} />
        <p style={{ color: '#FF3B30', margin: 0, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cancel & refund</p>
        <h2 className="font-display" style={{ fontSize: 22, margin: '2px 0 4px', color: 'white' }}>What happened?</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, margin: '0 0 16px', lineHeight: 1.5 }}>
          Send the customer&apos;s money back to them from your bank app, then confirm here. The order will be cancelled and you won&apos;t owe CampusRun anything for it.
        </p>
        {REASONS.map(r => (
          <button
            key={r.key}
            onClick={() => setReason(r.key)}
            style={{ width: '100%', background: reason === r.key ? 'rgba(255,59,48,0.15)' : '#0C0B09', border: `2px solid ${reason === r.key ? '#FF3B30' : '#2A2825'}`, borderRadius: 14, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minHeight: 56 }}
          >
            <span style={{ fontSize: 20 }}>{r.emoji}</span>
            <span style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>{r.label}</span>
          </button>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} className="press" style={{ flex: 1, background: 'transparent', border: '1px solid #2A2825', color: 'white', fontWeight: 800, fontSize: 14, padding: 14, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48 }}>
            Never mind
          </button>
          <button
            onClick={() => reason && onConfirm(reason)}
            disabled={!reason || refunding}
            className="press"
            style={{ flex: 1, background: reason && !refunding ? '#FF3B30' : '#2A2825', color: 'white', fontWeight: 800, fontSize: 14, padding: 14, borderRadius: 12, border: 'none', cursor: reason && !refunding ? 'pointer' : 'not-allowed', fontFamily: 'inherit', minHeight: 48 }}
          >
            {refunding ? 'Confirming\u2026' : "I've sent the refund"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RunnerOrderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showRefund, setShowRefund] = useState(false)
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [chatOpen,   setChatOpen]   = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [cancelling, setCancelling] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [codeErrorMsg, setCodeErrorMsg] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Subscribe to messages for unread badge
  useEffect(() => {
    if (!order?.id) return
    const channel = supabase
      .channel(`order-msg-${order.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${order.id}` },
        (payload) => {
          const m = payload.new as { sender_role?: string }
          if (m.sender_role === 'customer' && !chatOpen) {
            setUnreadCount(c => c + 1)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [order?.id, chatOpen])

  useEffect(() => {
  const fetchOrder = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, restaurant:restaurants(name, location), customer:users!customer_id(full_name, phone)')
      .eq('id', id)
      .maybeSingle()
    if (error) {
      console.error('[order] fetch failed:', error.message)
      setLoading(false)
      return
    }
    if (data) { setOrder(data); setLoading(false) }
    else { setLoading(false) }
  }

  fetchOrder()

  const channel = supabase
    .channel('runner-order-' + id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
      () => fetchOrder())
    .subscribe()

  const poll = setInterval(fetchOrder, 5000)

  return () => {
    supabase.removeChannel(channel)
    clearInterval(poll)
  }
}, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function markPickedUp() {
    setUpdating(true)
    const res = await fetch('/api/runner/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id, status: 'picked_up' }) })
    const { success, error } = await res.json()
    if (!success) alert(error || 'Failed to update')
    setUpdating(false)
  }

  async function confirmDelivery() {
    if (code.length !== 4) return
    setConfirming(true)
    setCodeError(false)
    const res = await fetch('/api/runner/confirm-delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id, code }) })
    const { success, error } = await res.json()
    if (success) { router.push('/dashboard') } else { setCodeError(true); setCodeErrorMsg(error ?? 'Wrong code, try again'); setCode('') }
    setConfirming(false)
  }

  async function cancelOrder(reason: string) {
    setCancelling(true)
    const res = await fetch('/api/runner/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: id, reason }) })
    const { success, error } = await res.json()
    setCancelling(false)
    setShowCancel(false)
    if (success) { router.push('/dashboard') } else { alert(error || 'Could not cancel order') }
  }

  // Runner-funded direct-pay: tap when bank alert lands.
  async function confirmPayment() {
    if (confirmingPayment) return
    setConfirmingPayment(true)
    const res = await fetch('/api/runner/confirm-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: id }),
    })
    const { success, error } = await res.json()
    setConfirmingPayment(false)
    if (!success) alert(error || "Couldn't confirm — try again.")
    router.refresh()
  }

  async function sendRefund(reason: string) {
    if (refunding) return
    setRefunding(true)
    const res = await fetch('/api/runner/return-funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: id, reason }),
    })
    const { success, error } = await res.json()
    setRefunding(false)
    setShowRefund(false)
    if (success) { router.push('/dashboard') } else { alert(error || 'Refund confirmation failed') }
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F5F5F0', fontSize: 40 }}>🛵</div>
  if (!order) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)', minHeight: '100vh', background: '#F5F5F0' }}>Order not found</div>

  const customer = order.customer as { full_name: string; phone: string } | null
  const restaurant = order.restaurant as { name: string; location: string } | null
  const transferRef    = (order as Order & { transfer_ref?: string; transfer_amount?: number; transferred_at?: string }).transfer_ref
  const transferAmount = (order as Order & { transfer_ref?: string; transfer_amount?: number; transferred_at?: string }).transfer_amount
  const transferredAt  = (order as Order & { transfer_ref?: string; transfer_amount?: number; transferred_at?: string }).transferred_at

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderX = order as any
  const isRunnerFunded = orderX.payment_model === 'runner_funded'
  const isRfAwaitingPayment    = orderX.status === 'runner_funded_awaiting_payment'
  const isRfPaymentConfirmed   = orderX.status === 'runner_funded_payment_confirmed'
  const rfExpectedAmount   = orderX.runner_funded_payment_expected_amount as number | undefined
  const rfPaymentDeadline  = orderX.runner_funded_payment_deadline as string | undefined
  const platformOwed       = orderX.platform_owed_amount ?? 0

  const steps = isRunnerFunded ? [
    { status: 'runner_funded_awaiting_payment',  label: 'Wait for customer payment', sub: 'Check your bank alert', icon: '\uD83D\uDCB8' },
    { status: 'runner_funded_payment_confirmed', label: 'Buy from restaurant', sub: restaurant?.name ?? '', icon: '\uD83C\uDFEA' },
    { status: 'picked_up', label: 'Head to customer', sub: 'Tap below once you have the food', icon: '\uD83D\uDCE6' },
    { status: 'delivered', label: 'Deliver to customer', sub: customer?.full_name ?? '', icon: '\uD83C\uDFC1' },
  ] : [
    { status: 'runner_assigned', label: 'Head to restaurant', sub: restaurant?.name ?? '', icon: '\uD83C\uDFEA' },
    { status: 'picked_up', label: 'Pick up the food', sub: 'Tap below when you have it', icon: '\uD83D\uDCE6' },
    { status: 'delivered', label: 'Deliver to customer', sub: customer?.full_name ?? '', icon: '\uD83C\uDFC1' },
  ]
  const STATUS_ORDER = isRunnerFunded
    ? ['runner_funded_awaiting_payment', 'runner_funded_payment_confirmed', 'picked_up', 'delivered']
    : ['runner_assigned', 'picked_up', 'delivered']
  const currentIdx = STATUS_ORDER.indexOf(order.status)
  const canCancel = order.status === 'runner_assigned' || order.status === 'preparing'
  const isPickedUp = order.status === 'picked_up'
  const isDelivered = order.status === 'delivered'

  return (
    <div style={S.page}>
      {showCancel && <CancelSheet onConfirm={cancelOrder} onClose={() => setShowCancel(false)} confirming={cancelling} />}
      {showRefund && <RefundSheet onConfirm={sendRefund} onClose={() => setShowRefund(false)} refunding={refunding} />}
      {chatOpen && order && customer && (
        <OrderChat
          orderId={order.id}
          myRole="runner"
          otherName={customer.full_name}
          orderRef={order.order_ref ?? undefined}
          isOpen={CHAT_OPEN_STATUSES.includes(order.status as typeof CHAT_OPEN_STATUSES[number])}
          onClose={() => setChatOpen(false)}
        />
      )}
      <div style={S.header}>
        <button onClick={() => router.push('/dashboard')} style={S.backBtn}>←</button>
        <h1 style={S.headerTitle}>Active Delivery</h1>
        <div style={S.refBadge}>{order.order_ref}</div>
        {isRunnerFunded ? (
          <div style={{ background: '#CC9400', borderRadius: 10, padding: '10px 14px', display: 'inline-block' }}>
            <p style={{ color: 'white', fontWeight: 900, fontSize: 15, margin: 0 }}>
              Customer sending ₦{(rfExpectedAmount ?? 0).toLocaleString()}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600, margin: '2px 0 0' }}>
              Straight to your bank · owe ₦{platformOwed.toLocaleString()} to CampusRun
            </p>
          </div>
        ) : (
          <div style={S.earningsBadge}>
            <p style={{ color: 'white', fontWeight: 900, fontSize: 16, margin: 0 }}>₦300 earnings</p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, margin: '2px 0 0' }}>Paid on delivery</p>
          </div>
        )}
      </div>
      <div style={S.body}>
        {/* ══ RUNNER-FUNDED DIRECT-PAY CARD ══ */}
        {isRunnerFunded && !isDelivered && (isRfAwaitingPayment || isRfPaymentConfirmed) && (
          <div style={{
            background: isRfAwaitingPayment ? 'linear-gradient(135deg, #2A1F00, #332600)' : 'linear-gradient(135deg, #0D2A1A, #0F3320)',
            border: `1px solid ${isRfAwaitingPayment ? 'rgba(255,184,0,0.35)' : 'rgba(29,185,84,0.35)'}`,
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: isRfAwaitingPayment ? 'rgba(255,184,0,0.15)' : 'rgba(29,185,84,0.15)', border: `1px solid ${isRfAwaitingPayment ? 'rgba(255,184,0,0.3)' : 'rgba(29,185,84,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                {isRfAwaitingPayment ? '⏳' : '✓'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: isRfAwaitingPayment ? '#FFB800' : '#1DB954', margin: 0, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {isRfAwaitingPayment ? 'Waiting for payment' : 'Payment confirmed'}
                </p>
                <p style={{ color: 'white', fontWeight: 800, fontSize: 14, margin: '2px 0 0' }}>
                  {isRfAwaitingPayment ? 'Check your bank alerts' : `Head to ${restaurant?.name ?? 'the restaurant'}`}
                </p>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>Customer sending</span>
                <span style={{ color: 'white', fontSize: 14, fontWeight: 800, fontFamily: 'monospace' }}>₦{(rfExpectedAmount ?? 0).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 8, borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>You spend on food</span>
                <span style={{ color: 'white', fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>₦{(order.food_total ?? 0).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>Your earnings</span>
                <span style={{ color: '#1DB954', fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>₦{(order.runner_earnings ?? 300).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                <span style={{ color: 'white', fontSize: 13, fontWeight: 800 }}>You owe CampusRun</span>
                <span style={{ color: '#FFB800', fontSize: 15, fontWeight: 900, fontFamily: 'monospace' }}>₦{platformOwed.toLocaleString()}</span>
              </div>
            </div>

            {isRfAwaitingPayment && rfPaymentDeadline && (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(0,0,0,0.35)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700 }}>Auto-cancels if no payment by</span>
                <span style={{ color: 'white', fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>
                  {new Date(rfPaymentDeadline).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            {isRfAwaitingPayment && (
              <button
                onClick={confirmPayment}
                disabled={confirmingPayment}
                className="press"
                style={{ width: '100%', marginTop: 14, background: confirmingPayment ? '#0D7A38' : '#1DB954', color: 'white', fontWeight: 900, fontSize: 15, padding: 16, borderRadius: 14, border: 'none', cursor: confirmingPayment ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: confirmingPayment ? 0.7 : 1, minHeight: 52 }}
              >
                {confirmingPayment ? 'Confirming\u2026' : '\u2713 I received the payment'}
              </button>
            )}

            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, margin: '12px 0 0', lineHeight: 1.5 }}>
              {isRfAwaitingPayment
                ? 'Only tap when your bank actually alerts you.'
                : `Buy the food and head over. If the restaurant overcharges, don't eat the loss — message admin.`}
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <a
                href={`https://wa.me/${process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ?? '2348068404839'}?text=${encodeURIComponent(`Order ${order.order_ref} — `)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="press"
                style={{ flex: 1, background: 'rgba(29,185,84,0.15)', color: '#1DB954', fontWeight: 800, fontSize: 13, padding: '12px', borderRadius: 12, border: '1px solid rgba(29,185,84,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', minHeight: 44 }}
              >
                💬 Message admin
              </a>
              {isRfPaymentConfirmed && (
                <button
                  onClick={() => setShowRefund(true)}
                  className="press"
                  style={{ flex: 1, background: 'rgba(255,59,48,0.1)', color: '#FF3B30', fontWeight: 800, fontSize: 13, padding: '12px', borderRadius: 12, border: '1px solid rgba(255,59,48,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}
                >
                  ↩ Refund
                </button>
              )}
            </div>
          </div>
        )}
        
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={S.avatarCircle}>👤</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>{customer?.full_name}</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: '2px 0 0' }}>📍 {order.delivery_address}</p>
            </div>
          </div>
          {customer?.phone && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => { setChatOpen(true); setUnreadCount(0) }}
                className="press"
                aria-label={`Message ${customer.full_name}`}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit', position: 'relative' }}
              >
                Message
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, background: '#FF3B30', color: 'white', fontSize: 10, fontWeight: 900, borderRadius: 999, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{unreadCount}</span>
                )}
              </button>
              <a
                href={`tel:${customer.phone}`}
                className="press"
                aria-label={`Call ${customer.full_name}`}
                style={{ flex: 1, background: '#1DB954', color: 'white', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 12, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
              >
                📞 Call
              </a>
            </div>
          )}
        </div>
        {transferRef && (
          <div style={{
            background: 'linear-gradient(135deg, #0D2A1A, #0F3320)',
            border: '1px solid rgba(29,185,84,0.3)',
            borderRadius: 16,
            padding: 16,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14
            }}>
              <div>
                <p style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 2,
                  color: 'rgba(29,185,84,0.7)',
                  margin: 0,
                  textTransform: 'uppercase'
                }}>
                  Payment Proof
                </p>

                <p style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color: 'white',
                  margin: '3px 0 0',
                  fontFamily: "'Syne', sans-serif"
                }}>
                  Show this to the restaurant
                </p>
              </div>

              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(29,185,84,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: 18 }}>
                  &#10003;
                </span>
              </div>
            </div>

            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 600
              }}>
                Amount transferred
              </span>

              <span style={{
                fontSize: 20,
                fontWeight: 900,
                color: '#1DB954',
                fontFamily: "'Syne', sans-serif"
              }}>
                &#8358;{(transferAmount ?? 0).toLocaleString()}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                flex: 1,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 10,
                padding: '10px 12px'
              }}>
                <p style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.4)',
                  fontWeight: 600,
                  margin: '0 0 3px',
                  textTransform: 'uppercase',
                  letterSpacing: 1
                }}>
                  Reference
                </p>

                <p style={{
                  fontSize: 11,
                  color: 'white',
                  fontWeight: 800,
                  margin: 0,
                  fontFamily: 'monospace',
                  letterSpacing: 0.5
                }}>
                  {transferRef}
                </p>
              </div>

              <div style={{
                flex: 1,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 10,
                padding: '10px 12px'
              }}>
                <p style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.4)',
                  fontWeight: 600,
                  margin: '0 0 3px',
                  textTransform: 'uppercase',
                  letterSpacing: 1
                }}>
                  Time sent
                </p>

                <p style={{
                  fontSize: 11,
                  color: 'white',
                  fontWeight: 800,
                  margin: 0
                }}>
                  {transferredAt
                    ? new Date(transferredAt).toLocaleTimeString('en-NG', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '—'}
                </p>
              </div>
            </div>

            <p style={{
              fontSize: 10,
              color: 'rgba(29,185,84,0.5)',
              fontWeight: 600,
              margin: '12px 0 0',
              textAlign: 'center'
            }}>
              Verified by CampusRun · {restaurant?.name}
            </p>
          </div>
        )}


        <div style={S.card}>
          <p style={S.cardTitle}>Delivery steps</p>
          {steps.map((step, i) => {
            const isDone = currentIdx > i
            const isActive = currentIdx === i
            const state: 'done' | 'active' | 'pending' = isDone ? 'done' : isActive ? 'active' : 'pending'
            return (
              <div key={step.status} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={S.stepDot(state)}>{isDone ? '✓' : step.icon}</div>
                  {i < steps.length - 1 && <div style={S.stepLine(isDone)} />}
                </div>
                <div style={{ paddingTop: 6, opacity: state === 'pending' ? 0.35 : 1, flex: 1, paddingBottom: 8 }}>
                  <p style={{ fontWeight: 800, fontSize: 14, margin: 0 }}>{step.label}</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: '2px 0 0' }}>{step.sub}</p>
                </div>
              </div>
            )
          })}
        </div>
        {/* Food pickup card */}
        {(order.items ?? []).filter((i: { options?: { is_pantry?: boolean } }) => !i.options?.is_pantry).length > 0 && (
          <div style={S.card}>
            <p style={S.cardTitle}>Pickup 1 · From {restaurant?.name}</p>
            <OrderItemList
              items={(order.items ?? []).filter((i: { options?: { is_pantry?: boolean } }) => !i.options?.is_pantry)}
              theme="dark"
              showPrices={true}
            />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)' }}>Pay restaurant</span>
              <span className="font-display" style={{ fontSize: 22, color: '#FF6B2B' }}>₦{(() => {
                const foodItems = (order.items ?? []).filter((i: { options?: { is_pantry?: boolean } }) => !i.options?.is_pantry)
                const total = foodItems.reduce((sum: number, i: { price: number; quantity: number; options?: { portions?: Array<{ price: number; quantity: number }>; addons?: Array<{ price: number; quantity: number; portions?: Array<{ price: number; quantity: number }> }> } }) => {
                  const portions = i.options?.portions
                  const base = (portions && Array.isArray(portions)) ? portions.reduce((s, p) => s + p.price * p.quantity, 0) : i.price * i.quantity
                  const addons = i.options?.addons ?? []
                  const addonTotal = addons.reduce((s, a) => {
                    if (a.portions && a.portions.length) return s + a.portions.reduce((ss, p) => ss + p.price * p.quantity, 0)
                    return s + a.price * a.quantity
                  }, 0)
                  return sum + base + addonTotal
                }, 0)
                return total.toLocaleString()
              })()}</span>
            </div>
          </div>
        )}

        {/* Pantry pickup card */}
        {(order.items ?? []).filter((i: { options?: { is_pantry?: boolean } }) => i.options?.is_pantry).length > 0 && (
          <div style={S.card}>
            <p style={S.cardTitle}>Pickup 2 · Snacks &amp; Drinks (any nearby shop)</p>
            <OrderItemList
              items={(order.items ?? []).filter((i: { options?: { is_pantry?: boolean } }) => i.options?.is_pantry)}
              theme="dark"
              showPrices={true}
            />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)' }}>Pay shop</span>
              <span className="font-display" style={{ fontSize: 22, color: '#FF6B2B' }}>₦{(() => {
                const pantryItems = (order.items ?? []).filter((i: { options?: { is_pantry?: boolean } }) => i.options?.is_pantry)
                const total = pantryItems.reduce((sum: number, i: { price: number; quantity: number }) => sum + i.price * i.quantity, 0)
                return total.toLocaleString()
              })()}</span>
            </div>
          </div>
        )}

        {/* Customer note */}
        {(order as Order & { order_notes?: string }).order_notes && (
          <div style={{ ...S.card, borderColor: 'rgba(255,107,43,0.25)' }}>
            <p style={{ fontWeight: 800, fontSize: 13, color: '#FF6B2B', margin: '0 0 6px' }}>Note from customer</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.6 }}>
              {(order as Order & { order_notes?: string }).order_notes}
            </p>
          </div>
        )}

        {order.status === 'runner_assigned' && (
          <button onClick={markPickedUp} disabled={updating} style={S.btnPrimary('#FF6B2B', updating)}>
            {updating ? 'Updating...' : '📦 I have the food — Mark as Picked Up'}
          </button>
        )}
        {isPickedUp && (
          <div style={S.card}>
            <p style={{ fontWeight: 900, fontSize: 16, margin: '0 0 4px', color: '#111' }}>Enter delivery code</p>
            <p style={{ fontSize: 13, color: '#888', fontWeight: 600, margin: '0 0 4px' }}>Ask the customer for their 4-digit code shown on their tracking page.</p>
            {codeError && <p style={{ fontSize: 13, color: '#FF3B30', fontWeight: 700, margin: '4px 0 0', background: '#FFF5F5', padding: '8px 12px', borderRadius: 10 }}>❌ {codeErrorMsg}</p>}
            <CodeInput value={code} onChange={v => { setCode(v); setCodeError(false) }} error={codeError} />
            <button onClick={confirmDelivery} disabled={code.length !== 4 || confirming} style={S.btnPrimary('#1DB954', code.length !== 4 || confirming)}>
              {confirming ? 'Confirming...' : '✅ Confirm Delivery'}
            </button>
          </div>
        )}
        {isDelivered && (
          <div style={S.successBox}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🎉</div>
            <p style={{ fontWeight: 900, fontSize: 20, color: '#1DB954', margin: '0 0 6px' }}>Delivery complete!</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 600, margin: 0 }}>₦300 added to your wallet</p>
          </div>
        )}
        {canCancel && <button style={S.btnGhost} onClick={() => setShowCancel(true)}>Cancel this order</button>}
      </div>
    </div>
  )
}