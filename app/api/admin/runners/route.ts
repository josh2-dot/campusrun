// app/api/admin/runners/route.ts
// Server-side route using service role key — bypasses RLS so admin can see all runners

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  // Verify caller is admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Fetch all runner profiles with user info — service role bypasses RLS
  const { data: profiles } = await admin
    .from('runner_profiles')
    .select('*, users(full_name, phone)')
    .order('is_suspended', { ascending: false })

  // Fetch strikes from last 30 days
  const { data: strikes } = await admin
    .from('runner_strikes')
    .select('*')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })

  const rows = (profiles ?? []).map(p => ({
    ...p,
    strikes: (strikes ?? []).filter(s => s.runner_id === p.user_id),
    activeStrikes: (strikes ?? []).filter(s => s.runner_id === p.user_id).length,
  }))

  return NextResponse.json({ runners: rows })
}

export async function POST(request: Request) {
  // Admin actions: unsuspend or clear strikes
  const { action, runnerId } = await request.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  if (action === 'unsuspend') {
    await admin.from('runner_profiles').update({
      is_suspended: false,
      suspended_until: null,
      suspension_note: null,
      is_available: false,
    }).eq('user_id', runnerId)
    return NextResponse.json({ success: true })
  }

  if (action === 'clear_strikes') {
    await admin.from('runner_strikes').delete().eq('runner_id', runnerId)
    // Also unsuspend if they were suspended
    await admin.from('runner_profiles').update({
      is_suspended: false,
      suspended_until: null,
      suspension_note: null,
    }).eq('user_id', runnerId)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
