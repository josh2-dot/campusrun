'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RUNNER_CANCEL_REASONS } from '@/lib/cancel-reasons'
import type { Order } from '@/types'
import { OrderItemList } from '@/components/ui/OrderItemList'

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

export default function RunnerOrderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [codeErrorMsg, setCodeErrorMsg] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
  const fetchOrder = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, restaurant:restaurants(name, location), customer:users!customer_id(full_name, phone)')
      .eq('id', id)
      .single()
    if (data) { setOrder(data); setLoading(false) }
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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F5F5F0', fontSize: 40 }}>🛵</div>
  if (!order) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)', minHeight: '100vh', background: '#F5F5F0' }}>Order not found</div>

  const customer = order.customer as { full_name: string; phone: string } | null
  const restaurant = order.restaurant as { name: string; location: string } | null
  const transferRef    = (order as Order & { transfer_ref?: string; transfer_amount?: number; transferred_at?: string }).transfer_ref
  const transferAmount = (order as Order & { transfer_ref?: string; transfer_amount?: number; transferred_at?: string }).transfer_amount
  const transferredAt  = (order as Order & { transfer_ref?: string; transfer_amount?: number; transferred_at?: string }).transferred_at
  const steps = [
    { status: 'runner_assigned', label: 'Head to restaurant', sub: restaurant?.name ?? '', icon: '🏪' },
    { status: 'picked_up', label: 'Pick up the food', sub: 'Tap below when you have it', icon: '📦' },
    { status: 'delivered', label: 'Deliver to customer', sub: customer?.full_name ?? '', icon: '🏁' },
  ]
  const STATUS_ORDER = ['runner_assigned', 'picked_up', 'delivered']
  const currentIdx = STATUS_ORDER.indexOf(order.status)
  const canCancel = order.status === 'runner_assigned' || order.status === 'preparing'
  const isPickedUp = order.status === 'picked_up'
  const isDelivered = order.status === 'delivered'

  return (
    <div style={S.page}>
      {showCancel && <CancelSheet onConfirm={cancelOrder} onClose={() => setShowCancel(false)} confirming={cancelling} />}
      <div style={S.header}>
        <button onClick={() => router.push('/dashboard')} style={S.backBtn}>←</button>
        <h1 style={S.headerTitle}>Active Delivery</h1>
        <div style={S.refBadge}>{order.order_ref}</div>
        <div style={S.earningsBadge}>
          <p style={{ color: 'white', fontWeight: 900, fontSize: 16, margin: 0 }}>₦300 earnings</p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, margin: '2px 0 0' }}>Paid on delivery</p>
        </div>
      </div>
      <div style={S.body}>
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
              <a
                href={`sms:${customer.phone}`}
                className="press"
                aria-label={`Message ${customer.full_name}`}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
              >
                💬 Message
              </a>
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