'use client'

// Runner transfer audit view. Transfers now fire automatically via
// Paystack on runner accept (see app/api/payments/transfer/runner.ts
// and lib/paystack/transfers.ts). This page is read-only.
//
// Shows per-runner totals and a chronological transfer list with
// status pills (in-flight, success, failed, reversed) so admin can
// spot problem patterns.

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const N = '\u20A6'

interface Transfer {
  id: string
  order_id: string
  order_ref: string
  amount: number
  status: 'pending' | 'sent' | 'success' | 'failed' | 'reversed' | 'cancelled'
  created_at: string
  paid_at: string | null
  paystack_ref: string | null
  paystack_transfer_code: string | null
  failure_reason: string | null
  bank_name: string | null
  account_number: string | null
  account_name: string | null
  restaurant_name: string
  delivery_address: string
}

interface RunnerGroup {
  runner_id: string
  runner_name: string
  runner_phone: string
  inFlightAmount: number
  inFlightCount: number
  completedAmount: number
  completedCount: number
  failedCount: number
  transfers: Transfer[]
}

function initials(name?: string | null) {
  if (!name) return '?'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

// ── Status pill styling ─────────────────────────────────────────────
// Each Paystack state gets its own colour so admin can scan the list
// and immediately spot problems without reading text.
function statusPill(status: Transfer['status']) {
  const map: Record<Transfer['status'], { bg: string; fg: string; label: string }> = {
    pending:   { bg: 'rgba(255,184,0,0.15)', fg: '#FFB800', label: 'PENDING' },
    sent:      { bg: 'rgba(255,184,0,0.15)', fg: '#FFB800', label: 'IN FLIGHT' },
    success:   { bg: 'rgba(29,185,84,0.15)', fg: '#1DB954', label: 'SUCCESS' },
    failed:    { bg: 'rgba(255,59,48,0.15)', fg: '#FF3B30', label: 'FAILED' },
    reversed:  { bg: 'rgba(255,59,48,0.2)',  fg: '#FF3B30', label: 'REVERSED' },
    cancelled: { bg: 'rgba(139,133,123,0.15)', fg: '#8B857B', label: 'CANCELLED' },
  }
  return map[status]
}

export default function AdminRunnerTransfersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [runners, setRunners] = useState<RunnerGroup[]>([])
  const [totalInFlight, setTotalInFlight] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/runner-transfers')
    if (res.status === 401 || res.status === 403) { router.push('/home'); return }
    const data = await res.json()
    setRunners(data.runners ?? [])
    setTotalInFlight(data.totalInFlight ?? 0)
    setLoading(false)
  }, [router])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load()
    })
  }, [load, router, supabase])

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}>
      💸
    </div>
  )

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      {/* ── HEADER ────────────────────────────────────────────── */}
      <div className="dot-texture" style={{ padding: '52px 20px 20px', borderBottom: '1px solid #2A2825' }}>
        <Link
          href="/admin/dashboard"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#A09A8E', textDecoration: 'none', marginBottom: 12 }}
        >
          ← Dashboard
        </Link>
        <div>
          <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 10 }}>
            Runner-funded flow
          </p>
          <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: '2px 0 0' }}>
            Runner transfers
          </h1>
          <p style={{ color: '#6B6660', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
            Automatic — fired via Paystack when runner accepts. Audit view only.
          </p>
        </div>

        {totalInFlight > 0 && (
          <div style={{ marginTop: 14, background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p className="label-cap" style={{ color: '#FFB800', margin: 0, fontSize: 9 }}>In flight</p>
              <p className="font-display" style={{ fontSize: 26, color: 'white', margin: '2px 0 0', lineHeight: 1 }}>
                {N}{totalInFlight.toLocaleString()}
              </p>
            </div>
            <p style={{ fontSize: 11, color: '#A09A8E', fontWeight: 700, margin: 0, textAlign: 'right' }}>
              Awaiting<br />webhook
            </p>
          </div>
        )}
      </div>

      {/* ── LIST ──────────────────────────────────────────────── */}
      <div style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
        {runners.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6660', fontSize: 13, fontWeight: 600 }}>
            No transfers yet. When runners accept runner-funded orders,<br />
            transfers will appear here.
          </div>
        ) : (
          runners.map((r) => {
            const isExpanded = expanded === r.runner_id
            const hasProblems = r.failedCount > 0
            return (
              <div key={r.runner_id} style={{ background: '#1A1917', border: `1px solid ${hasProblems ? 'rgba(255,59,48,0.35)' : '#2A2825'}`, borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : r.runner_id)}
                  className="press"
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: 60 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,107,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="font-display" style={{ color: '#FF6B2B', fontSize: 13 }}>{initials(r.runner_name)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{r.runner_name}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                      {r.inFlightCount > 0 && (
                        <span style={{ fontSize: 10, color: '#FFB800', fontWeight: 800 }}>
                          {r.inFlightCount} in flight
                        </span>
                      )}
                      {r.completedCount > 0 && (
                        <span style={{ fontSize: 10, color: '#1DB954', fontWeight: 800 }}>
                          {r.completedCount} sent
                        </span>
                      )}
                      {r.failedCount > 0 && (
                        <span style={{ fontSize: 10, color: '#FF3B30', fontWeight: 800 }}>
                          {r.failedCount} failed
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: '#6B6660', fontSize: 18, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>→</span>
                </button>

                {isExpanded && (
                  <div style={{ padding: '0 14px 14px' }}>
                    {/* Bank details */}
                    {r.transfers[0]?.bank_name && (
                      <div style={{ background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                        <p className="label-cap" style={{ color: '#A09A8E', margin: 0, fontSize: 9 }}>Recipient</p>
                        <div style={{ marginTop: 6 }}>
                          <p style={{ color: 'white', fontWeight: 800, fontSize: 13, margin: 0 }}>
                            {r.transfers[0].bank_name}
                          </p>
                          <p style={{ fontFamily: 'monospace', fontSize: 13, color: '#A09A8E', fontWeight: 700, margin: '2px 0 0', letterSpacing: '0.05em' }}>
                            {r.transfers[0].account_number}
                          </p>
                          <p style={{ color: '#A09A8E', fontSize: 11, fontWeight: 700, margin: '2px 0 0' }}>
                            {r.transfers[0].account_name}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Transfer list */}
                    <p className="label-cap" style={{ color: '#A09A8E', margin: '0 0 8px', fontSize: 9 }}>
                      Recent transfers
                    </p>
                    {r.transfers.slice(0, 20).map(t => {
                      const pill = statusPill(t.status)
                      return (
                        <div key={t.id} style={{ background: '#0C0B09', borderRadius: 10, padding: 10, marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0, fontFamily: 'monospace' }}>{t.order_ref}</p>
                                <span style={{ background: pill.bg, color: pill.fg, fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em' }}>
                                  {pill.label}
                                </span>
                              </div>
                              <p style={{ fontSize: 10, color: '#6B6660', fontWeight: 600, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.restaurant_name} · {new Date(t.created_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <p style={{ fontWeight: 900, fontSize: 14, color: pill.fg, margin: 0, fontFamily: 'monospace' }}>
                              {N}{t.amount.toLocaleString()}
                            </p>
                          </div>

                          {/* Failure/reversal details */}
                          {t.failure_reason && (
                            <p style={{ fontSize: 11, color: '#FF3B30', fontWeight: 700, margin: '6px 0 0', padding: '6px 8px', background: 'rgba(255,59,48,0.08)', borderRadius: 6, lineHeight: 1.4 }}>
                              {t.failure_reason}
                            </p>
                          )}

                          {/* Paystack refs — useful for reconciliation */}
                          {t.paystack_transfer_code && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              <button
                                onClick={() => copy(t.paystack_transfer_code!)}
                                className="press"
                                style={{ background: 'transparent', border: '1px solid #2A2825', color: '#A09A8E', fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', minHeight: 26 }}
                                title="Copy transfer code"
                              >
                                {t.paystack_transfer_code}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
