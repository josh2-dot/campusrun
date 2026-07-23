'use client'

// /admin/settlements — track what runners owe CampusRun and record
// when they've paid up. Read-only for outstanding + history; POST
// records a settlement grouped by orders selected.

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const N = '\u20A6'

interface OrderRow {
  id: string
  order_ref: string
  amount: number
  delivered_at: string
}

interface RunnerGroup {
  runner_id: string
  runner_name: string
  runner_phone: string
  totalOwed: number
  orderCount: number
  orders: OrderRow[]
}

interface Settlement {
  id: string
  runner_id: string
  runner_name: string
  amount: number
  order_count: number
  bank_reference: string | null
  received_at: string
  note: string | null
}

function initials(name?: string | null) {
  if (!name) return '?'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

export default function SettlementsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [outstanding, setOutstanding] = useState<RunnerGroup[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tab, setTab] = useState<'outstanding' | 'history'>('outstanding')

  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const [bankRef, setBankRef] = useState<Record<string, string>>({})
  const [recording, setRecording] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/settlements')
    if (res.status === 401 || res.status === 403) { router.push('/home'); return }
    const data = await res.json()
    setOutstanding(data.outstanding ?? [])
    setSettlements(data.settlements ?? [])
    setTotalOutstanding(data.totalOutstanding ?? 0)
    setLoading(false)
  }, [router])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load()
    })
  }, [load, router, supabase])

  function toggle(runnerId: string, orderId: string) {
    setSelected(prev => {
      const cur = new Set(prev[runnerId] ?? [])
      if (cur.has(orderId)) cur.delete(orderId); else cur.add(orderId)
      return { ...prev, [runnerId]: cur }
    })
  }

  function selectAll(r: RunnerGroup) {
    setSelected(prev => ({ ...prev, [r.runner_id]: new Set(r.orders.map(o => o.id)) }))
  }

  async function record(r: RunnerGroup) {
    const ids = [...(selected[r.runner_id] ?? [])]
    if (!ids.length) return
    setRecording(p => ({ ...p, [r.runner_id]: true }))
    const res = await fetch('/api/admin/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runnerId: r.runner_id,
        orderIds: ids,
        bankReference: bankRef[r.runner_id],
      }),
    })
    const data = await res.json()
    setRecording(p => ({ ...p, [r.runner_id]: false }))
    if (!res.ok) {
      alert(data.error || "Couldn't record. Try again.")
      return
    }
    setSelected(p => ({ ...p, [r.runner_id]: new Set() }))
    setBankRef(p => ({ ...p, [r.runner_id]: '' }))
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}>
      💰
    </div>
  )

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <div className="dot-texture" style={{ padding: '52px 20px 20px', borderBottom: '1px solid #2A2825' }}>
        <Link href="/admin/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#A09A8E', textDecoration: 'none', marginBottom: 12 }}>
          ← Dashboard
        </Link>
        <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 10 }}>Runner-funded flow</p>
        <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: '2px 0 0' }}>Runner settlements</h1>
        <p style={{ color: '#6B6660', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
          What runners owe CampusRun from delivered runner-funded orders
        </p>

        {totalOutstanding > 0 && (
          <div style={{ marginTop: 14, background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.25)', borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 9 }}>Owed to CampusRun</p>
              <p className="font-display" style={{ fontSize: 26, color: 'white', margin: '2px 0 0', lineHeight: 1 }}>
                {N}{totalOutstanding.toLocaleString()}
              </p>
            </div>
            <p style={{ fontSize: 11, color: '#A09A8E', fontWeight: 700, margin: 0, textAlign: 'right' }}>
              {outstanding.length} runner{outstanding.length === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '14px 14px 0' }}>
        {(['outstanding', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="press"
            style={{ flex: 1, background: tab === t ? '#FF6B2B' : 'transparent', color: tab === t ? 'white' : '#A09A8E', border: `1px solid ${tab === t ? '#FF6B2B' : '#2A2825'}`, fontWeight: 800, fontSize: 13, padding: 10, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', minHeight: 40 }}
          >
            {t} {t === 'outstanding' && outstanding.length > 0 && `(${outstanding.length})`}
          </button>
        ))}
      </div>

      <div style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
        {tab === 'outstanding' ? (
          outstanding.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6660', fontSize: 13, fontWeight: 600 }}>
              Everyone&apos;s squared up.<br />No outstanding platform debt.
            </div>
          ) : outstanding.map(r => {
            const isExpanded = expanded === r.runner_id
            const sel = selected[r.runner_id] ?? new Set<string>()
            const selCount = sel.size
            const selAmount = r.orders.filter(o => sel.has(o.id)).reduce((s, o) => s + o.amount, 0)
            return (
              <div key={r.runner_id} style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
                <button onClick={() => setExpanded(isExpanded ? null : r.runner_id)} className="press"
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: 60 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,107,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="font-display" style={{ color: '#FF6B2B', fontSize: 13 }}>{initials(r.runner_name)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{r.runner_name}</p>
                    <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 700, margin: '2px 0 0' }}>
                      Owes {N}{r.totalOwed.toLocaleString()} across {r.orderCount} order{r.orderCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span style={{ color: '#FF6B2B', fontFamily: 'monospace', fontWeight: 900, fontSize: 14 }}>
                    {N}{r.totalOwed.toLocaleString()}
                  </span>
                  <span style={{ color: '#6B6660', fontSize: 18, marginLeft: 6, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>→</span>
                </button>

                {isExpanded && (
                  <div style={{ padding: '0 14px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p className="label-cap" style={{ color: '#A09A8E', margin: 0, fontSize: 9 }}>Outstanding orders</p>
                      <button onClick={() => selectAll(r)} className="press" style={{ background: 'transparent', color: '#FF6B2B', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 4, minHeight: 28 }}>
                        Select all
                      </button>
                    </div>

                    {r.orders.map(o => {
                      const isSel = sel.has(o.id)
                      return (
                        <button key={o.id} onClick={() => toggle(r.runner_id, o.id)} className="press"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: isSel ? 'rgba(255,107,43,0.1)' : '#0C0B09', border: `1px solid ${isSel ? '#FF6B2B' : '#2A2825'}`, borderRadius: 10, padding: 10, marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: 48 }}
                        >
                          <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSel ? '#FF6B2B' : '#2A2825'}`, background: isSel ? '#FF6B2B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white', fontSize: 11, fontWeight: 900 }}>
                            {isSel ? '✓' : ''}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0, fontFamily: 'monospace' }}>{o.order_ref}</p>
                            <p style={{ fontSize: 10, color: '#6B6660', fontWeight: 600, margin: '2px 0 0' }}>
                              {new Date(o.delivered_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <p style={{ fontWeight: 900, fontSize: 14, color: '#FF6B2B', margin: 0, fontFamily: 'monospace' }}>
                            {N}{o.amount.toLocaleString()}
                          </p>
                        </button>
                      )
                    })}

                    {selCount > 0 && (
                      <div style={{ marginTop: 12, padding: 12, background: '#0C0B09', border: '1px solid #FF6B2B', borderRadius: 10 }}>
                        <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 9 }}>
                          Recording — {selCount} order{selCount === 1 ? '' : 's'}
                        </p>
                        <p className="font-display" style={{ fontSize: 22, color: 'white', margin: '2px 0 10px', lineHeight: 1 }}>
                          {N}{selAmount.toLocaleString()}
                        </p>
                        <input value={bankRef[r.runner_id] ?? ''} onChange={e => setBankRef(p => ({ ...p, [r.runner_id]: e.target.value }))}
                          placeholder="Bank ref (optional)"
                          style={{ width: '100%', background: '#1A1917', border: '1px solid #2A2825', borderRadius: 8, padding: 10, fontSize: 12, fontWeight: 700, color: 'white', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', marginBottom: 8, minHeight: 40 }}
                        />
                        <button onClick={() => record(r)} disabled={recording[r.runner_id]} className="press"
                          style={{ width: '100%', background: recording[r.runner_id] ? '#cc5522' : '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 14, padding: 12, borderRadius: 10, border: 'none', cursor: recording[r.runner_id] ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: recording[r.runner_id] ? 0.7 : 1, minHeight: 44 }}
                        >
                          {recording[r.runner_id] ? 'Recording…' : `Mark ${N}${selAmount.toLocaleString()} settled →`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        ) : (
          settlements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6660', fontSize: 13, fontWeight: 600 }}>
              No settlements recorded yet.
            </div>
          ) : settlements.map(s => (
            <div key={s.id} style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(29,185,84,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#1DB954', fontSize: 14 }}>
                  ✓
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>{s.runner_name}</p>
                  <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 700, margin: '2px 0 0' }}>
                    {s.order_count} order{s.order_count === 1 ? '' : 's'} · {new Date(s.received_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                    {s.bank_reference && ` · ${s.bank_reference}`}
                  </p>
                </div>
                <p style={{ fontWeight: 900, fontSize: 14, color: '#1DB954', margin: 0, fontFamily: 'monospace' }}>
                  {N}{s.amount.toLocaleString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
