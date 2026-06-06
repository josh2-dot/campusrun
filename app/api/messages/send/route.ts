// app/api/messages/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/send-push'
import { filterContactInfo, checkRateLimit, CHAT_OPEN_STATUSES } from '@/lib/messaging'
import { captureError } from '@/lib/sentry'

export async function POST(req: NextRequest) {
  const { orderId, text } = await req.json()

  if (!orderId || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
  }
  if (trimmed.length > 1000) {
    return NextResponse.json({ error: 'Message too long (1000 chars max)' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit per user
  const rl = checkRateLimit(user.id)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Sending too fast. Try again in a moment.' }, { status: 429 })
  }

  const admin = createAdminClient()

  // Get the order to verify membership + status
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, status, customer_id, runner_id, order_ref')
    .eq('id', orderId)
    .single()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Determine sender role from membership
  let senderRole: 'customer' | 'runner'
  if (order.customer_id === user.id) {
    senderRole = 'customer'
  } else if (order.runner_id === user.id) {
    senderRole = 'runner'
  } else {
    return NextResponse.json({ error: 'Not a participant in this order' }, { status: 403 })
  }

  // Chat must be open (during active order)
  if (!CHAT_OPEN_STATUSES.includes(order.status as typeof CHAT_OPEN_STATUSES[number])) {
    return NextResponse.json({ error: 'Chat is closed for this order' }, { status: 403 })
  }

  // Filter contact info / off-platform references
  const { clean, blocked } = filterContactInfo(trimmed)

  // Insert message
  const { data: message, error: insertErr } = await admin
    .from('messages')
    .insert({
      order_id:    orderId,
      sender_id:   user.id,
      sender_role: senderRole,
      text:        clean,
    })
    .select()
    .single()

  if (insertErr) {
    captureError(insertErr, { tags: { event: 'message_send_failed' }, userId: user.id, extra: { orderId } })
    return NextResponse.json({ error: 'Could not send message' }, { status: 500 })
  }

  // Send push notification to the OTHER party (best-effort, non-blocking)
  const recipientId = senderRole === 'customer' ? order.runner_id : order.customer_id
  if (recipientId) {
    sendPushToUser(recipientId, {
      title: `Message about order ${order.order_ref ?? ''}`,
      body: clean.slice(0, 80) + (clean.length > 80 ? '…' : ''),
      url: senderRole === 'customer' ? `/order/${orderId}` : `/track/${orderId}`,
      tag: `msg-${orderId}`, // bundles consecutive messages into one notification
    }).catch(() => {})
  }

  return NextResponse.json({ message, blocked })
}
