'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCancelLabel } from '@/lib/cancel-reasons'

interface Strike {
  id: string
  reason: string
  created_at: string
  order_id: string
}

interface RunnerRow {
  user_id: string
  is_available: boolean
  is_suspended: boolean
  suspended_until: string | null
  total_deliveries: number
  total_earnings: number
  rating: number
  users: { full_name: string; phone: string }
  strikes: Strike[]
  activeStrikes: number
}

function initials(name?: string | null) {
  if (!name) return '?'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

const MEDAL = ['🥇', '🥈', '🥉']

export default function AdminRunnersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [runners, setRunners] = useState<RunnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/runners')
    if (res.status === 401 || res.status === 403) { router.push('/home'); return }
    const { runners } = await res.json()
    setRunners(runners ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load()
    })
  }, [load, router, supabase])

  async function doAction(action: 'unsuspend' | 'clear_strikes', runnerId: string) {
    setActioning(runnerId)
    await fetch('/api/admin/runners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, runnerId }),
    })
    await load()
    setActioning(null)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontSize: 40 }}>🛵</div>
  )

  const suspended = runners.filter(r => r.is_suspended)
  const active    = runners.filter(r => !r.is_suspended)

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>

      <div className="dot-texture" style={{ padding: '52px 20px 20px', borderBottom: '1px solid var(--line, #2A2825)' }}>
        <Link href="/admin/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2, #A09A8E)', textDecoration: 'none', marginBottom: 12 }}>
          ← Dashboard
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: 0 }}>Runners</h1>
            <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
              {runners.length} total · {suspended.length} suspended
            </p>
          </div>
          {suspended.length > 0 && (
            <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 20, padding: '5px 12px' }}>
              <span style={{ color: 'var(--danger, #FF3B30)', fontWeight: 900, fontSize: 13 }}>{suspended.length}</span>
              <span style={{ color: 'var(--danger, #FF3B30)', fontWeight: 600, fontSize: 11 }}> suspended</span>
            </div>
          )}
        </div>
      </div>

      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>

        {suspended.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p className="label-cap" style={{ color: 'var(--danger, #FF3B30)', fontSize: 10, margin: '0 0 8px' }}>🚫 SUSPENDED ({suspended.length})</p>
            {suspended.map(r => (
              <RunnerCard
                key={r.user_id}
                runner={r}
                expanded={expanded === r.user_id}
                onToggle={() => setExpanded(expanded === r.user_id ? null : r.user_id)}
                onUnsuspend={() => doAction('unsuspend', r.user_id)}
                onClearStrikes={() => doAction('clear_strikes', r.user_id)}
                actioning={actioning === r.user_id}
              />
            ))}
          </div>
        )}

        <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, margin: '0 0 8px' }}>ACTIVE ({active.length})</p>
        {active.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>No active runners</div>
        )}
        {active.map((r, i) => (
          <RunnerCard
            key={r.user_id}
            runner={r}
            rank={i < 3 ? MEDAL[i] : undefined}
            expanded={expanded === r.user_id}
            onToggle={() => setExpanded(expanded === r.user_id ? null : r.user_id)}
            onUnsuspend={() => doAction('unsuspend', r.user_id)}
            onClearStrikes={() => doAction('clear_strikes', r.user_id)}
            actioning={actioning === r.user_id}
          />
        ))}
      </div>
    </div>
  )
}

function RunnerCard({ runner, rank, expanded, onToggle, onUnsuspend, onClearStrikes, actioning }: {
  runner: RunnerRow; rank?: string; expanded: boolean
  onToggle: () => void; onUnsuspend: () => void; onClearStrikes: () => void; actioning: boolean
}) {
  const strikes = runner.activeStrikes
  const strikeColor = strikes >= 3 ? 'var(--danger, #FF3B30)' : strikes === 2 ? '#FF9500' : strikes === 1 ? 'var(--warn, #FFB800)' : 'var(--ok, #1DB954)'
  const until = runner.suspended_until ? new Date(runner.suspended_until) : null
  const daysLeft = until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86_400_000)) : 0

  return (
    <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, marginBottom: 8, border: `1px solid ${runner.is_suspended ? 'rgba(255,59,48,0.3)' : 'var(--line, #2A2825)'}`, overflow: 'hidden' }}>
      {/* Summary row */}
      <button onClick={onToggle} style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        {/* Avatar */}
        <div style={{ width: 44, height: 44, borderRadius: 12, background: runner.is_suspended ? 'rgba(255,59,48,0.1)' : 'rgba(255,107,43,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
          <span className="font-display" style={{ color: runner.is_suspended ? 'var(--danger, #FF3B30)' : 'var(--accent, #FF6B2B)', fontSize: 14 }}>
            {initials(runner.users?.full_name)}
          </span>
          {runner.is_available && !runner.is_suspended && (
            <span style={{ position: 'absolute', bottom: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: 'var(--ok, #1DB954)', border: '1.5px solid var(--bg-1, #1A1917)' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {runner.users?.full_name}
            </p>
            {rank && <span style={{ fontSize: 14 }}>{rank}</span>}
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
            {runner.total_deliveries} drops · ⭐{(runner.rating ?? 5).toFixed(1)} · ₦{(runner.total_earnings ?? 0).toLocaleString()}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {/* Strike dots */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < strikes ? strikeColor : 'var(--bg-2, #26241F)', border: `1px solid ${i < strikes ? strikeColor : 'var(--line, #2A2825)'}`, display: 'block' }} />
            ))}
            <span style={{ fontSize: 10, fontWeight: 700, color: strikeColor, marginLeft: 4 }}>{strikes}/3</span>
          </div>
          {runner.is_suspended && daysLeft > 0 && (
            <span style={{ fontSize: 9, color: 'var(--danger, #FF3B30)', fontWeight: 700 }}>{daysLeft}d left</span>
          )}
          <span style={{ color: 'var(--ink-3, #6B6660)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line, #2A2825)' }}>
          <a
            href={`tel:${runner.users?.phone}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, background: 'var(--bg-0, #0C0B09)', border: '1px solid var(--line, #2A2825)', color: 'var(--accent, #FF6B2B)', fontWeight: 700, fontSize: 13, padding: '9px', borderRadius: 10, textDecoration: 'none', marginBottom: 12 }}
          >
            📞 {runner.users?.phone}
          </a>

          {runner.strikes.length > 0 ? (
            <>
              <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, margin: '0 0 8px' }}>STRIKES (LAST 30 DAYS)</p>
              {runner.strikes.map((s, i) => (
                <div key={s.id} style={{ background: 'var(--bg-0, #0C0B09)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, border: '1px solid var(--line, #2A2825)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,59,48,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: 'var(--danger, #FF3B30)', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: 0 }}>{getCancelLabel(s.reason)}</p>
                    <p style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
                      {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {new Date(s.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ background: 'rgba(29,185,84,0.06)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(29,185,84,0.15)', marginBottom: 8 }}>
              <p style={{ color: 'var(--ok, #1DB954)', fontSize: 13, fontWeight: 700, margin: 0 }}>✓ Clean record — no strikes in 30 days</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {runner.is_suspended && (
              <button onClick={onUnsuspend} disabled={actioning} className="press" style={{ flex: 1, background: actioning ? '#1a5c35' : 'var(--ok, #1DB954)', color: 'white', fontWeight: 800, fontSize: 13, padding: '11px', borderRadius: 12, border: 'none', cursor: actioning ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: actioning ? 0.7 : 1 }}>
                {actioning ? 'Working...' : '✓ Unsuspend'}
              </button>
            )}
            {runner.strikes.length > 0 && (
              <button onClick={onClearStrikes} disabled={actioning} className="press" style={{ flex: 1, background: 'var(--bg-2, #26241F)', color: 'var(--ink-2, #A09A8E)', fontWeight: 800, fontSize: 13, padding: '11px', borderRadius: 12, border: '1px solid var(--line, #2A2825)', cursor: actioning ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: actioning ? 0.7 : 1 }}>
                {actioning ? 'Working...' : '🗑 Clear strikes'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
