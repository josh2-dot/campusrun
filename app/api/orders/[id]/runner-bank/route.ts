// app/api/orders/[id]/runner-bank/route.ts
//
// Returns the runner's bank details (bank_name, account_number, name)
// to the customer on this specific order, in the awaiting-payment state.
//
// Why this endpoint exists:
// The customer's track page needs to display the runner's bank details.
// Client-side reads against runner_profiles are blocked by RLS (correct
// — customers shouldn't be able to enumerate runner bank info). So we
// gate access here: caller must be the customer_id on the specific
// order, AND the order must be in runner_funded_awaiting_payment status.

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params

  const supabase = await createClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ error: `Auth failed: ${userErr?.message ?? 'no user'}` }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: orderRaw, error: orderErr } = await admin
    .from('orders')
    .select('id, customer_id, runner_id, status, payment_model')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) {
    return NextResponse.json({ error: `Order lookup failed: ${orderErr.message}` }, { status: 500 })
  }
  if (!orderRaw) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any

  // Auth: only the customer on this order can read
  if (order.customer_id !== user.id) {
    return NextResponse.json({ error: 'Not your order' }, { status: 403 })
  }
  if (order.payment_model !== 'runner_funded') {
    return NextResponse.json({ error: 'Not a runner-funded order' }, { status: 400 })
  }
  if (!order.runner_id) {
    return NextResponse.json({ error: 'No runner assigned yet' }, { status: 409 })
  }
  // Bank details are only released while the customer needs to send
  // payment. After confirmation, no reason to keep exposing them.
  if (order.status !== 'runner_funded_awaiting_payment') {
    return NextResponse.json({ error: `Order not in awaiting-payment state (${order.status})` }, { status: 409 })
  }

  // Fetch runner name + bank details together
  const [{ data: userRow }, { data: profileRow }] = await Promise.all([
    admin.from('users').select('full_name, phone').eq('id', order.runner_id).maybeSingle(),
    admin.from('runner_profiles').select('bank_name, account_number').eq('user_id', order.runner_id).maybeSingle(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runnerUser = userRow as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runnerProfile = profileRow as any

  if (!runnerProfile?.bank_name || !runnerProfile?.account_number) {
    return NextResponse.json({
      error: 'Runner has no bank details on file',
      hint: 'This should have been caught at accept-time; something got out of sync.',
    }, { status: 500 })
  }

  return NextResponse.json({
    full_name: runnerUser?.full_name ?? 'Your runner',
    phone: runnerUser?.phone ?? null,
    bank_name: runnerProfile.bank_name,
    account_number: runnerProfile.account_number,
  })
}
