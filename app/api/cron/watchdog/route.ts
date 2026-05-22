// app/api/cron/watchdog/route.ts
// Called every 10 minutes by cron-job.org (free tier)
// Handles two jobs in one pass:
//   1. Activate scheduled orders whose scheduled_for <= now
//   2. Re-broadcast or escalate orders stuck in awaiting_runner

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser, sendPushToAvailableRunners, sendPushToAdmins } from '@/lib/send-push'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('[watchdog] Unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  console.log('[watchdog] Running at', now.toISOString())

  const results = {
    stale_cancelled:     0,
    scheduled_activated: 0,
    pools_closed:        0,
    stuck_rebroadcast:   0,
    stuck_escalated:     0,
  }

  /* ────────────────────────────────────────────────────────
     JOB 0 — Cancel stale pending orders (payment never completed)
     Customers who reach checkout but don't pay leave the order in
     'pending' status. Cancel anything older than 15 minutes.
  ──────────────────────────────────────────────────────── */
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString()
  const { data: staleOrders } = await supabase
    .from('orders')
    .select('id, customer_id, order_ref')
    .eq('status', 'pending')
    .lt('created_at', fifteenMinsAgo)

  if (staleOrders?.length) {
    for (const order of staleOrders) {
      await supabase.from('orders').update({
        status:        'cancelled',
        cancelled_by:  'system',
        cancel_reason: 'Payment not completed',
        cancelled_at:  now.toISOString(),
      }).eq('id', order.id)
      await sendPushToUser(order.customer_id, {
        title: 'Order cancelled',
        body: `Order ${order.order_ref} was cancelled because payment wasn\'t completed.`,
        url: '/orders',
        tag: 'order-cancelled',
      })
      results.stale_cancelled++
    }
  }

  /* ────────────────────────────────────────────────────────
     JOB 1 — Activate due scheduled orders
     Find paid orders (status = 'confirmed') that:
       • have a scheduled_for in the past (or within 30m window)
       • have NOT been broadcast yet (broadcast_count = 0)
  ──────────────────────────────────────────────────────── */
  const broadcastWindow = new Date(now.getTime() + 30 * 60 * 1000).toISOString()

  const { data: scheduledOrders } = await supabase
    .from('orders')
    .select('*, restaurant:restaurants(name, location)')
    .eq('status', 'confirmed')           // payment cleared, waiting to be activated
    .eq('broadcast_count', 0)
    .not('scheduled_for', 'is', null)    // only scheduled orders
    .lte('scheduled_for', broadcastWindow) // due now or within 30 minutes

  if (scheduledOrders?.length) {
    console.log('[watchdog] Activating', scheduledOrders.length, 'scheduled orders')
    for (const order of scheduledOrders) {
      await activateOrder(order, supabase, now)
      results.scheduled_activated++
    }
  }


  /* ────────────────────────────────────────────────────────
     JOB 1B — Close due pre-order pools, notify admin
     When a pool's peak_time is reached, mark it 'closed' and send admin
     a summary push so they can dispatch the bulk pickup.
  ──────────────────────────────────────────────────────── */
  const { data: duePools } = await supabase
    .from('pre_order_pools')
    .select('id, restaurant_id, total_orders, total_amount, restaurants(name)')
    .eq('status', 'open')
    .lte('peak_time', now.toISOString())

  if (duePools?.length) {
    for (const pool of duePools) {
      await supabase.from('pre_order_pools')
        .update({ status: 'closed', closed_at: now.toISOString() })
        .eq('id', pool.id)

      const restName = (pool.restaurants as { name?: string } | null)?.name ?? 'Restaurant'
      await sendPushToAdmins({
        title: `\uD83D\uDD14 Bulk ready: ${restName}`,
        body:  `${pool.total_orders} orders · ${'\u20A6'}${(pool.total_amount ?? 0).toLocaleString()} ready for pickup.`,
        url:   '/admin/pre-orders',
        tag:   `pool-${pool.id}`,
      })
      results.pools_closed++
    }
  }

  /* ────────────────────────────────────────────────────────
     JOB 2 — Re-broadcast / escalate stuck orders
     Orders stuck in awaiting_runner for 10+ minutes
  ──────────────────────────────────────────────────────── */
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()

  const { data: stuckOrders, error } = await supabase
    .from('orders')
    .select('*, restaurant:restaurants(name)')
    .eq('status', 'awaiting_runner')
    .lt('broadcast_at', tenMinsAgo)

  if (error) {
    console.error('[watchdog] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (stuckOrders?.length) {
    console.log('[watchdog] Found', stuckOrders.length, 'stuck orders')
    for (const order of stuckOrders) {
      const restaurant = order.restaurant as { name: string } | null

      if (order.broadcast_count >= 2) {
        await supabase.from('orders').update({ status: 'needs_attention' }).eq('id', order.id)
        await sendSMS(process.env.ADMIN_PHONE!, `\uD83D\uDEA8 URGENT: Order ${order.order_ref} unassigned 15+ mins. Manual runner needed.`)
        await sendPushToAdmins({ title: '\uD83D\uDEA8 Order needs manual assignment', body: `${order.order_ref} waiting 15+ mins`, url: '/admin/dashboard', tag: 'needs-attention' })
        results.stuck_escalated++
      } else {
        const { data: runners } = await supabase
          .from('runner_profiles')
          .select('user_id, users(phone)')
          .eq('is_available', true)
          .eq('is_suspended', false)

        if (runners?.length) {
          const msg = `\uD83D\uDD14 Order still available! ${order.order_ref} needs a runner. Earn \u20A6300 from ${restaurant?.name}. Open app now.`
          await Promise.allSettled(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            runners.map((r: any) => {
              const phone = Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone
              return phone ? sendSMS(phone, msg) : Promise.resolve()
            })
          )
          await sendPushToAvailableRunners({ title: '\uD83D\uDD14 Order still waiting!', body: `${order.order_ref} from ${restaurant?.name} needs a runner`, url: '/dashboard', tag: 'new-order' })
          await supabase.from('orders').update({ broadcast_at: now.toISOString(), broadcast_count: order.broadcast_count + 1 }).eq('id', order.id)
          results.stuck_rebroadcast++
        } else {
          await supabase.from('orders').update({ status: 'needs_attention' }).eq('id', order.id)
          await sendSMS(process.env.ADMIN_PHONE!, `\u26A0\uFE0F Order ${order.order_ref} — no runners available. Manual assignment needed.`)
          await sendPushToAdmins({ title: '\u26A0\uFE0F No runners available', body: `Order ${order.order_ref} cannot be assigned`, url: '/admin/dashboard', tag: 'needs-attention' })
          results.stuck_escalated++
        }
      }
    }
  }

  console.log('[watchdog] Done', results)
  return NextResponse.json({ ok: true, ...results })
}

/* ── Helpers ────────────────────────────────────────────── */

async function activateOrder(
  order: Record<string, unknown>,
  supabase: ReturnType<typeof createAdminClient>,
  now: Date
) {
  const restaurant = order.restaurant as { name: string; location?: string } | null

  // Move to awaiting_runner so runners can see it
  await supabase.from('orders').update({
    status:        'awaiting_runner',
    broadcast_at:  now.toISOString(),
    broadcast_count: 1,
  }).eq('id', order.id)

  // Push to customer — their food is now being arranged
  await sendPushToUser(order.customer_id as string, {
    title: '\uD83D\uDD52 Your scheduled order is being arranged!',
    body:  `Order ${order.order_ref} from ${restaurant?.name ?? 'your restaurant'} — finding a runner now.`,
    url:   `/track/${order.id}`,
    tag:   'order-activated',
  })

  // Notify available runners
  const { data: runners } = await supabase
    .from('runner_profiles')
    .select('user_id, users(phone)')
    .eq('is_available', true)
    .eq('is_suspended', false)

  if (!runners?.length) {
    // No runners — escalate immediately
    await supabase.from('orders').update({ status: 'needs_attention' }).eq('id', order.id)
    await sendSMS(process.env.ADMIN_PHONE!, `\u26A0\uFE0F Scheduled order ${order.order_ref} activated but no runners online.`)
    return
  }

  const sms = `\uD83D\uDEF5 New order! ${order.order_ref} — Earn \u20A6300 from ${restaurant?.name}. Drop: ${order.delivery_address}. Open app.`
  await Promise.allSettled(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runners.map((r: any) => {
      const phone = Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone
      return phone ? sendSMS(phone, sms) : Promise.resolve()
    })
  )

  await sendPushToAvailableRunners({
    title: '\uD83D\uDEF5 New order available!',
    body:  `Scheduled order ${order.order_ref} from ${restaurant?.name} — earn \u20A6300`,
    url:   '/dashboard',
    tag:   'new-order',
  })
}

async function sendSMS(phone: string, message: string) {
  if (!process.env.TERMII_API_KEY) { console.log(`[SMS to ${phone}]: ${message}`); return }
  try {
    await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, from: process.env.TERMII_SENDER_ID ?? 'CampusRun', sms: message, type: 'plain', channel: 'generic', api_key: process.env.TERMII_API_KEY }),
    })
  } catch (e) {
    console.error('[watchdog] SMS error:', e)
  }
}
