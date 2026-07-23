// app/api/runner/accept/route.ts
//
// Runner accepts an order. Two paths:
//
//   restaurant_paid (existing) — runner_assigned, restaurant already
//   paid via Paystack subaccount.
//
//   runner_funded (direct pay) — customer sends money directly to the
//   runner's bank account. Sets order to runner_funded_awaiting_payment
//   with a 20-minute deadline. Customer sees the runner's bank details;
//   runner confirms receipt via their bank alert. No Paystack call.
//   Runner accumulates a debt to CampusRun (delivery+plate fees minus
//   runner earnings) that they settle up separately.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'

const RUNNER_FUNDED_PER_ORDER_CAP_NAIRA = Number(
  process.env.RUNNER_FUNDED_PER_ORDER_CAP_NAIRA ?? '8000'
)

const PAYMENT_DEADLINE_MINUTES = Number(
  process.env.RUNNER_FUNDED_PAYMENT_DEADLINE_MIN ?? '20'
)

export async function POST(request: NextRequest) {
  const { orderId } = await request.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('role, full_name').eq('id', user.id).single()

  if (profile?.role !== 'runner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only runners or admins can accept orders' }, { status: 403 })
  }
  const isAdminDelivery = profile.role === 'admin'

  const admin = createAdminClient()

  const { data: preOrderRaw } = await admin
    .from('orders')
    .select('id, payment_model, food_total, delivery_fee, runner_earnings, status, runner_id')
    .eq('id', orderId)
    .single()

  if (!preOrderRaw) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preOrder = preOrderRaw as any
  if (preOrder.runner_id) {
    return NextResponse.json({ success: false, error: 'Order already taken' }, { status: 409 })
  }
  if (!['awaiting_runner', 'confirmed'].includes(preOrder.status)) {
    return NextResponse.json({ success: false, error: 'Order not available' }, { status: 409 })
  }

  const isRunnerFunded = preOrder.payment_model === 'runner_funded'

  if (isRunnerFunded) {
    if (!isAdminDelivery) {
      const { data: allowRow } = await admin
        .from('runner_funded_allowlist')
        .select('runner_id')
        .eq('runner_id', user.id)
        .maybeSingle()

      if (!allowRow) {
        return NextResponse.json({
          success: false,
          error: "This is a runner-funded order — you're not on the allowlist yet. Contact CampusRun if you'd like to be added.",
          code: 'NOT_ALLOWLISTED',
        }, { status: 403 })
      }
    }

    // Customer pays food_total + delivery_fee. plate_fee doesn't exist
    // as a column — checkout folds it into food_total on insert.
    const foodTotal = preOrder.food_total ?? 0
    const deliveryFee = preOrder.delivery_fee ?? 0
    const customerPayment = foodTotal + deliveryFee

    if (customerPayment > RUNNER_FUNDED_PER_ORDER_CAP_NAIRA) {
      return NextResponse.json({
        success: false,
        error: `Order value exceeds the current runner-funded cap of ₦${RUNNER_FUNDED_PER_ORDER_CAP_NAIRA.toLocaleString()}. Skip this one.`,
        code: 'OVER_CAP',
      }, { status: 400 })
    }

    const { data: runnerProfileRaw } = await admin
      .from('runner_profiles')
      .select('bank_name, account_number')
      .eq('user_id', user.id)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runnerProfile = runnerProfileRaw as any

    if (!runnerProfile?.bank_name || !runnerProfile?.account_number) {
      return NextResponse.json({
        success: false,
        error: 'Add your bank account first — Profile → Payout account.',
        code: 'NO_PAYOUT_ACCOUNT',
      }, { status: 400 })
    }
  }

  const targetStatus = isRunnerFunded ? 'runner_funded_awaiting_payment' : 'runner_assigned'

  const updates: Record<string, unknown> = {
    runner_id: user.id,
    status: targetStatus,
    runner_assigned_at: new Date().toISOString(),
    admin_delivered: isAdminDelivery,
  }

  if (isRunnerFunded) {
    const foodTotal = preOrder.food_total ?? 0
    const deliveryFee = preOrder.delivery_fee ?? 0
    const runnerEarnings = preOrder.runner_earnings ?? 0

    // Customer sends food_total + delivery_fee (same as they'd pay via
    // Paystack). Runner spends food_total at the restaurant, keeps
    // runner_earnings, and owes CampusRun the remainder of the delivery
    // fee (which is what would normally cover platform_cut).
    updates.runner_funded_payment_expected_amount = foodTotal + deliveryFee
    updates.runner_funded_payment_deadline = new Date(
      Date.now() + PAYMENT_DEADLINE_MINUTES * 60 * 1000
    ).toISOString()
    updates.platform_owed_amount = deliveryFee - runnerEarnings
  }

  const { data, error } = await admin
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .is('runner_id', null)
    .in('status', ['awaiting_runner', 'confirmed'])
    .select('*, customer:users!customer_id(full_name, phone), restaurant:restaurants(name)')

  if (error || !data?.length) {
    return NextResponse.json({ success: false, error: 'Order already taken' }, { status: 409 })
  }

  const order = data[0]
  const restaurant = order.restaurant as { name: string } | null

  if (isRunnerFunded) {
    await sendPushToUser(order.customer_id, {
      title: '💸 Send payment to your runner',
      body: `Runner ${profile.full_name} is ready. Send ₦${(updates.runner_funded_payment_expected_amount as number).toLocaleString()} to complete the order.`,
      url: `/order/${orderId}`,
      tag: 'send-payment',
    })

    if (process.env.ADMIN_PHONE && process.env.TERMII_API_KEY) {
      const msg = `💸 Runner-funded accepted\nOrder: ${order.order_ref}\nRunner: ${profile.full_name}\nCustomer to send: ₦${(updates.runner_funded_payment_expected_amount as number).toLocaleString()}\nOwes platform: ₦${updates.platform_owed_amount}`
      await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: process.env.ADMIN_PHONE,
          from: process.env.TERMII_SENDER_ID ?? 'CampusRun',
          sms: msg, type: 'plain', channel: 'generic',
          api_key: process.env.TERMII_API_KEY,
        }),
      }).catch(() => {})
    }
  } else {
    await sendPushToUser(order.customer_id, {
      title: '🛵 Runner on the way!',
      body: `${profile.full_name} is heading to ${restaurant?.name} for your order`,
      url: `/track/${orderId}`,
      tag: 'runner-assigned',
    })
  }

  return NextResponse.json({ success: true, order: data[0], isRunnerFunded })
}
