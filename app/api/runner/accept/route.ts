// app/api/runner/accept/route.ts
//
// Runner accepts an order. Two flows:
//
//   restaurant_paid  → runner_assigned (existing Paystack-subaccount flow)
//   runner_funded    → runner_funded_awaiting_payment (customer will
//                      pay the runner directly)
//
// PARANOID ERROR SURFACING: every failure returns the actual reason,
// not a generic "Order not found". This is intentional — the prior
// implementations masked schema errors and RLS blocks as "Order not
// found", making them impossible to diagnose. If this route fails,
// the response body will tell you WHY on the first try.

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
  const { orderId } = await request.json().catch(() => ({}))
  if (!orderId) {
    return NextResponse.json({ success: false, error: 'Missing orderId in request body' }, { status: 400 })
  }

  // ── Auth ──────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ success: false, error: `Auth failed: ${userErr?.message ?? 'no user'}` }, { status: 401 })
  }

  const { data: profileRaw, error: profileErr } = await supabase
    .from('users').select('role, full_name').eq('id', user.id).single()
  if (profileErr || !profileRaw) {
    return NextResponse.json({ success: false, error: `Profile lookup failed: ${profileErr?.message ?? 'no profile'}` }, { status: 500 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = profileRaw as any
  if (profile.role !== 'runner' && profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Only runners or admins can accept orders' }, { status: 403 })
  }
  const isAdminDelivery = profile.role === 'admin'

  const admin = createAdminClient()

  // ── Preflight order load — surface the actual reason on failure ──
  // Only select columns that exist in the base schema. Do NOT reference
  // plate_fee (that column does not exist — plate cost is folded into
  // food_total by checkout).
  const { data: preOrderRaw, error: orderErr } = await admin
    .from('orders')
    .select('id, order_ref, payment_model, food_total, delivery_fee, runner_earnings, status, runner_id, customer_id, restaurant_id')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) {
    // This is where prior implementations silently returned "Order not
    // found". Now we surface the actual PostgREST error so schema-cache
    // issues, missing columns, and RLS blocks are all diagnosable.
    return NextResponse.json({
      success: false,
      error: `Order lookup failed: ${orderErr.message}`,
      code: orderErr.code,
      hint: orderErr.hint,
    }, { status: 500 })
  }
  if (!preOrderRaw) {
    return NextResponse.json({ success: false, error: `No order with id ${orderId}` }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preOrder = preOrderRaw as any

  if (preOrder.runner_id) {
    return NextResponse.json({ success: false, error: 'Order already taken by another runner' }, { status: 409 })
  }
  if (!['awaiting_runner', 'confirmed'].includes(preOrder.status)) {
    return NextResponse.json({ success: false, error: `Order is in status "${preOrder.status}", can't accept` }, { status: 409 })
  }

  const isRunnerFunded = preOrder.payment_model === 'runner_funded'

  // ── Runner-funded gates ──────────────────────────────────────────
  if (isRunnerFunded) {
    if (!isAdminDelivery) {
      const { data: allowRow, error: allowErr } = await admin
        .from('runner_funded_allowlist')
        .select('runner_id')
        .eq('runner_id', user.id)
        .maybeSingle()

      if (allowErr) {
        return NextResponse.json({
          success: false,
          error: `Allowlist lookup failed: ${allowErr.message}`,
        }, { status: 500 })
      }
      if (!allowRow) {
        return NextResponse.json({
          success: false,
          error: "You're not on the runner-funded allowlist. Contact CampusRun to be added.",
          code: 'NOT_ALLOWLISTED',
        }, { status: 403 })
      }
    }

    const foodTotal = preOrder.food_total ?? 0
    const deliveryFee = preOrder.delivery_fee ?? 0
    const customerPayment = foodTotal + deliveryFee

    if (customerPayment > RUNNER_FUNDED_PER_ORDER_CAP_NAIRA) {
      return NextResponse.json({
        success: false,
        error: `Order value (\u20A6${customerPayment.toLocaleString()}) exceeds runner-funded cap of \u20A6${RUNNER_FUNDED_PER_ORDER_CAP_NAIRA.toLocaleString()}. Skip this one.`,
        code: 'OVER_CAP',
      }, { status: 400 })
    }

    // Runner needs bank details on file so the customer can see them.
    const { data: runnerProfileRaw, error: bankErr } = await admin
      .from('runner_profiles')
      .select('bank_name, account_number')
      .eq('user_id', user.id)
      .maybeSingle()

    if (bankErr) {
      return NextResponse.json({
        success: false,
        error: `Bank details lookup failed: ${bankErr.message}`,
      }, { status: 500 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runnerProfile = runnerProfileRaw as any
    if (!runnerProfile?.bank_name || !runnerProfile?.account_number) {
      return NextResponse.json({
        success: false,
        error: 'Add your bank details first — Profile → Payout account.',
        code: 'NO_PAYOUT_ACCOUNT',
      }, { status: 400 })
    }
  }

  // ── The assignment update ────────────────────────────────────────
  // Compute all new field values BEFORE the update so we can log them
  // if the update fails.
  const nowIso = new Date().toISOString()
  const targetStatus = isRunnerFunded ? 'runner_funded_awaiting_payment' : 'runner_assigned'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    runner_id: user.id,
    status: targetStatus,
    runner_assigned_at: nowIso,
    admin_delivered: isAdminDelivery,
  }

  if (isRunnerFunded) {
    const foodTotal = preOrder.food_total ?? 0
    const deliveryFee = preOrder.delivery_fee ?? 0
    const runnerEarnings = preOrder.runner_earnings ?? 0

    // Customer sends food_total + delivery_fee. Runner owes CampusRun
    // delivery_fee - runner_earnings (equals platform_cut on default fees).
    updates.runner_funded_payment_expected_amount = foodTotal + deliveryFee
    updates.runner_funded_payment_deadline = new Date(
      Date.now() + PAYMENT_DEADLINE_MINUTES * 60 * 1000
    ).toISOString()
    updates.platform_owed_amount = deliveryFee - runnerEarnings
  }

  const { data: updated, error: updateErr } = await admin
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .is('runner_id', null)
    .in('status', ['awaiting_runner', 'confirmed'])
    .select('id, order_ref, customer_id, restaurant_id')

  if (updateErr) {
    return NextResponse.json({
      success: false,
      error: `Update failed: ${updateErr.message}`,
      code: updateErr.code,
      hint: updateErr.hint,
    }, { status: 500 })
  }
  if (!updated?.length) {
    return NextResponse.json({
      success: false,
      error: 'Order was taken by another runner just now, or status changed. Refresh.',
    }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = updated[0] as any

  // ── Explicit restaurant lookup (avoid PostgREST join in return payload) ──
  const { data: restaurantRaw } = await admin
    .from('restaurants').select('name').eq('id', order.restaurant_id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurantName = (restaurantRaw as any)?.name ?? 'the restaurant'

  // ── Notifications ────────────────────────────────────────────────
  if (isRunnerFunded) {
    await sendPushToUser(order.customer_id, {
      title: '\uD83D\uDCB8 Send payment to your runner',
      body: `${profile.full_name} is ready. Send \u20A6${(updates.runner_funded_payment_expected_amount).toLocaleString()} to their account to complete the order.`,
      url: `/track/${orderId}`,
      tag: 'send-payment',
    })

    if (process.env.ADMIN_PHONE && process.env.TERMII_API_KEY) {
      const msg = `\uD83D\uDCB8 Runner-funded accepted\nOrder: ${order.order_ref}\nRunner: ${profile.full_name}\nCustomer to send: \u20A6${(updates.runner_funded_payment_expected_amount).toLocaleString()}\nOwes platform: \u20A6${updates.platform_owed_amount}`
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
      title: '\uD83D\uDEF5 Runner on the way!',
      body: `${profile.full_name} is heading to ${restaurantName} for your order`,
      url: `/track/${orderId}`,
      tag: 'runner-assigned',
    })
  }

  return NextResponse.json({ success: true, orderId, isRunnerFunded })
}
