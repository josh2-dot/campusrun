// app/api/runner/cancel/route.ts
// Runner cancels — logs strike, re-broadcasts to runners, notifies customer

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { RUNNER_CANCEL_REASONS } from '@/lib/cancel-reasons'
import { sendPushToUser, sendPushToAvailableRunners } from '@/lib/send-push'

const VALID_REASON_KEYS = RUNNER_CANCEL_REASONS.map(r => r.key)

async function sendSMS(phone: string, message: string) {
  if (!process.env.TERMII_API_KEY) return
  await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: phone, from: process.env.TERMII_SENDER_ID ?? 'CampusRun', sms: message, type: 'plain', channel: 'generic', api_key: process.env.TERMII_API_KEY }),
  }).catch(() => {})
}

export async function POST(request: NextRequest) {
  const { orderId, reason } = await request.json()

  if (!orderId || !reason) return NextResponse.json({ error: 'Missing orderId or reason' }, { status: 400 })
  if (!VALID_REASON_KEYS.includes(reason)) return NextResponse.json({ error: 'Invalid cancel reason' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'runner') return NextResponse.json({ error: 'Only runners can use this endpoint' }, { status: 403 })

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, status, runner_id, order_ref, customer_id, restaurant:restaurants(name)')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.runner_id !== user.id) return NextResponse.json({ error: 'Not your order' }, { status: 403 })
  if (order.status === 'picked_up' || order.status === 'delivered') {
    return NextResponse.json({ success: false, error: 'You cannot cancel after picking up the food.' }, { status: 409 })
  }
  if (!['runner_assigned', 'preparing', 'awaiting_runner'].includes(order.status)) {
    return NextResponse.json({ error: 'Order is not in a cancellable state' }, { status: 409 })
  }

  // Release back to pool
  const { data: updated, error: updateError } = await admin
    .from('orders')
    .update({ status: 'awaiting_runner', runner_id: null, broadcast_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()

  if (updateError || !updated) return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })

  // Log strike
  await admin.from('runner_strikes').insert({ runner_id: user.id, order_id: orderId, reason })

  // Check suspension
  const { data: strikeResult } = await admin.rpc('check_and_suspend_runner', { p_runner_id: user.id })
  const activeStrikes = (strikeResult as number) ?? 0
  const suspended = activeStrikes >= 3

  const restaurantRaw = order.restaurant
const restaurant = Array.isArray(restaurantRaw) ? restaurantRaw[0] as { name: string } | null : restaurantRaw as { name: string } | null
  // Notify customer — their runner dropped the order
  await sendPushToUser(order.customer_id, {
    title: '🔄 Finding a new runner',
    body: `Your runner couldn't complete the pickup. We're finding you a new one for order ${order.order_ref}.`,
    url: `/track/${orderId}`,
    tag: 'runner-dropped',
  })

  // Get customer phone for SMS fallback
  const { data: customerData } = await admin.from('users').select('phone').eq('id', order.customer_id).single()
  if (customerData?.phone) {
    await sendSMS(customerData.phone, `CampusRun: Your runner for order ${order.order_ref} had to cancel. We're finding you a new runner now. Sorry for the delay!`)
  }

  // Re-broadcast to available runners
  await sendPushToAvailableRunners({
    title: '🛵 Order available!',
    body: `${order.order_ref} from ${restaurant?.name} needs a runner — earn ₦300`,
    url: '/dashboard',
    tag: 'new-order',
  })

  // SMS available runners
  const { data: runners } = await admin
    .from('runner_profiles')
    .select('user_id, users(phone)')
    .eq('is_available', true)
    .eq('is_suspended', false)
    .neq('user_id', user.id) // don't re-notify the runner who just cancelled

  if (runners?.length) {
    const msg = `🔔 Order ${order.order_ref} from ${restaurant?.name} needs a new runner! Earn ₦300. Open CampusRun now.`
    await Promise.allSettled(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runners.map((r: any) => {
        const phone = Array.isArray(r.users) ? r.users[0]?.phone : r.users?.phone
        return phone ? sendSMS(phone, msg) : Promise.resolve()
      })
    )
  }

  return NextResponse.json({
    success: true,
    order: updated,
    strike: {
      active_strikes: activeStrikes,
      suspended,
      message: suspended
        ? 'You have been suspended for 30 days due to 3 cancellations.'
        : `Warning: ${activeStrikes}/3 cancellations in the last 30 days.`,
    },
  })
}
