// app/api/restaurants/pre-order-window/route.ts
// Public endpoint: tells the customer what pre-order phase a restaurant is in
// right now. Used by home, restaurant, checkout, and track pages.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeWindow } from '@/lib/pre-order'

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get('restaurant_id')
  if (!restaurantId) return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: rest } = await supabase
    .from('restaurants')
    .select('pre_order_enabled, peak_open_time, pre_order_window_minutes, post_peak_delay_minutes')
    .eq('id', restaurantId)
    .single()

  if (!rest) return NextResponse.json({ phase: 'inactive' })

  const state = computeWindow(new Date(), rest)

  // Serialize Dates to ISO
  if ('peakAt' in state) {
    return NextResponse.json({
      phase: state.phase,
      peakAt: state.peakAt.toISOString(),
      ...('opensAt' in state ? { opensAt: state.opensAt.toISOString() } : {}),
      ...('closesAt' in state ? { closesAt: state.closesAt.toISOString() } : {}),
      ...('postPeakUntil' in state ? { postPeakUntil: state.postPeakUntil.toISOString() } : {}),
    })
  }
  return NextResponse.json(state)
}
