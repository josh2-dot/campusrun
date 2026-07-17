'use client'

// Runner-funded allowlist manager.
//
// Managed by hand: an admin picks a runner from the existing runner list
// and adds them to the allowlist with an optional note ("vouched by
// Michael, known since May 2026"). Only allowlisted runners can accept
// runner-funded orders (see api/runner/accept — NOT_ALLOWLISTED gate).
//
// Explicit removal — no automatic tiering during pilot. Trust is
// personal, not algorithmic.

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Runner {
  user_id: string
  full_name: string
  phone: string
  total_deliveries: number
  bank_name: string | null
  account_number: string | null
}

interface AllowlistRow {
  runner_id: string
  added_at: string
  note: string | null
  runner: { full_name: string; phone: string } | null
}

function initials(name?: string | null) {
  if (!name) return '?'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

export default function RunnerFundedAllowlistPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [allowlist, setAllowlist] = useState<AllowlistRow[]>([])
  const [candidates, setCandidates] = useState<Runner[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<AllowlistRow | null>(null)
  const [removeText, setRemoveText] = useState('')

  const load = useCallback(async () => {
    // Load allowlist rows
    const { data: rows } = await supabase
      .from('runner_funded_allowlist')
      .select('runner_id, added_at, note, runner:users!runner_id(full_name, phone)')
      .order('added_at', { ascending: false })

    // Load all runners (candidates for adding). Filter out already-allowlisted.
    const { data: allRunners } = await supabase
      .from('runner_profiles')
      .select('user_id, total_deliveries, bank_name, account_number, users!inner(full_name, phone)')
      .order('total_deliveries', { ascending: false })

    const allowlisted = new Set((rows ?? []).map(r => r.runner_id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cands: Runner[] = (allRunners ?? []).filter((r: any) => !allowlisted.has(r.user_id)).map((r: any) => ({
      user_id: r.user_id,
      full_name: Array.isArray(r.users) ? r.users[0]?.full_name : r.users?.full_name ?? '?',
      phone: Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone ?? '',
      total_deliveries: r.total_deliveries ?? 0,
      bank_name: r.bank_name,
      account_number: r.account_number,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllowlist(((rows ?? []) as any[]).map(r => ({
      runner_id: r.runner_id,
      added_at: r.added_at,
      note: r.note,
      runner: Array.isArray(r.runner) ? r.runner[0] ?? null : r.runner,
    })))
    setCandidates(cands)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load()
    })
  }, [load, router, supabase])

  async function addRunner() {
    if (!selectedRunner) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('runner_funded_allowlist').insert({
      runner_id: selectedRunner.user_id,
      added_by: user?.id ?? null,
      note: note.trim() || null,
    })
    setSaving(false)
    setShowAdd(false)
    setSelectedRunner(null)
    setNote('')
    load()
  }

  async function removeRunner(row: AllowlistRow) {
    await supabase.from('runner_funded_allowlist').delete().eq('runner_id', row.runner_id)
    setConfirmRemove(null)
    setRemoveText('')
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}>
      🛵
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 10 }}>
              Pilot flow
            </p>
            <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: '2px 0 0' }}>
              Runner-funded allowlist
            </h1>
            <p style={{ color: '#6B6660', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
              {allowlist.length} runner{allowlist.length === 1 ? '' : 's'} eligible
            </p>
          </div>
        </div>
      </div>

      {/* ── PILOT NOTE ───────────────────────────────────────── */}
      <div style={{ margin: '14px 14px 0', background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 14, padding: 14 }}>
        <p className="label-cap" style={{ color: '#FFB800', margin: 0, fontSize: 9 }}>
          Trust-based · pilot
        </p>
        <p style={{ color: '#E0DACE', fontSize: 13, fontWeight: 600, margin: '4px 0 0', lineHeight: 1.5 }}>
          Only add runners you personally vouch for. They&apos;ll be able to accept
          off-campus orders where money is transferred to them before pickup.
        </p>
      </div>

      {/* ── ALLOWLIST ─────────────────────────────────────────── */}
      <div style={{ padding: '14px', flex: 1, overflowY: 'auto' }}>
        {allowlist.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6660', fontSize: 13, fontWeight: 600 }}>
            No runners on the allowlist yet.<br />
            Tap the button below to add one.
          </div>
        ) : (
          allowlist.map((row, i) => (
            <div key={row.runner_id} className={`fade-up-${Math.min(i, 5)}`} style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 16, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,107,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="font-display" style={{ color: '#FF6B2B', fontSize: 13 }}>{initials(row.runner?.full_name)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{row.runner?.full_name ?? 'Unknown'}</p>
                  <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 600, margin: '2px 0 0' }}>{row.runner?.phone}</p>
                </div>
                <button
                  onClick={() => setConfirmRemove(row)}
                  className="press"
                  aria-label={`Remove ${row.runner?.full_name} from allowlist`}
                  style={{ background: 'transparent', color: '#FF3B30', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', minHeight: 36 }}
                >
                  Remove
                </button>
              </div>
              {row.note && (
                <p style={{ fontSize: 12, color: '#A09A8E', fontWeight: 600, margin: '10px 0 0', padding: '8px 10px', background: '#0C0B09', borderRadius: 8, borderLeft: '2px solid #FF6B2B', lineHeight: 1.4 }}>
                  {row.note}
                </p>
              )}
              <p style={{ fontSize: 10, color: '#444038', fontWeight: 600, margin: '10px 0 0', textAlign: 'right' }}>
                Added {new Date(row.added_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          ))
        )}
      </div>

      {/* ── ADD BUTTON (fixed bottom) ─────────────────────────── */}
      <div style={{ padding: '12px 14px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid #2A2825', background: '#0C0B09' }}>
        <button
          onClick={() => setShowAdd(true)}
          className="press"
          style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 15, padding: 16, borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: 52 }}
        >
          + Add runner to allowlist
        </button>
      </div>

      {/* ── ADD SHEET ─────────────────────────────────────────── */}
      {showAdd && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: '#1A1917', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '18px 20px 28px', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: 36, height: 4, background: '#2A2825', borderRadius: 2, margin: '0 auto 14px' }} />
            {selectedRunner ? (
              <>
                <p className="label-cap" style={{ color: '#FF6B2B', margin: 0, fontSize: 10 }}>Add to allowlist</p>
                <h2 className="font-display" style={{ fontSize: 22, margin: '2px 0 12px', color: 'white' }}>{selectedRunner.full_name}</h2>
                <div style={{ background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#6B6660', fontSize: 12, fontWeight: 700 }}>Phone</span>
                    <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>{selectedRunner.phone}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#6B6660', fontSize: 12, fontWeight: 700 }}>Deliveries</span>
                    <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>{selectedRunner.total_deliveries}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6B6660', fontSize: 12, fontWeight: 700 }}>Bank</span>
                    <span style={{ color: selectedRunner.bank_name ? '#1DB954' : '#FFB800', fontSize: 12, fontWeight: 700 }}>
                      {selectedRunner.bank_name ? '✓ On file' : '⚠ Missing'}
                    </span>
                  </div>
                </div>
                {!selectedRunner.bank_name && (
                  <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 10, padding: 10, marginBottom: 14 }}>
                    <p style={{ color: '#FFB800', fontSize: 12, fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
                      This runner has no bank account. They&apos;ll be blocked from accepting runner-funded orders until they add one.
                    </p>
                  </div>
                )}
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#A09A8E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                  Note (optional)
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. vouched by Michael, known since May 2026"
                  rows={2}
                  style={{ width: '100%', background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, color: 'white', fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setSelectedRunner(null)}
                    className="press"
                    style={{ flex: 1, background: '#0C0B09', color: '#A09A8E', border: '1px solid #2A2825', fontWeight: 800, fontSize: 14, padding: 14, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48 }}
                  >
                    Back
                  </button>
                  <button
                    onClick={addRunner}
                    disabled={saving}
                    className="press"
                    style={{ flex: 2, background: saving ? '#cc5522' : '#FF6B2B', color: 'white', border: 'none', fontWeight: 900, fontSize: 14, padding: 14, borderRadius: 12, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, minHeight: 48 }}
                  >
                    {saving ? 'Adding...' : 'Add to allowlist'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="label-cap" style={{ color: '#A09A8E', margin: 0, fontSize: 10 }}>Choose runner</p>
                <h2 className="font-display" style={{ fontSize: 22, margin: '2px 0 14px', color: 'white' }}>Pick who to add</h2>
                <div className="scroll-hide" style={{ overflowY: 'auto', flex: 1, margin: '0 -6px', padding: '0 6px' }}>
                  {candidates.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#6B6660', fontSize: 13, fontWeight: 600, padding: 20 }}>
                      All runners are already on the allowlist.
                    </p>
                  ) : (
                    candidates.map(r => (
                      <button
                        key={r.user_id}
                        onClick={() => setSelectedRunner(r)}
                        className="press"
                        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 12, padding: 12, marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: 60 }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,107,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span className="font-display" style={{ color: '#FF6B2B', fontSize: 12 }}>{initials(r.full_name)}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>{r.full_name}</p>
                          <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 600, margin: '2px 0 0' }}>
                            {r.total_deliveries} deliveries {r.bank_name ? '· bank on file' : '· ⚠ no bank'}
                          </p>
                        </div>
                        <span style={{ color: '#6B6660', fontSize: 18 }}>→</span>
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => setShowAdd(false)}
                  className="press"
                  style={{ width: '100%', background: 'transparent', color: '#A09A8E', border: '1px solid #2A2825', fontWeight: 800, fontSize: 14, padding: 14, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12, minHeight: 48 }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── REMOVE CONFIRMATION ───────────────────────────────── */}
      {confirmRemove && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setConfirmRemove(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: '#1A1917', borderRadius: 20, padding: 20, border: '1px solid rgba(255,59,48,0.3)' }}>
            <p className="label-cap" style={{ color: '#FF3B30', margin: 0, fontSize: 10 }}>Confirm removal</p>
            <h2 className="font-display" style={{ fontSize: 20, margin: '4px 0 12px', color: 'white' }}>Remove {confirmRemove.runner?.full_name}?</h2>
            <p style={{ color: '#A09A8E', fontSize: 13, fontWeight: 600, margin: '0 0 14px', lineHeight: 1.5 }}>
              They&apos;ll no longer be able to accept runner-funded orders. Type <span style={{ fontFamily: 'monospace', color: '#FF3B30', fontWeight: 800 }}>REMOVE</span> to confirm.
            </p>
            <input
              value={removeText}
              onChange={e => setRemoveText(e.target.value)}
              placeholder="Type REMOVE"
              style={{ width: '100%', background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, color: 'white', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 14, minHeight: 44 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setConfirmRemove(null); setRemoveText('') }}
                className="press"
                style={{ flex: 1, background: '#0C0B09', color: '#A09A8E', border: '1px solid #2A2825', fontWeight: 800, fontSize: 14, padding: 12, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                onClick={() => removeRunner(confirmRemove)}
                disabled={removeText !== 'REMOVE'}
                className="press"
                style={{ flex: 1, background: removeText === 'REMOVE' ? '#FF3B30' : '#2A0A0A', color: removeText === 'REMOVE' ? 'white' : '#6B6660', border: 'none', fontWeight: 900, fontSize: 14, padding: 12, borderRadius: 10, cursor: removeText === 'REMOVE' ? 'pointer' : 'not-allowed', fontFamily: 'inherit', minHeight: 44 }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
