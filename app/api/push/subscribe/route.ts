// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { subscription, deviceHint } = await request.json()
  if (!subscription?.endpoint) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  await admin.from('push_subscriptions').upsert({
    user_id: user.id,
    subscription,
    device_hint: deviceHint ?? 'unknown',
  }, { onConflict: 'user_id,device_hint' })

  return NextResponse.json({ success: true })
}
