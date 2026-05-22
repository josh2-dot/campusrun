import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser, sendPushToAvailableRunners } from '@/lib/send-push'
import { transferToRestaurant } from '../transfer/restaurant'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')

  if (!reference) return NextResponse.redirect(new URL('/home', request.url))

  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  })

  const { data } = await res.json()

  if (data?.status === 'success') {
    const orderId = data.metadata?.order_id
    if (orderId) {
      const supabase = createAdminClient()

      // Fetch status AND scheduled_for in one query
      const { data: order } = await supabase
        .from('orders')
        .select('status, customer_id, order_ref, scheduled_for')
        .eq('id', orderId)
        .single()

      await supabase.from('payments').update({
        status: 'success',
        channel: data.channel,
        paid_at: new Date().toISOString(),
      }).eq('paystack_ref', reference)

      if (order && (order.status === 'pending' || order.status === 'confirmed')) {
        await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId)

        const isScheduled = order.scheduled_for && new Date(order.scheduled_for) > new Date()

        if (isScheduled) {
          // ── Scheduled order: confirm payment, DO NOT broadcast yet ──
          // The watchdog will activate this order at scheduled_for time.
          const timeLabel = new Date(order.scheduled_for!).toLocaleTimeString('en-NG', {
            hour: '2-digit', minute: '2-digit',
          })
          await sendPushToUser(order.customer_id, {
            title: '\u2705 Payment confirmed \u2014 order scheduled!',
            body: `Your order ${order.order_ref} is confirmed. We'll find a runner for ${timeLabel}.`,
            url: `/track/${orderId}`,
            tag: 'order-scheduled',
          })
        } else {
          // ── Immediate order: push customer + broadcast to runners ──
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

      return NextResponse.redirect(new URL(`/track/${orderId}`, request.url))
    }
  }

  return NextResponse.redirect(new URL('/home', request.url))
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
    await supabase.from('orders').update({ status: 'needs_attention', broadcast_count: 1 }).eq('id', orderId)
    await sendSMS(process.env.ADMIN_PHONE!, `\u26A0\uFE0F CampusRun: Order ${order.order_ref} has no available runners.`)
    return
  }

  const msg = `\uD83D\uDEF5 New order ${order.order_ref}! Earn \u20A6300. From: ${order.restaurant?.name}. Drop: ${order.delivery_address}. Accept in app: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
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
