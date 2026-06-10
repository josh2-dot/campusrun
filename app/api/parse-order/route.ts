// app/api/parse-order/route.ts
// Keyword-based parser. No external LLM. Fast, free, deterministic.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseOrder } from '@/lib/order-parser'

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 })
  }
  if (text.length > 500) {
    return NextResponse.json({ error: 'Message too long' }, { status: 400 })
  }

  const admin = createAdminClient()

  const [{ data: restaurants }, { data: menuItems }] = await Promise.all([
    admin.from('restaurants').select('id, name, is_open, is_pantry').eq('is_pantry', false),
    admin.from('menu_items').select('id, name, price, restaurant_id, is_available').eq('is_available', true),
  ])

  if (!restaurants || !menuItems) {
    return NextResponse.json({ error: 'Menu unavailable' }, { status: 500 })
  }

  const result = parseOrder(text, restaurants, menuItems)

  return NextResponse.json({
    ok: result.ok,
    items: result.items,
    message: result.message,
    confidence: result.confidence,
    needs_clarification: !result.ok,
    suggestions: result.suggestions,
  })
}
