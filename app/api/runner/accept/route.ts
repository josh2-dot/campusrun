// app/api/runner/accept/route.ts
//
// Runner accepts an order. Two paths depending on the order's
// payment_model:
//
//   restaurant_paid (existing) — set runner_assigned; the restaurant
//   was already paid by the payment webhook. Runner picks up
//   pre-paid food.
//
//   runner_funded (new) — set runner_funded_pending_transfer; queue
//   a transfer to the runner's own bank account. The runner walks
//   in and pays the restaurant themselves once the transfer lands.
//   Only allowlisted runners can take these orders. Orders over the
//   per-order cap are rejected. Existing order_status transitions
//   are preserved for restaurant_paid — the new states only apply
//   to the runner-funded flow.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'
import { queueRunnerTransfer } from '../../payments/transfer/runner'

// Config — read from env with a safe fallback. 800000 kobo = ₦8,000.
const RUNNER_FUNDED_PER_ORDER_CAP_NAIRA = Number(
  process.env.RUNNER_FUNDED_PER_ORDER_CAP_NAIRA ?? '8000'
)

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP_NUMBER ?? '2348068404839'

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

  // ── Preflight: fetch payment_model + amount to know which branch. ─
  // We do this BEFORE the assignment so we can reject over-cap orders
  // without leaving the order in a half-accepted state.
  const { data: preOrderRaw } = await admin
    .from('orders')
    .select('id, payment_model, food_total, runner_earnings, status, runner_id')
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

  // ── Runner-funded eligibility gate ────────────────────────────────
  if (isRunnerFunded) {
    // Admins can always fulfil (used for personal deliveries during pilot)
    if (!isAdminDelivery) {
      const { data: allowRow } = await admin
        .from('runner_funded_allowlist')
        .select('runner_id')
        .eq('runner_id', user.id)
        .maybeSingle()

      if (!allowRow) {
        return NextResponse.json({
          success: false,
          error: "This is a runner-funded order — you're not on the allowlist yet. Contact Lymora if you'd like to be added.",
          code: 'NOT_ALLOWLISTED',
        }, { status: 403 })
      }
    }

    const totalAmount = (preOrder.food_total ?? 0) + (preOrder.runner_earnings ?? 0)
    if (totalAmount > RUNNER_FUNDED_PER_ORDER_CAP_NAIRA) {
      return NextResponse.json({
        success: false,
        error: `Order value exceeds the current runner-funded cap of ₦${RUNNER_FUNDED_PER_ORDER_CAP_NAIRA.toLocaleString()}. Skip this one.`,
        code: 'OVER_CAP',
      }, { status: 400 })
    }

    // Runner must have bank details on file to be paid.
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

  // ── Assignment (atomic — matches original guard pattern) ──────────
  const targetStatus = isRunnerFunded ? 'runner_funded_pending_transfer' : 'runner_assigned'

  const { data, error } = await admin
    .from('orders')
    .update({
      runner_id: user.id,
      status: targetStatus,
      runner_assigned_at: new Date().toISOString(),
      admin_delivered: isAdminDelivery,
    })
    .eq('id', orderId)
    .is('runner_id', null)
    .in('status', ['awaiting_runner', 'confirmed'])
    .select('*, customer:users!customer_id(full_name), restaurant:restaurants(name)')

  if (error || !data?.length) {
    return NextResponse.json({ success: false, error: 'Order already taken' }, { status: 409 })
  }

  const order = data[0]
  const restaurant = order.restaurant as { name: string } | null

  // ── Fire the Paystack transfer (runner-funded only) ───────────────
  if (isRunnerFunded) {
    const result = await queueRunnerTransfer(orderId)
    if (!result.ok) {
      // Transfer didn't fire. Roll back the acceptance so the order is
      // takeable again by another runner. Common reasons at this stage:
      //   - Runner has no bank details on file (should be caught by the
      //     preflight check but defense in depth)
      //   - Paystack balance too low
      //   - OTP is enabled on the Paystack account (config error)
      //   - Bank code lookup failed
      await admin
        .from('orders')
        .update({ runner_id: null, status: 'awaiting_runner', runner_assigned_at: null })
        .eq('id', orderId)

      // Special-case OTP so the admin gets a clearly actionable message.
      // Everything else surfaces as the raw Paystack reason.
      const isOtpConfig = result.code === 'OTP_REQUIRED'
      return NextResponse.json({
        success: false,
        error: isOtpConfig
          ? "Paystack OTP is on — admin needs to disable it in Paystack settings."
          : `Couldn't send funds: ${result.reason}`,
        code: result.code,
      }, { status: isOtpConfig ? 500 : 502 })
    }

    // If Paystack completed synchronously (test mode / instant live
    // transfer), advance the order past pending_transfer straight to
    // awaiting_pickup. Otherwise leave it in pending_transfer — the
    // webhook will advance it when transfer.success arrives.
    if (result.initialStatus === 'success') {
      await admin
        .from('orders')
        .update({ status: 'runner_funded_awaiting_pickup' })
        .eq('id', orderId)
    }

    // Notify Lymora — runner-funded transfers are still worth eyeballing
    // during pilot, even though they're automated now.
    if (process.env.ADMIN_PHONE && process.env.TERMII_API_KEY) {
      const statusLabel = result.initialStatus === 'success' ? 'sent' : 'pending'
      const msg = `💸 Runner-funded transfer ${statusLabel}\nOrder: ${order.order_ref}\nRunner: ${profile.full_name}\nAmount: ₦${result.amount.toLocaleString()}\nRef: ${result.transferRef}`
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

    // Push runner. Language depends on whether the funds have landed.
    if (result.initialStatus === 'success') {
      await sendPushToUser(user.id, {
        title: '💸 Funds sent — go buy',
        body: `₦${result.amount.toLocaleString()} for ${order.order_ref} is in your account.`,
        url: `/order/${orderId}`,
        tag: 'funds-sent',
      })
    } else {
      await sendPushToUser(user.id, {
        title: '⏳ Processing your transfer',
        body: `₦${result.amount.toLocaleString()} for ${order.order_ref} — you'll get a ping when it lands.`,
        url: `/order/${orderId}`,
        tag: 'transfer-processing',
      })
    }
  }

  // Push to customer regardless of model — from their POV the language
  // is the same: a runner is on the way.
  await sendPushToUser(order.customer_id, {
    title: '🛵 Runner on the way!',
    body: `${profile.full_name} is heading to ${restaurant?.name} for your order`,
    url: `/track/${orderId}`,
    tag: 'runner-assigned',
  })

  return NextResponse.json({
    success: true,
    order: data[0],
    isRunnerFunded,
    adminWhatsApp: isRunnerFunded ? ADMIN_WHATSAPP : undefined,
  })
}
