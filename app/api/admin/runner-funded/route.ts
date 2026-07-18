// app/api/admin/runner-funded/route.ts
//
// Admin API for managing the runner-funded allowlist.
// Uses createAdminClient() so writes bypass RLS on runner_funded_allowlist.
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

  // Allowlist rows with runner name/phone joined
  const { data: rows } = await admin
    .from('runner_funded_allowlist')
    .select('runner_id, added_at, note, runner:users!runner_id(full_name, phone)')
    .order('added_at', { ascending: false })

  // All runners (candidates for adding)
  const { data: runners } = await admin
    .from('runner_profiles')
    .select('user_id, total_deliveries, bank_name, account_number, users!inner(full_name, phone)')
    .order('total_deliveries', { ascending: false })

  const allowlisted = new Set((rows ?? []).map(r => r.runner_id))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates = (runners ?? []).filter((r: any) => !allowlisted.has(r.user_id)).map((r: any) => ({
    user_id: r.user_id,
    full_name: Array.isArray(r.users) ? r.users[0]?.full_name : r.users?.full_name ?? '?',
    phone: Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone ?? '',
    total_deliveries: r.total_deliveries ?? 0,
    bank_name: r.bank_name,
    account_number: r.account_number,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allowlist = (rows ?? []).map((r: any) => ({
    runner_id: r.runner_id,
    added_at: r.added_at,
    note: r.note,
    runner: Array.isArray(r.runner) ? r.runner[0] ?? null : r.runner,
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
