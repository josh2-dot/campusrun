// POST /api/admin/restaurants/onboard
// Creates a Paystack transfer recipient for a restaurant and saves the code.
// Call this once per restaurant when you onboard them.
//
// Body: { restaurantId, name, bankCode, accountNumber }
// bankCode examples: "058" GTBank, "033" UBA, "044" Access, "011" First Bank
// Full list: https://api.paystack.co/bank

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { restaurantId, name, bankCode, accountNumber } = await request.json()

  if (!restaurantId || !name || !bankCode || !accountNumber) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  try {
    // First resolve the account to verify it's valid
    const resolveRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    )
    const resolveData = await resolveRes.json()

    if (!resolveData.status) {
      return NextResponse.json({ error: 'Could not verify bank account. Check account number and bank code.' }, { status: 400 })
    }

    const accountName = resolveData.data.account_name

    // Create transfer recipient
    const res = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'nuban',
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN',
      }),
    })

    const data = await res.json()

    if (!data.status) {
      return NextResponse.json({ error: data.message }, { status: 400 })
    }

    const recipientCode = data.data.recipient_code // e.g. "RCP_xxxxxxxxxxxxxxx"

    // Save to restaurants table
    await supabase
      .from('restaurants')
      .update({
        paystack_recipient_code: recipientCode,
        requires_prepayment: true,
        account_number: accountNumber,
        bank_code: bankCode,
      })
      .eq('id', restaurantId)

    return NextResponse.json({
      success: true,
      recipient_code: recipientCode,
      account_name: accountName,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to create recipient' }, { status: 500 })
  }
}

// GET /api/admin/restaurants/onboard?restaurantId=xxx
// Check if a restaurant is already onboarded
export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const restaurantId = searchParams.get('restaurantId')

  if (!restaurantId) return NextResponse.json({ error: 'Missing restaurantId' }, { status: 400 })

  const { data } = await supabase
    .from('restaurants')
    .select('name, requires_prepayment, paystack_recipient_code, account_number, bank_code')
    .eq('id', restaurantId)
    .single()

  return NextResponse.json({ restaurant: data })
}
