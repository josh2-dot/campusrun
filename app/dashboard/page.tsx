'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RainBanner } from '@/components/ui/RainBanner'
import { monogram, fmtDuration } from '@/lib/utils'
import type { Order, RunnerProfile } from '@/types'
import { ArrowUp, Bike, Check, Home, Package, TrendingUp, User, X } from 'lucide-react'

const S = {
  page: {
    maxWidth: 430, margin: '0 auto', minHeight: '100dvh',
    background: '#F7F4EF', color: '#15130F',
    fontFamily: "'Nunito', system-ui, sans-serif",
    display: 'flex', flexDirection: 'column' as const,
  },
  body: { flex: 1, overflowY: 'auto' as const, padding: '0 14px 16px' },
}

function isToday(iso?: string | null) {
  if (!iso) return false
  const d = new Date(iso); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} aria-pressed={on} style={{ width: 52, height: 30, borderRadius: 999, background: on ? '#1DB954' : 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
      <div style={{ position: 'absolute', top: 3, width: 24, height: 24, background: 'white', borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left 0.2s', left: on ? 25 : 3 }} />
    </button>
  )
}

function SuspensionScreen({ profile }: {
  profile: RunnerProfile & { is_suspended?: boolean; suspended_until?: string; strike_count?: number }
}) {
  const router = useRouter()
  const until = profile.suspended_until ? new Date(profile.suspended_until) : null
  const daysLeft = until ? Math.ceil((until.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>{'\uD83D\uDEAB'}</div>
      <h2 style={{ color: '#15130F', fontSize: 22, fontWeight: 900, margin: '0 0 8px', fontFamily: "'Syne', sans-serif" }}>Account Suspended</h2>
      <p style={{ color: '#4A463F', fontSize: 14, fontWeight: 600, margin: '0 0 24px', lineHeight: 1.6 }}>
        You received 3 order cancellations within 30 days.
      </p>
      <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #E0DACE', width: '100%', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ color: '#8B857B', fontSize: 13, fontWeight: 600 }}>Strikes (30 days)</span>
          <span style={{ color: '#B23A2E', fontWeight: 900, fontSize: 14 }}>3 / 3</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#8B857B', fontSize: 13, fontWeight: 600 }}>Suspended for</span>
          <span style={{ color: '#15130F', fontWeight: 900, fontSize: 14 }}>
            {daysLeft > 0 ? `${daysLeft} more day${daysLeft !== 1 ? 's' : ''}` : 'Review pending'}
          </span>
        </div>
      </div>
      <button onClick={() => router.push('/profile')} style={{ background: '#E0DACE', color: '#4A463F', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
        Go to Profile
      </button>
    </div>
  )
}

function IncomingAlert({ order, onAccept, onDecline, accepting }: {
  order: Order; onAccept: () => void; onDecline: () => void; accepting: boolean
}) {
  const TOTAL = 30
  const [seconds, setSeconds] = useState(TOTAL)
  const onDeclineRef = useRef(onDecline)
  useEffect(() => { onDeclineRef.current = onDecline })
  useEffect(() => {
    const t = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(t); onDeclineRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const restaurant = order.restaurant as { name: string } | null
  const C = 56; const r = 24
  const len = 2 * Math.PI * r
  const offset = len * (1 - seconds / TOTAL)

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 430, background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '22px 20px 28px', border: '1px solid #E0DACE', borderBottom: 'none' }}>
        <div style={{ width: 36, height: 4, background: '#E0DACE', borderRadius: 2, margin: '0 auto 18px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 10 }}>New order</p>
            <h2 className="font-display" style={{ fontSize: 22, margin: '2px 0 0', color: '#15130F' }}>
              Earn {'\u20A6'}{(order.runner_earnings || 300).toLocaleString()}
            </h2>
          </div>
          <span className="font-mono" style={{ fontWeight: 700, fontSize: 11, color: '#8B857B' }}>{order.order_ref}</span>
        </div>
        <div style={{ background: '#F7F4EF', border: '1px solid #E0DACE', borderRadius: 14, padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF6B2B' }} />
              <div style={{ width: 2, height: 24, background: '#E0DACE', margin: '4px 0' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1DB954' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="label-cap" style={{ color: '#8B857B', margin: 0, fontSize: 9 }}>Pickup</p>
              <p style={{ fontWeight: 800, fontSize: 13, color: '#15130F', margin: '2px 0 14px' }}>{restaurant?.name ?? 'Restaurant'}</p>
              <p className="label-cap" style={{ color: '#8B857B', margin: 0, fontSize: 9 }}>Drop</p>
              <p style={{ fontWeight: 800, fontSize: 13, color: '#15130F', margin: '2px 0 0', lineHeight: 1.35 }}>{order.delivery_address}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E0DACE', paddingTop: 10, marginTop: 12 }}>
            <p style={{ fontSize: 11, color: '#8B857B', fontWeight: 600, margin: 0 }}>
              {Array.isArray(order.items) ? order.items.length : 0} items
            </p>
            {(order as Order & { scheduled_for?: string }).scheduled_for && (
              <span style={{ background: 'rgba(255,184,0,0.15)', color: '#CC9400', fontWeight: 800, fontSize: 10, padding: '3px 8px', borderRadius: 6, letterSpacing: '0.06em' }}>
                {'\u23F0'} SCHEDULED
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={onDecline} className="press" disabled={accepting} style={{ flex: 1, background: '#F7F4EF', color: '#8B857B', border: '1px solid #E0DACE', fontWeight: 800, fontSize: 14, padding: 16, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <X size={15} /> Decline
          </button>
          <button onClick={onAccept} disabled={accepting} className="press" aria-label={`Accept order in ${seconds} seconds`} style={{ flex: 1, background: accepting ? '#cc5522' : '#FF6B2B', color: 'white', border: 'none', fontWeight: 800, fontSize: 14, padding: 16, borderRadius: 14, cursor: accepting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative', opacity: accepting ? 0.7 : 1 }}>
            <svg width={C} height={C} viewBox={`0 0 ${C} ${C}`} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', opacity: 0.9 }}>
              <circle cx={C / 2} cy={C / 2} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
              <circle cx={C / 2} cy={C / 2} r={r} fill="none" stroke="white" strokeWidth="3" strokeDasharray={len} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${C / 2} ${C / 2})`} style={{ transition: 'stroke-dashoffset 1s linear' }} />
            </svg>
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Check size={15} /> {accepting ? 'Accepting...' : `Accept · ${seconds}s`}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── EarningsView ────────────────────────────────────────── */
function EarningsView({ totalEarned, paidOut, payoutForm, setPayoutForm, onSubmit, submitting, done, hasPending }: {
  totalEarned: number; paidOut: number
  payoutForm: { bankName: string; accountNumber: string; accountName: string }
  setPayoutForm: React.Dispatch<React.SetStateAction<{ bankName: string; accountNumber: string; accountName: string }>>
  onSubmit: () => void; submitting: boolean; done: boolean; hasPending: boolean
}) {
  const N = '\u20A6'
  const unpaid = Math.max(0, totalEarned - paidOut)
  const INPUT: React.CSSProperties = { width: '100%', border: '1.5px solid #E0DACE', borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 600, fontFamily: "'Nunito', sans-serif", outline: 'none', boxSizing: 'border-box', background: '#FAFAF8', color: '#15130F' }

  return (
    <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={{ background: 'white', borderRadius: 14, padding: '14px 14px 12px', border: '1px solid #E0DACE' }}>
          <p className="label-cap" style={{ color: '#8B857B', margin: 0, fontSize: 9 }}>Total earned</p>
          <p className="font-display" style={{ fontSize: 20, color: '#15130F', margin: '4px 0 0', lineHeight: 1 }}>{N}{totalEarned.toLocaleString()}</p>
        </div>
        <div style={{ background: unpaid > 0 ? 'rgba(255,107,43,0.06)' : 'white', borderRadius: 14, padding: '14px 14px 12px', border: unpaid > 0 ? '1px solid rgba(255,107,43,0.25)' : '1px solid #E0DACE' }}>
          <p className="label-cap" style={{ color: '#8B857B', margin: 0, fontSize: 9 }}>Unpaid balance</p>
          <p className="font-display" style={{ fontSize: 20, color: unpaid > 0 ? '#FF6B2B' : '#15130F', margin: '4px 0 0', lineHeight: 1 }}>{N}{unpaid.toLocaleString()}</p>
        </div>
      </div>
      {done ? (
        <div style={{ background: 'white', borderRadius: 16, padding: 24, textAlign: 'center', border: '1px solid rgba(29,185,84,0.2)' }}>
          <p style={{ fontSize: 40, margin: '0 0 10px' }}>{'\u2705'}</p>
          <p className="font-display" style={{ fontSize: 20, color: '#15130F', margin: 0 }}>Request sent!</p>
          <p style={{ fontSize: 13, color: '#8B857B', fontWeight: 600, margin: '6px 0 0' }}>Admin will process your payout shortly.</p>
        </div>
      ) : hasPending ? (
        <div style={{ background: 'rgba(255,184,0,0.08)', borderRadius: 16, padding: 16, border: '1px solid rgba(255,184,0,0.25)', textAlign: 'center' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#CC9400', margin: 0 }}>{'\u23F3'} Payout pending</p>
          <p style={{ fontSize: 12, color: '#8B857B', fontWeight: 600, margin: '4px 0 0' }}>Your previous request is being processed.</p>
        </div>
      ) : unpaid <= 0 ? (
        <div style={{ background: 'white', borderRadius: 16, padding: 16, border: '1px solid #E0DACE', textAlign: 'center' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#15130F', margin: 0 }}>{'\u2705'} All caught up!</p>
          <p style={{ fontSize: 12, color: '#8B857B', fontWeight: 600, margin: '4px 0 0' }}>No unpaid balance right now. Keep delivering!</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 16, padding: 16, border: '1px solid #E0DACE' }}>
          <p className="label-cap" style={{ color: '#FF6B2B', margin: '0 0 4px', fontSize: 10 }}>Request payout</p>
          <p className="font-display" style={{ fontSize: 20, color: '#15130F', margin: '0 0 3px' }}>{N}{unpaid.toLocaleString()}</p>
          <p style={{ fontSize: 12, color: '#8B857B', fontWeight: 600, margin: '0 0 16px' }}>will be sent to your bank account</p>
          {([
            { key: 'bankName' as const,      label: 'Bank name',      ph: 'e.g. GTBank' },
            { key: 'accountNumber' as const, label: 'Account number', ph: '10 digits' },
            { key: 'accountName' as const,   label: 'Account name',   ph: 'Full name on account' },
          ]).map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#8B857B', marginBottom: 4 }}>{f.label}</label>
              <input value={payoutForm[f.key]} onChange={e => setPayoutForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={INPUT} />
            </div>
          ))}
          <button onClick={onSubmit} disabled={submitting || !payoutForm.bankName || !payoutForm.accountNumber || !payoutForm.accountName} className="press" style={{ width: '100%', background: payoutForm.bankName && payoutForm.accountNumber && payoutForm.accountName ? '#FF6B2B' : '#E0DACE', color: 'white', fontWeight: 900, fontSize: 15, padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 4, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Sending...' : 'Request Payout'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */
export default function RunnerDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<RunnerProfile & { is_suspended?: boolean; suspended_until?: string } | null>(null)
  const [userName, setUserName] = useState('')
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [availableOrders, setAvailableOrders] = useState<Order[]>([])
  const [incomingOrder, setIncomingOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [accepting, setAccepting] = useState<string | null>(null)
  // ── Earnings view ─────────────────────────────────────────
  const [view, setView] = useState<'orders' | 'earnings'>('orders')
  const [paidOut, setPaidOut] = useState(0)
  // ── Payout form (shared with EarningsView) ────────────────
  const [payoutForm, setPayoutForm] = useState({ bankName: '', accountNumber: '', accountName: '' })
  const [payoutSubmitting, setPayoutSubmitting] = useState(false)
  const [payoutDone, setPayoutDone] = useState(false)
  const [pendingPayoutExists, setPendingPayoutExists] = useState(false)
  const [notApproved, setNotApproved] = useState(false)
  const [tab, setTab] = useState<'available' | 'recent'>('available')
  const [onlineSince, setOnlineSince] = useState<number | null>(null)
  const [tick, setTick] = useState(0)

  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const pollRef      = useRef<NodeJS.Timeout | null>(null)
  const isAvailableRef = useRef(false)
  const incomingRef  = useRef<Order | null>(null)

  useEffect(() => { incomingRef.current = incomingOrder }, [incomingOrder])

  const fetchAvailableOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, restaurant:restaurants(name)')
      .eq('status', 'awaiting_runner')
      .is('runner_id', null)
      .order('created_at', { ascending: true })
    setAvailableOrders(data ?? [])
    if (data?.length && !incomingRef.current && isAvailableRef.current) {
      setIncomingOrder(data[0] as Order)
    }
  }, [supabase])

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    fetchAvailableOrders()
    pollRef.current = setInterval(fetchAvailableOrders, 8000)
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setAvailableOrders([])
  }

  function subscribeToOrders(uid: string) {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    channelRef.current = supabase
      .channel('runner-orders-' + uid + '-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        if (!isAvailableRef.current) return
        const newRow = payload.new as Record<string, unknown>
        if (newRow?.status === 'awaiting_runner' && !newRow?.runner_id) {
          fetchAvailableOrders()
        } else {
          setAvailableOrders(prev => prev.filter(o => o.id !== newRow?.id))
          if (incomingRef.current?.id === newRow?.id && newRow?.runner_id) setIncomingOrder(null)
        }
      })
      .subscribe()
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const [{ data: userData }, { data: runnerData }, { data: orders }] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', user.id).single(),
        supabase.from('runner_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('orders').select('*, restaurant:restaurants(name)').eq('runner_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])

      setUserName(userData?.full_name?.split(' ')[0] ?? 'Runner')
      setProfile(runnerData)
      setRecentOrders(orders ?? [])

      // If no runner_profiles row, runner hasn't been approved yet
      if (!runnerData) { setNotApproved(true); setLoading(false); return }

      if (runnerData) {

        const [{ data: pendingReq }, { data: paidHistory }] = await Promise.all([
          supabase.from('payout_requests').select('id').eq('runner_id', user.id).eq('status', 'pending').single(),
          supabase.from('payouts').select('amount').eq('runner_id', user.id),
        ])
        setPendingPayoutExists(!!pendingReq)
        setPaidOut((paidHistory ?? []).reduce((s, p) => s + (p.amount ?? 0), 0))
      }

      if (runnerData?.is_available) setOnlineSince(Date.now())
      setLoading(false)

      const isSusp = !!(runnerData as RunnerProfile & { is_suspended?: boolean })?.is_suspended
      if (runnerData?.is_available && !isSusp) {
        isAvailableRef.current = true
        subscribeToOrders(user.id)
        startPolling()
      }
    }
    load()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profile?.is_available) return
    const t = setInterval(() => setTick(x => x + 1), 30_000)
    return () => clearInterval(t)
  }, [profile?.is_available])

  async function submitPayout() {
    const { bankName, accountNumber, accountName } = payoutForm
    if (!bankName || !accountNumber || !accountName) return
    setPayoutSubmitting(true)
    const unpaid = Math.max(0, (profile?.total_earnings ?? 0) - paidOut)
    const res = await fetch('/api/runner/request-payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankName, accountNumber, accountName, amount: unpaid }),
    })
    const { success, error } = await res.json()
    setPayoutSubmitting(false)
    if (success) { setPayoutDone(true); setPendingPayoutExists(true) }
    else alert(error || 'Failed to submit request')
  }

  async function toggleAvailability() {
    if (!profile || !userId) return
    setToggling(true)
    const next = !profile.is_available
    setProfile({ ...profile, is_available: next })
    isAvailableRef.current = next
    if (next) setOnlineSince(Date.now())
    const { data, error } = await supabase.from('runner_profiles').update({ is_available: next }).eq('user_id', userId).select().single()
    if (error || !data) {
      setProfile({ ...profile, is_available: !next })
      isAvailableRef.current = !next
    } else {
      setProfile(data)
      if (next && userId) { subscribeToOrders(userId); startPolling() }
      else {
        if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
        stopPolling(); setIncomingOrder(null)
      }
    }
    setToggling(false)
  }

  async function acceptOrder(orderId: string) {
    setAccepting(orderId)
    const res = await fetch('/api/runner/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) })
    const { success, error } = await res.json()
    setAccepting(null)
    setIncomingOrder(null)
    if (success) router.push(`/order/${orderId}`)
    else { alert(error || 'Order already taken'); fetchAvailableOrders() }
  }

  const today = useMemo(() => {
    const list = recentOrders.filter(o => o.status === 'delivered' && isToday(o.delivered_at ?? o.created_at))
    return { runs: list.length, earned: list.reduce((s, o) => s + (o.runner_earnings ?? 0), 0) }
  }, [recentOrders])

  const isLunchSoon = useMemo(() => {
    const h = new Date().getHours(); return h >= 10 && h < 13
  }, [tick])

  if (notApproved) return (
    <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 28px', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,184,0,0.1)', border: '2px solid rgba(255,184,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 24 }}>⏳</div>
      <p style={{ fontSize: 10, fontWeight: 800, color: '#FFB800', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 10px' }}>Under review</p>
      <h1 className="font-display" style={{ fontSize: 30, color: 'white', margin: '0 0 12px', lineHeight: 1.1 }}>Application pending</h1>
      <p style={{ fontSize: 14, color: '#6B6660', fontWeight: 600, margin: '0 0 32px', lineHeight: 1.7, maxWidth: 320 }}>Your application is being reviewed. We’ll notify you once approved — usually within 24–48 hours.</p>
      <button onClick={() => window.open('https://wa.me/2348068404839', '_blank')} style={{ background: 'rgba(29,185,84,0.1)', border: '1px solid rgba(29,185,84,0.25)', color: '#1DB954', fontWeight: 800, fontSize: 14, padding: '12px 20px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Questions? Chat on WhatsApp</button>
    </div>
  )

  if (loading) return (
    <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center' }}>
      <Bike size={36} color="#FF6B2B" />
    </div>
  )

  const isSuspended = !!(profile as RunnerProfile & { is_suspended?: boolean })?.is_suspended
  const isOnline    = !!profile?.is_available && !isSuspended

  return (
    <div style={S.page}>
      {incomingOrder && !isSuspended && (
        <IncomingAlert
          order={incomingOrder}
          onAccept={() => acceptOrder(incomingOrder.id)}
          onDecline={() => setIncomingOrder(null)}
          accepting={accepting === incomingOrder.id}
        />
      )}

      {/* Greeting */}
      <div style={{ padding: '52px 18px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="label-cap" style={{ color: '#8B857B', margin: 0, fontSize: 10 }}>Runner &middot; {userName}</p>
            <h1 className="font-display" style={{ fontSize: 24, margin: '2px 0 0', color: '#15130F', lineHeight: 1.05 }}>
              {view === 'earnings' ? 'My Earnings' : "Today's shift"}
            </h1>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#15130F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="font-display" style={{ color: '#FF6B2B', fontSize: 14 }}>{monogram(userName)}</span>
          </div>
        </div>
      </div>

      {view === 'orders' && (
        <div style={{ padding: '0 14px' }}>
          <RainBanner variant="runner" />
        </div>
      )}

      {/* Suspension banner / Online hero — hidden on earnings view */}
      {view === 'orders' && isSuspended && (
        <div style={{ margin: '4px 14px 12px', background: '#2A0A0A', borderRadius: 16, padding: '14px 16px', border: '1px solid rgba(255,59,48,0.3)' }}>
          <p style={{ color: '#FF3B30', fontSize: 14, fontWeight: 800, margin: 0 }}>{'\uD83D\uDEAB'} Account Suspended</p>
          <p style={{ color: '#8B857B', fontSize: 12, fontWeight: 600, marginTop: 2 }}>3 cancellations in 30 days. Contact support to appeal.</p>
        </div>
      )}
      {view === 'orders' && !isSuspended && (
        <div style={{ margin: '4px 14px 12px', background: '#15130F', color: 'white', borderRadius: 18, padding: 18, position: 'relative', overflow: 'hidden' }}>
          <div className="dot-texture" style={{ position: 'absolute', inset: 0, opacity: 0.6 }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p className="label-cap" style={{ color: isOnline ? '#FF6B2B' : '#8B857B', margin: 0, fontSize: 10 }}>
                  {isOnline ? "You're online" : 'Offline'}
                </p>
                <p className="font-display" style={{ fontSize: 20, margin: '4px 0 0', color: 'white' }}>
                  {isOnline ? 'Accepting orders' : 'Go online to start'}
                </p>
              </div>
              <Toggle on={isOnline} onToggle={toggleAvailability} disabled={toggling} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
              <Metric label="Earned today" value={`\u20A6${today.earned.toLocaleString()}`} accent />
              <Metric label="Runs"         value={`${today.runs}`} />
              <Metric label="Online"       value={isOnline && onlineSince ? fmtDuration(Date.now() - onlineSince) : '\u2014'} />
            </div>
          </div>
        </div>
      )}

      {/* Peak banner */}
      {view === 'orders' && isLunchSoon && isOnline && (
        <div style={{ margin: '0 14px 12px', background: '#FFE9D6', border: '1px solid #F2C28A', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#FF6B2B', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingUp size={14} />
          </div>
          <div>
            <p style={{ fontWeight: 800, fontSize: 12, color: '#15130F', margin: 0 }}>Lunch rush incoming</p>
            <p style={{ fontWeight: 600, fontSize: 11, color: '#4A463F', margin: '2px 0 0' }}>Stay online for +{'\u20A6'}100/run bonus until 1:30pm.</p>
          </div>
        </div>
      )}

      {/* ── EARNINGS VIEW ── */}
      {view === 'earnings' && (
        <EarningsView
          totalEarned={profile?.total_earnings ?? 0}
          paidOut={paidOut}
          payoutForm={payoutForm}
          setPayoutForm={setPayoutForm}
          onSubmit={submitPayout}
          submitting={payoutSubmitting}
          done={payoutDone}
          hasPending={pendingPayoutExists}
        />
      )}

      {/* ── ORDERS VIEW — suspension screen or tabs ── */}
      {view === 'orders' && isSuspended && (
        <SuspensionScreen profile={profile as RunnerProfile & { is_suspended?: boolean; suspended_until?: string; strike_count?: number }} />
      )}
      {view === 'orders' && !isSuspended && (
        <>
          <div style={{ display: 'flex', margin: '4px 14px 10px', background: 'white', borderRadius: 12, padding: 4, border: '1px solid #E0DACE' }}>
            {(['available', 'recent'] as const).map(t => {
              const on = tab === t
              return (
                <button key={t} onClick={() => setTab(t)} className="press" style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, fontFamily: 'inherit', background: on ? '#15130F' : 'transparent', color: on ? 'white' : '#8B857B' }}>
                  {t === 'available' ? `Available${isOnline && availableOrders.length > 0 ? ` (${availableOrders.length})` : ''}` : 'Recent'}
                </button>
              )
            })}
          </div>

          <div style={S.body}>
            {tab === 'available' && (
              !isOnline ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: '#8B857B', fontWeight: 600 }}>
                  <p style={{ fontSize: 32, margin: '0 0 10px' }}>{'\uD83D\uDD34'}</p>
                  <p style={{ margin: 0 }}>You&apos;re offline</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13 }}>Toggle online above to see available orders</p>
                </div>
              ) : availableOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: '#8B857B', fontWeight: 600 }}>
                  <p style={{ fontSize: 32, margin: '0 0 10px' }}>{'\uD83D\uDD50'}</p>
                  <p style={{ margin: 0 }}>No orders right now</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13 }}>New orders appear here automatically</p>
                </div>
              ) : availableOrders.map(order => {
                const restaurant = order.restaurant as { name: string } | null
                const isAccepting = accepting === order.id
                return (
                  <div key={order.id} style={{ background: 'white', border: '2px solid #FF6B2B', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <p style={{ fontWeight: 800, fontSize: 14, color: '#FF6B2B', margin: 0 }}>{order.order_ref}</p>
                        <p style={{ fontSize: 12, color: '#8B857B', fontWeight: 600, margin: '3px 0 0' }}>{'\uD83C\uDFEA'} {restaurant?.name}</p>
                        <p style={{ fontSize: 12, color: '#8B857B', fontWeight: 600, margin: '2px 0 0' }}>{'\uD83D\uDCCD'} {order.delivery_address}</p>
                        <p style={{ fontSize: 12, color: '#8B857B', fontWeight: 600, margin: '4px 0 0' }}>{Array.isArray(order.items) ? order.items.length : 0} item(s)</p>
                      </div>
                      <div style={{ background: 'rgba(29,185,84,0.15)', color: '#1B7F3A', fontWeight: 900, fontSize: 14, padding: '6px 10px', borderRadius: 10, flexShrink: 0 }}>
                        {'\u20A6'}{(order.runner_earnings || 300).toLocaleString()}
                      </div>
                    </div>
                    <button onClick={() => acceptOrder(order.id)} disabled={!!accepting} className="press" style={{ width: '100%', background: isAccepting ? '#cc5522' : '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 15, padding: '13px', borderRadius: 12, border: 'none', cursor: accepting ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif", opacity: accepting && !isAccepting ? 0.5 : 1 }}>
                      {isAccepting ? 'Accepting...' : '\u2713 Accept this order'}
                    </button>
                  </div>
                )
              })
            )}

            {tab === 'recent' && (
              recentOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: '#8B857B', fontWeight: 600 }}>
                  <Package size={36} color="#8B857B" style={{ marginBottom: 10 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No deliveries yet &mdash; go online to start earning.</p>
                </div>
              ) : recentOrders.slice(0, 8).map(o => {
                const restaurant = o.restaurant as { name: string } | null
                const done = o.status === 'delivered'; const cancelled = o.status === 'cancelled'
                const active = !done && !cancelled
                return (
                  <div key={o.id} onClick={() => active && router.push(`/order/${o.id}`)} className="press" style={{ background: 'white', border: '1px solid #E0DACE', borderRadius: 14, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, cursor: active ? 'pointer' : 'default' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0EBE0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="font-display" style={{ color: '#FF6B2B', fontSize: 12 }}>{monogram(restaurant?.name)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 800, fontSize: 13, color: '#15130F', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.order_ref} &middot; {restaurant?.name ?? '\u2014'}
                      </p>
                      <p style={{ fontSize: 11, color: '#8B857B', fontWeight: 600, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.delivery_address}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="font-display" style={{ fontSize: 13, color: '#15130F', margin: 0 }}>+{'\u20A6'}{(o.runner_earnings || 0).toLocaleString()}</p>
                      <p className="label-cap" style={{ fontSize: 9, margin: '2px 0 0', color: done ? '#1B7F3A' : cancelled ? '#B23A2E' : '#FF6B2B' }}>
                        {done ? 'DELIVERED' : cancelled ? 'CANCELLED' : 'ACTIVE'}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Bottom nav */}
      <nav style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'white', borderTop: '1px solid #E0DACE', padding: '10px 0 16px', position: 'sticky', bottom: 0, zIndex: 10 }}>
        {([
          { Icon: Home,    label: 'Today',    active: view === 'orders',   onClick: () => setView('orders')         },
          { Icon: ArrowUp, label: 'Earnings', active: view === 'earnings', onClick: () => setView('earnings')       },
          { Icon: User,    label: 'Profile',  active: false,               onClick: () => router.push('/runner-profile') },
        ] as const).map(({ Icon, label, active, onClick }) => (
          <button key={label} className="press" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: active ? '#FF6B2B' : '#8B857B', padding: 0 }}>
            <Icon size={20} strokeWidth={2.2} />
            <span style={{ fontSize: 10, fontWeight: 800 }}>{label}</span>
            {active && <span style={{ width: 18, height: 2, borderRadius: 2, background: '#FF6B2B' }} />}
          </button>
        ))}
      </nav>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="label-cap" style={{ color: '#8B857B', margin: 0, fontSize: 9 }}>{label}</p>
      <p className="font-display" style={{ fontSize: 18, margin: '4px 0 0', color: accent ? '#FF6B2B' : 'white' }}>{value}</p>
    </div>
  )
}