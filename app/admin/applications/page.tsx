'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Application {
  id: string
  user_id: string
  matric_number: string
  department: string
  status: string
  applied_at: string
  rejection_reason?: string
  users: { full_name: string; email: string; phone: string } | null
}

function initials(name?: string | null) {
  if (!name) return '?'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[1][0]).toUpperCase()
}

const TABS: { id: 'pending' | 'approved' | 'rejected'; label: string }[] = [
  { id: 'pending',  label: 'Pending'  },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

export default function AdminApplicationsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/home'); return }
      fetchApps()
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchApps() {
    const { data } = await supabase
      .from('runner_applications')
      .select('*, users(full_name, email, phone)')
      .order('applied_at', { ascending: false })
    setApps(data ?? [])
    setLoading(false)
  }

  async function approve(app: Application) {
    setProcessing(true)
    await supabase.from('runner_applications').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', app.id)
    const { data: existing } = await supabase.from('runner_profiles').select('user_id').eq('user_id', app.user_id).single()
    if (!existing) {
      await supabase.from('runner_profiles').insert({ user_id: app.user_id, is_available: false, total_deliveries: 0, total_earnings: 0, rating: 5.0 })
    }
    await supabase.from('users').update({ role: 'runner', matric_number: app.matric_number }).eq('id', app.user_id)
    await fetchApps()
    setProcessing(false)
  }

  async function reject(appId: string) {
    setProcessing(true)
    await supabase.from('runner_applications').update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectReason || 'Application not approved at this time.',
    }).eq('id', appId)
    setRejecting(null)
    setRejectReason('')
    await fetchApps()
    setProcessing(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontSize: 40 }}>📋</div>
  )

  const filtered = apps.filter(a => a.status === tab)
  const pendingCount = apps.filter(a => a.status === 'pending').length

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>

      {/* Header */}
      <div className="dot-texture" style={{ padding: '52px 20px 20px', borderBottom: '1px solid var(--line, #2A2825)' }}>
        <Link href="/admin/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2, #A09A8E)', textDecoration: 'none', marginBottom: 12 }}>
          ← Dashboard
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: 0 }}>Applications</h1>
            <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
              Runner onboarding queue
            </p>
          </div>
          {pendingCount > 0 && (
            <div style={{ background: 'rgba(255,107,43,0.12)', border: '1px solid rgba(255,107,43,0.3)', borderRadius: 20, padding: '5px 12px' }}>
              <span style={{ color: 'var(--accent, #FF6B2B)', fontWeight: 900, fontSize: 13 }}>{pendingCount}</span>
              <span style={{ color: 'var(--accent, #FF6B2B)', fontWeight: 600, fontSize: 11 }}> pending</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', margin: '14px 14px 0', background: 'var(--bg-1, #1A1917)', borderRadius: 12, padding: 4, border: '1px solid var(--line, #2A2825)' }}>
        {TABS.map(t => {
          const on = tab === t.id
          const count = apps.filter(a => a.status === t.id).length
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="press"
              style={{ flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, fontFamily: 'inherit', background: on ? (t.id === 'pending' ? 'var(--accent, #FF6B2B)' : t.id === 'approved' ? 'var(--ok, #1DB954)' : '#444') : 'transparent', color: on ? 'white' : 'var(--ink-3, #6B6660)' }}
            >
              {t.label} ({count})
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>
              {tab === 'pending' ? '🎉' : tab === 'approved' ? '✅' : '🗂️'}
            </div>
            No {tab} applications
          </div>
        ) : filtered.map(app => (
          <div
            key={app.id}
            style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: 16, marginBottom: 10 }}
          >
            {/* Applicant row */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,107,43,0.12)', border: '1px solid rgba(255,107,43,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="font-display" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 14 }}>
                  {initials(app.users?.full_name)}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 15, color: 'white', margin: 0 }}>{app.users?.full_name}</p>
                <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {app.users?.email}
                </p>
              </div>
              <span style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600, flexShrink: 0 }}>
                {new Date(app.applied_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
              </span>
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              <Detail label="Matric" value={app.matric_number} />
              <Detail label="Department" value={app.department} />
            </div>

            {/* Phone */}
            <a
              href={`tel:${app.users?.phone}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--bg-0, #0C0B09)', border: '1px solid var(--line, #2A2825)', color: 'var(--accent, #FF6B2B)', fontWeight: 700, fontSize: 13, padding: '9px', borderRadius: 10, textDecoration: 'none', marginBottom: tab === 'pending' ? 10 : 0 }}
            >
              📞 {app.users?.phone}
            </a>

            {/* Actions */}
            {tab === 'pending' && (
              rejecting === app.id ? (
                <div>
                  <input
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection (optional)"
                    style={{ display: 'block', width: '100%', border: '1px solid var(--line, #2A2825)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', background: 'var(--bg-0, #0C0B09)', color: 'white', boxSizing: 'border-box' as const, marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setRejecting(null); setRejectReason('') }} className="press" style={{ flex: 1, background: 'var(--bg-2, #26241F)', color: 'var(--ink-2, #A09A8E)', fontWeight: 700, fontSize: 13, padding: '11px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                    <button onClick={() => reject(app.id)} disabled={processing} className="press" style={{ flex: 1, background: 'var(--danger, #FF3B30)', color: 'white', fontWeight: 800, fontSize: 13, padding: '11px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: processing ? 0.7 : 1 }}>
                      Confirm Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setRejecting(app.id)} className="press" style={{ flex: 1, background: 'rgba(255,59,48,0.08)', color: 'var(--danger, #FF3B30)', fontWeight: 800, fontSize: 13, padding: '12px', borderRadius: 12, border: '1px solid rgba(255,59,48,0.2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✗ Reject
                  </button>
                  <button onClick={() => approve(app)} disabled={processing} className="press" style={{ flex: 2, background: 'var(--ok, #1DB954)', color: 'white', fontWeight: 800, fontSize: 13, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: processing ? 0.6 : 1 }}>
                    ✓ Approve as Runner
                  </button>
                </div>
              )
            )}

            {tab === 'approved' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok, #1DB954)', display: 'block' }} />
                <span style={{ fontSize: 12, color: 'var(--ok, #1DB954)', fontWeight: 700 }}>Approved as runner</span>
              </div>
            )}

            {tab === 'rejected' && app.rejection_reason && (
              <div style={{ marginTop: 8, background: 'rgba(255,59,48,0.06)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(255,59,48,0.15)' }}>
                <p style={{ fontSize: 11, color: 'var(--danger, #FF3B30)', fontWeight: 600, margin: 0 }}>
                  Reason: {app.rejection_reason}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg-0, #0C0B09)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--line, #2A2825)' }}>
      <p className="label-cap" style={{ fontSize: 9, color: 'var(--ink-3, #6B6660)', margin: '0 0 2px' }}>{label.toUpperCase()}</p>
      <p style={{ fontSize: 12, color: 'white', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
    </div>
  )
}
