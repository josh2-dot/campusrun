// app/api/payments/init/route.ts
// Rate limited: max 2 active orders per customer at a time
// Daily cap: admin-configurable via app_config table (0 = unlimited)
//
// Two payment models handled:
//   restaurant_paid — existing Paystack initialization (returns auth URL)
//   runner_funded   — no Paystack call. Order flips straight to
//                     confirmed → auto-allocation to runners. Customer
//                     will pay the runner directly once one accepts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser, sendPushToAvailableRunners } from '@/lib/send-push'
import { captureError } from '@/lib/sentry'

const ACTIVE_STATUSES = ['pending', 'confirmed', 'awaiting_runner', 'runner_assigned', 'preparing',
  'runner_funded_awaiting_payment', 'runner_funded_payment_confirmed', 'picked_up']

export async function POST(request: NextRequest) {
  const { orderId, amount, email } = await request.json()

  if (!orderId || !amount || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ── 1. Per-customer rate limit ───────────────────────────────────
  const { count: activeCount } = await admin
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', user.id)
    .in('status', ACTIVE_STATUSES)

  if ((activeCount ?? 0) >= 2) {
    return NextResponse.json({
      error: 'You already have 2 active orders. Please wait for them to be delivered before placing another.',
    }, { status: 429 })
  }

  // ── 2. Load order for payment_model + auto-allocation ─────────────
  const { data: orderRaw } = await admin
    .from('orders')
    .select('id, payment_model, restaurant_id, food_total, delivery_address, order_ref')
    .eq('id', orderId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // ── 3. Runner-funded shortcut ────────────────────────────────────
  // No Paystack, no float check (nothing coming out of CampusRun's
  // account for these orders). Order flips to confirmed → we broadcast
  // to available runners. First allowlisted runner to accept takes it.
  if (order.payment_model === 'runner_funded') {
    await admin
      .from('orders')
      .update({ status: 'confirmed' })
      .eq('id', orderId)

    await sendPushToUser(user.id, {
      title: '✅ Order placed',
      body: `Order ${order.order_ref} placed. Finding a runner for you now.`,
      url: `/track/${orderId}`,
      tag: 'order-placed',
    })

    await triggerAutoAllocation(orderId, admin)

    return NextResponse.json({
      skipPayment: true,
      trackUrl: `/track/${orderId}`,
    })
  }

  // ── 4. Float capacity check (restaurant-paid only) ────────────────
  const { data: balanceRow }     = await admin.from('app_config').select('value').eq('key', 'float_balance').single()
  const { data: bufferRow }      = await admin.from('app_config').select('value').eq('key', 'float_safety_buffer').single()
  const { data: avgCostResult }  = await admin.rpc('estimate_order_net_cost')

  const floatBalance  = parseFloat(balanceRow?.value ?? '0')
  const safetyBuffer  = parseFloat(bufferRow?.value ?? '10000')
  const estCost       = parseFloat(String(avgCostResult ?? '3500'))

  if (floatBalance - estCost < safetyBuffer) {
    captureError(new Error('Float depleted, blocked order'), {
      tags: { event: 'float_depleted' },
      level: 'warning',
      extra: { floatBalance, estCost, safetyBuffer },
    })
    return NextResponse.json({
      error: `We're temporarily at capacity — back to taking orders very soon. Check our WhatsApp status for updates 🙏`,
      code: 'FLOAT_DEPLETED',
    }, { status: 503 })
  }

  // ── 5. Pre-order detection ──────────────────────────────────────────────
  try {
    if (order?.restaurant_id) {
      const { data: rest } = await admin
        .from('restaurants')
        .select('pre_order_enabled, peak_open_time, pre_order_window_minutes, post_peak_delay_minutes')
        .eq('id', order.restaurant_id)
        .single()

      const { computeWindow } = await import('@/lib/pre-order')
      const state = computeWindow(new Date(), rest ?? {})

      if (state.phase === 'pre_order_open') {
        const poolDate = state.peakAt.toISOString().slice(0, 10)
        let { data: pool } = await admin
          .from('pre_order_pools')
          .select('id, total_orders, total_amount')
          .eq('restaurant_id', order.restaurant_id)
          .eq('pool_date', poolDate)
          .maybeSingle()

        if (!pool) {
          const { data: newPool } = await admin
            .from('pre_order_pools')
            .insert({
              restaurant_id: order.restaurant_id,
              pool_date:     poolDate,
              peak_time:     state.peakAt.toISOString(),
            })
            .select('id, total_orders, total_amount')
            .single()
          pool = newPool
        }

        if (pool) {
          await admin.from('orders').update({
            is_pre_order:      true,
            pre_order_pool_id: pool.id,
            scheduled_for:     state.peakAt.toISOString(),
          }).eq('id', orderId)

          await admin.from('pre_order_pools').update({
            total_orders: (pool.total_orders ?? 0) + 1,
            total_amount: (pool.total_amount ?? 0) + (order.food_total ?? 0),
          }).eq('id', pool.id)
        }
      }
    }
  } catch (err) {
    console.error('[pre-order tagging]', err)
  }

  // ── 6. Paystack initialization ─────────────────────────────────────────
  try {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amount * 100,
        reference: `CR_${orderId}_${Date.now()}`,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/callback`,
        metadata: { order_id: orderId },
        channels: ['bank_transfer', 'ussd', 'card'],
      }),
    })

    const data = await res.json()

    if (!data.status) {
      return NextResponse.json({ error: data.message }, { status: 400 })
    }

    await supabase.from('payments').insert({
      order_id: orderId,
      paystack_ref: data.data.reference,
      amount,
      status: 'pending',
      channel: 'transfer',
    })

    return NextResponse.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    })
  } catch {
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Auto-allocation
// ───────────────────────────────────────────────────────────────────
//  Same logic as the webhook's post-payment allocation, but called
//  directly here for runner-funded orders (they don't go through the
//  charge.success path). Broadcast to available runners so an
//  allowlisted one can accept.
// ═══════════════════════════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function triggerAutoAllocation(orderId: string, admin: any) {
  const { data: orderRaw } = await admin
    .from('orders')
    .select('*, restaurant:restaurants(name, location)')
    .eq('id', orderId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderRaw as any
  if (!order) return

  const { data: runners } = await admin
    .from('runner_profiles')
    .select('user_id, users(phone, full_name)')
    .eq('is_available', true)

  if (!runners?.length) {
    await admin.from('orders').update({
      status:          'awaiting_runner',
      broadcast_at:    new Date().toISOString(),
      broadcast_count: 1,
    }).eq('id', orderId)
    if (process.env.ADMIN_PHONE) {
      await sendSMS(process.env.ADMIN_PHONE, `⚠️ CampusRun: Order ${order.order_ref} confirmed but no runners online. Watchdog will retry.`)
    }
    return
  }

  const msg = `🛵 New order ${order.order_ref}! Earn ₦${order.runner_earnings ?? 300}. From: ${order.restaurant?.name}. Drop: ${order.delivery_address}. Accept: ${process.env.NEXT_PUBLIC_APP_URL}/order/${orderId}`
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runners.map((r: any) => {
      const phone = Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone
      return phone ? sendSMS(phone, msg) : Promise.resolve()
    })
  )

  await sendPushToAvailableRunners({
    title: '🛵 New order available!',
    body: `Order ${order.order_ref} — earn ₦${order.runner_earnings ?? 300} from ${order.restaurant?.name ?? 'restaurant'}.`,
    url: '/dashboard',
    tag: 'new-order',
  })

  await admin.from('orders').update({
    status: 'awaiting_runner',
    broadcast_at: new Date().toISOString(),
    broadcast_count: 1,
  }).eq('id', orderId)
}

async function sendSMS(phone: string, message: string) {
  if (!process.env.TERMII_API_KEY) { console.log(`[SMS to ${phone}]: ${message}`); return }
  await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: phone, from: process.env.TERMII_SENDER_ID ?? 'CampusRun', sms: message, type: 'plain', channel: 'generic', api_key: process.env.TERMII_API_KEY }),
  }).catch(() => {})
}
