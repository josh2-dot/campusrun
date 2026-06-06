// app/api/messages/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendPushToAdmins } from '@/lib/send-push'
import { captureMessage } from '@/lib/sentry'

export async function POST(req: NextRequest) {
  const { messageId, reason } = await req.json()
  if (!messageId) return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Get the message and verify reporter is a participant
  const { data: message } = await admin
    .from('messages')
    .select('id, order_id, text, sender_id, sender_role')
    .eq('id', messageId)
    .single()
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  const { data: order } = await admin
    .from('orders')
    .select('customer_id, runner_id, order_ref')
    .eq('id', message.order_id)
    .single()
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const isParticipant = order.customer_id === user.id || order.runner_id === user.id
  if (!isParticipant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })

  // Mark reported
  await admin.from('messages').update({ reported: true }).eq('id', messageId)

  // Notify admins
  sendPushToAdmins({
    title: `Reported message on ${order.order_ref ?? 'order'}`,
    body: (reason ? `Reason: ${reason}. ` : '') + `Text: ${message.text.slice(0, 80)}`,
    url: `/admin/dashboard`,
  }).catch(() => {})

  captureMessage('Message reported', {
    tags:  { event: 'message_reported' },
    extra: { messageId, orderRef: order.order_ref, reason, reportedBy: user.id },
    level: 'warning',
  })

  return NextResponse.json({ success: true })
}
