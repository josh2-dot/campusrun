// app/api/runner/bank-details/route.ts
//
// Save/update the runner's payout bank details on runner_profiles.
// Independent of any payout request — the runner needs bank details
// on file BEFORE they can accept runner-funded orders (which happens
// before any earnings roll in).
//
// Called from the "Payout account" section on the runner profile
// screen. Idempotent — safe to call every time the form is saved.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { bankName, accountNumber } = await request.json() as {
    bankName?: string; accountNumber?: string
  }

  if (!bankName?.trim() || !accountNumber?.trim()) {
    return NextResponse.json({ error: 'Bank name and account number required' }, { status: 400 })
  }
  // Nigerian bank accounts are always 10 digits — anything else is a
  // client-side typo, catch it now rather than at payout time.
  const acct = accountNumber.trim()
  if (!/^\d{10}$/.test(acct)) {
    return NextResponse.json({ error: 'Account number must be 10 digits' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((profile as any)?.role !== 'runner' && (profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Only runners can save bank details' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('runner_profiles')
    .update({ bank_name: bankName.trim(), account_number: acct })
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
