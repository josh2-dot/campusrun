// app/api/admin/manual-order/parse/route.ts
// Admin/support tool: parse a raw WhatsApp message into a structured order draft.
// Returns parsed items + suggested customer details (if extractable).

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { callClaude, extractJson } from '@/lib/anthropic'

export async function POST(req: NextRequest) {
  const { rawMessage } = await req.json()
  if (!rawMessage || typeof rawMessage !== 'string') {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  // Authz: admin or support only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: caller } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!caller || !['admin', 'support'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch menu
  const { data: restaurants } = await admin
    .from('restaurants')
    .select('id, name, is_open, is_pantry')
    .eq('is_pantry', false)

  const { data: menuItems } = await admin
    .from('menu_items')
    .select('id, name, price, restaurant_id, is_available')
    .eq('is_available', true)

  if (!restaurants || !menuItems) {
    return NextResponse.json({ error: 'Menu unavailable' }, { status: 500 })
  }

  // Build menu reference
  const menuByRestaurant: Record<string, { name: string; isOpen: boolean; items: Array<{ id: string; name: string; price: number }> }> = {}
  for (const r of restaurants) {
    menuByRestaurant[r.id] = { name: r.name, isOpen: r.is_open, items: [] }
  }
  for (const m of menuItems) {
    if (menuByRestaurant[m.restaurant_id]) {
      menuByRestaurant[m.restaurant_id].items.push({ id: m.id, name: m.name, price: m.price })
    }
  }

  const menuRef = Object.entries(menuByRestaurant)
    .map(([rid, r]) => {
      const tag = r.isOpen ? '' : ' [CLOSED]'
      const items = r.items.map(i => `  - "${i.name}" (id: ${i.id}, ₦${i.price})`).join('\n')
      return `RESTAURANT: "${r.name}" (id: ${rid})${tag}\n${items}`
    })
    .join('\n\n')

  const system = `You are parsing a WhatsApp message from a CampusRun customer placing an order. Extract:
1. The food items they want (match against menu)
2. Their hostel/delivery location (if mentioned)
3. Their phone number (if mentioned — Nigerian format)
4. Their name (if mentioned)

Output STRICTLY this JSON (no markdown, no extra text):
{
  "items": [
    {
      "menu_item_id": "uuid",
      "name": "Item name",
      "price": 1500,
      "quantity": 2,
      "restaurant_id": "uuid",
      "restaurant_name": "Restaurant"
    }
  ],
  "delivery_address": "Block C, Room 12" or null,
  "phone": "+2348012345678" or null,
  "customer_name": "Adaobi" or null,
  "notes": "Any special instructions or null",
  "parse_confidence": "high" | "medium" | "low"
}

Rules:
- Only output items from the menu below.
- All items must be from ONE restaurant.
- If restaurant is [CLOSED], set parse_confidence="low".
- Default quantity 1 if not specified.
- Normalize phone numbers to +234 format.

LIVE MENU:
${menuRef}`

  const result = await callClaude({
    system,
    messages: [{ role: 'user', content: `Parse this WhatsApp message:\n\n"${rawMessage}"` }],
    maxTokens: 1024,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  const parsed = extractJson(result.text)
  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ error: 'Could not parse', raw: result.text }, { status: 200 })
  }

  const obj = parsed as Record<string, unknown>
  const rawItems = Array.isArray(obj.items) ? obj.items : []

  // Validate against actual menu
  const validated = []
  for (const it of rawItems) {
    const item = it as Record<string, unknown>
    const menuMatch = menuItems.find(m => m.id === item.menu_item_id)
    if (!menuMatch) continue
    const restMatch = restaurants.find(r => r.id === menuMatch.restaurant_id)
    if (!restMatch) continue
    validated.push({
      menu_item_id:    menuMatch.id,
      name:            menuMatch.name,
      price:           menuMatch.price,
      quantity:        Math.max(1, Math.min(20, Number(item.quantity) || 1)),
      restaurant_id:   menuMatch.restaurant_id,
      restaurant_name: restMatch.name,
      restaurant_is_open: restMatch.is_open,
    })
  }

  return NextResponse.json({
    items: validated,
    delivery_address: (obj.delivery_address as string) ?? null,
    phone: (obj.phone as string) ?? null,
    customer_name: (obj.customer_name as string) ?? null,
    notes: (obj.notes as string) ?? null,
    parse_confidence: (obj.parse_confidence as string) ?? 'low',
  })
}
