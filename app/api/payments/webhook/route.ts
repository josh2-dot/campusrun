// app/api/payments/webhook/route.ts
//
// Paystack webhook handler. Only handles restaurant_paid orders now —
// runner-funded orders bypass Paystack entirely (customer sends money
// directly to runner's bank account, no charge or transfer webhooks
// fire for them).

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser, sendPushToAvailableRunners } from '@/lib/send-push'
import { transferToRestaurant } from '../transfer/restaurant'
import { captureError } from '@/lib/sentry'

export async function POST(request: NextRequest) {
  const body      = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(body)
    .digest('hex')

  if (hash !== signature) {
    captureError(new Error('Webhook signature validation failed'), {
      tags:  { event: 'webhook_signature_invalid' },
      level: 'warning',
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(body)

  if (event.event === 'charge.success') {
    const { reference, metadata } = event.data
    const orderId = metadata?.order_id
    if (!orderId) return NextResponse.json({ received: true })

    const supabase = createAdminClient()

    await supabase
      .from('payments')
      .update({ status: 'success', channel: event.data.channel, paid_at: new Date().toISOString() })
      .eq('paystack_ref', reference)

    const { data: orderRaw } = await supabase
      .from('orders')
      .select('status, customer_id, order_ref, scheduled_for, payment_model')
      .eq('id', orderId)
      .single()

    if (!orderRaw) return NextResponse.json({ received: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = orderRaw as any
    if (!['pending', 'confirmed'].includes(order.status)) {
      return NextResponse.json({ received: true })
    }
    // Defensive: runner-funded orders shouldn't hit this path (they're
    // confirmed at /api/payments/init) but skip cleanly if they do.
    if (order.payment_model === 'runner_funded') {
      return NextResponse.json({ received: true })
    }

    await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId)

    const isScheduled = order.scheduled_for && new Date(order.scheduled_for) > new Date()

    if (isScheduled) {
      const timeLabel = new Date(order.scheduled_for!).toLocaleTimeString('en-NG', {
        hour: '2-digit', minute: '2-digit',
      })
      await sendPushToUser(order.customer_id, {
        title: '\u2705 Payment confirmed — order scheduled!',
        body: `Your order ${order.order_ref} is confirmed. We'll find a runner for ${timeLabel}.`,
        url: `/track/${orderId}`,
        tag: 'order-scheduled',
      })
    } else {
      await transferToRestaurant(orderId)
      await sendPushToUser(order.customer_id, {
        title: '\u2705 Payment received!',
        body: `Order ${order.order_ref} confirmed. Finding a runner for you now.`,
        url: `/track/${orderId}`,
        tag: 'order-confirmed',
      })
      await triggerAutoAllocation(orderId, supabase)
    }
  }

  return NextResponse.json({ received: true })
}

async function triggerAutoAllocation(orderId: string, supabase: ReturnType<typeof createAdminClient>) {
  const { data: order } = await supabase
    .from('orders')
    .select('*, restaurant:restaurants(name, location)')
    .eq('id', orderId)
    .single()

  if (!order) return

  const { data: runners } = await supabase
    .from('runner_profiles')
    .select('user_id, users(phone, full_name)')
    .eq('is_available', true)

  if (!runners?.length) {
    await supabase.from('orders').update({
      status:          'awaiting_runner',
      broadcast_at:    new Date().toISOString(),
      broadcast_count: 1,
    }).eq('id', orderId)
    await sendSMS(process.env.ADMIN_PHONE!, `\u26A0\uFE0F CampusRun: Order ${order.order_ref} confirmed but no runners online. Watchdog will retry.`)
    return
  }

  const msg = `\uD83D\uDEF5 New order ${order.order_ref}! Earn \u20A6300. From: ${order.restaurant?.name}. Drop: ${order.delivery_address}. Accept: ${process.env.NEXT_PUBLIC_APP_URL}/order/${orderId}`
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runners.map((r: any) => {
      const phone = Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone
      return phone ? sendSMS(phone, msg) : Promise.resolve()
    })
  )

  await sendPushToAvailableRunners({
    title: '\uD83D\uDEF5 New order available!',
    body: `Order ${order.order_ref} \u2014 earn \u20A6300 from ${order.restaurant?.name ?? 'restaurant'}.`,
    url: '/dashboard',
    tag: 'new-order',
  })

  await supabase.from('orders').update({
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
