// app/api/preorder-subscribe/route.ts
// Toggle pre-order notification subscription for a restaurant.
// User taps "Notify me" → adds row. Taps again → removes row.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { restaurantId } = await request.json()
  if (!restaurantId) return NextResponse.json({ error: 'Missing restaurantId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Check current subscription state
  const { data: existing } = await admin
    .from('pre_order_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  if (existing) {
    // Toggle off
    await admin.from('pre_order_subscriptions').delete().eq('id', existing.id)
    return NextResponse.json({ subscribed: false })
  } else {
    // Toggle on
    await admin.from('pre_order_subscriptions').insert({
      user_id:       user.id,
      restaurant_id: restaurantId,
    })
    return NextResponse.json({ subscribed: true })
  }
}

// GET — check if current user is subscribed to a restaurant's pre-orders
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const restaurantId = searchParams.get('restaurantId')
  if (!restaurantId) return NextResponse.json({ subscribed: false })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ subscribed: false })

  const { data } = await supabase
    .from('pre_order_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  return NextResponse.json({ subscribed: !!data })
}
