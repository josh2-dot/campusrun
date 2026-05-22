// app/api/payments/transfer/restaurant.ts
// Float model: queues a transfer instruction instead of calling Paystack directly.
// You pay restaurants from your account via /admin/payments.

import { createAdminClient } from '@/lib/supabase/server'

export async function transferToRestaurant(orderId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_ref, food_total, restaurant_id, restaurant_paid')
    .eq('id', orderId)
    .single()

  if (!order) return
  if (order.restaurant_paid) return   // idempotent
  if ((order.food_total ?? 0) <= 0) return

  await supabase.from('restaurant_transfer_queue').insert({
    order_id:      orderId,
    restaurant_id: order.restaurant_id,
    order_ref:     order.order_ref,
    amount:        order.food_total,
    status:        'pending',
  })
}
