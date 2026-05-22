// app/api/runner/request-payout/route.ts
// Runner submits a payout request — notifies admin via WhatsApp/email

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { bankName, accountNumber, accountName, amount } = await request.json()

  if (!bankName || !accountNumber || !accountName || !amount) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'runner') return NextResponse.json({ error: 'Only runners can request payouts' }, { status: 403 })

  const admin = createAdminClient()

  // Check there's no pending request already
  const { data: existing } = await admin
    .from('payout_requests')
    .select('id')
    .eq('runner_id', user.id)
    .eq('status', 'pending')
    .single()

  if (existing) {
    return NextResponse.json({ error: 'You already have a pending payout request' }, { status: 409 })
  }

  // Insert the request
  const { error } = await admin.from('payout_requests').insert({
    runner_id: user.id,
    amount,
    bank_name: bankName,
    account_number: accountNumber,
    account_name: accountName,
    status: 'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify admin via WhatsApp deep link (server-side SMS fallback)
  const msg = `💰 CampusRun Payout Request\nRunner: ${profile.full_name}\nAmount: ₦${amount.toLocaleString()}\nBank: ${bankName}\nAccount: ${accountNumber}\nName: ${accountName}\n\nApprove in admin panel.`

  if (process.env.ADMIN_PHONE && process.env.TERMII_API_KEY) {
    await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: process.env.ADMIN_PHONE,
        from: process.env.TERMII_SENDER_ID ?? 'CampusRun',
        sms: msg,
        type: 'plain',
        channel: 'generic',
        api_key: process.env.TERMII_API_KEY,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
