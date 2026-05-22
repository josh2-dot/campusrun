// app/api/orders/rate/route.ts
// Customer rates runner AND restaurant after delivery. One rating per order.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { orderId, stars, comment, restaurantStars } = await request.json()

  if (!orderId || !stars || stars < 1 || stars > 5) {
    return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
  }
  if (restaurantStars !== undefined && (restaurantStars < 1 || restaurantStars > 5)) {
    return NextResponse.json({ error: 'Invalid restaurant rating' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, status, customer_id, runner_id, restaurant_id')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.customer_id !== user.id) return NextResponse.json({ error: 'Not your order' }, { status: 403 })
  if (order.status !== 'delivered') return NextResponse.json({ error: 'Order not yet delivered' }, { status: 409 })
  if (!order.runner_id) return NextResponse.json({ error: 'No runner to rate' }, { status: 409 })

  const { data: existing } = await admin
    .from('ratings')
    .select('id')
    .eq('order_id', orderId)
    .single()

  if (existing) return NextResponse.json({ error: 'Already rated' }, { status: 409 })

  // Insert rating with both runner and restaurant stars
  const { error } = await admin.from('ratings').insert({
    order_id:        orderId,
    runner_id:       order.runner_id,
    customer_id:     user.id,
    stars,
    comment:         comment?.trim() || null,
    restaurant_id:   order.restaurant_id,
    restaurant_stars: restaurantStars ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
