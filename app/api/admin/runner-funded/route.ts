// app/api/admin/runner-funded/route.ts
//
// Admin API for managing the runner-funded allowlist.
// Uses createAdminClient() so writes bypass RLS on runner_funded_allowlist.
//
// The read paths use explicit lookups instead of PostgREST joins for
// the same reason as api/admin/runner-transfers: the schema cache may
// not have picked up the FKs on the new runner_funded_allowlist table
// yet. Older, well-established joins (runner_profiles → users) still
// work fine because their FKs are already cached.
//
//   GET    — returns { allowlist, candidates }
//   POST   — { action: 'add', runner_id, note? } | { action: 'remove', runner_id }

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.role === 'admin' ? user : null
}

export async function GET() {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Allowlist rows — no joins, straight select.
  const { data: rowsRaw } = await admin
    .from('runner_funded_allowlist')
    .select('runner_id, added_at, note, added_by')
    .order('added_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (rowsRaw ?? []) as any[]

  // Explicit lookup for runner name/phone
  const allowlistRunnerIds = Array.from(new Set(rows.map(r => r.runner_id)))
  const { data: allowlistUsersData } = allowlistRunnerIds.length
    ? await admin.from('users').select('id, full_name, phone').in('id', allowlistRunnerIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allowlistUsers = (allowlistUsersData ?? []) as any[]
  const userById = new Map(allowlistUsers.map(u => [u.id, u]))

  const allowlist = rows.map(r => ({
    runner_id: r.runner_id,
    added_at: r.added_at,
    note: r.note,
    runner: userById.get(r.runner_id) ?? null,
  }))

  // Candidates — all runners not already on the allowlist. The runner_profiles
  // → users join is an old, stable FK so this select works even before schema
  // cache reload.
  const { data: runnersData } = await admin
    .from('runner_profiles')
    .select('user_id, total_deliveries, bank_name, account_number, users!inner(full_name, phone)')
    .order('total_deliveries', { ascending: false })

  const allowlisted = new Set(rows.map(r => r.runner_id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates = ((runnersData ?? []) as any[]).filter(r => !allowlisted.has(r.user_id)).map(r => ({
    user_id: r.user_id,
    full_name: Array.isArray(r.users) ? r.users[0]?.full_name : r.users?.full_name ?? '?',
    phone: Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone ?? '',
    total_deliveries: r.total_deliveries ?? 0,
    bank_name: r.bank_name,
    account_number: r.account_number,
  }))

  return NextResponse.json({ allowlist, candidates })
}

export async function POST(request: NextRequest) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json() as {
    action: 'add' | 'remove'; runner_id?: string; note?: string
  }

  if (!body.runner_id) {
    return NextResponse.json({ error: 'runner_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (body.action === 'add') {
    const { error } = await admin.from('runner_funded_allowlist').insert({
      runner_id: body.runner_id,
      added_by: user.id,
      note: body.note?.trim() || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (body.action === 'remove') {
    const { error } = await admin
      .from('runner_funded_allowlist')
      .delete()
      .eq('runner_id', body.runner_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
