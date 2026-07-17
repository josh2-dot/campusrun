// app/api/admin/restaurants/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? user : null
}

export async function GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = createAdminClient()
  const [{ data: restaurants }, { data: items }] = await Promise.all([
    admin.from('restaurants').select('*').order('name'),
    admin.from('menu_items').select('*').order('category').order('name'),
  ])
  return NextResponse.json({ restaurants: restaurants ?? [], items: items ?? [] })
}

export async function POST(request: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { action, id, value } = await request.json()
  const admin = createAdminClient()

  // ── Restaurant-level actions ─────────────────────────────
  if (action === 'toggle_restaurant') {
    await admin.from('restaurants').update({ is_open: value }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  // Flag an unregistered off-campus restaurant to route through the
  // runner-funded flow. When true, orders to this restaurant get
  // payment_model='runner_funded' at creation and the runner walks in
  // as a paying customer instead of relying on a Paystack subaccount.
  // See app/api/runner/accept + app/api/payments/webhook.
  if (action === 'toggle_runner_funded') {
    await admin.from('restaurants').update({ requires_runner_funded: value }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  if (action === 'update_bank_field') {
    const { field, value: fieldVal } = value as { field: string; value: string }
    const ALLOWED = ['bank_name', 'account_number', 'account_name'] as const
    if (!ALLOWED.includes(field as typeof ALLOWED[number])) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }
    await admin.from('restaurants').update({ [field]: fieldVal?.trim() || null }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  // ── Menu item actions ────────────────────────────────────
  if (action === 'toggle_featured') {
    await admin.from('menu_items').update({ is_featured: value }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  if (action === 'toggle_item') {
    await admin.from('menu_items').update({ is_available: value }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  if (action === 'update_price') {
    if (!value || value < 0) return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
    await admin.from('menu_items').update({ price: value }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  // ── Portion config ───────────────────────────────────────
  if (action === 'update_portions') {
    const {
      has_portions,
      portion_min_price,
      portion_first_step,
      portion_step,
      portion_max_price,
    } = value as {
      has_portions:      boolean
      portion_min_price: number | null
      portion_first_step: number | null
      portion_step:      number | null
      portion_max_price: number | null
    }
    await admin.from('menu_items').update({
      has_portions,
      portion_min_price:  has_portions ? portion_min_price  : null,
      portion_first_step: has_portions ? portion_first_step : null,
      portion_step:       has_portions ? portion_step       : null,
      portion_max_price:  has_portions ? portion_max_price  : null,
    }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  // ── Add item ─────────────────────────────────────────────
  if (action === 'add_item') {
    const { restaurant_id, name, price, category, description } = value as {
      restaurant_id: string; name: string; price: number; category: string; description?: string
    }
    const { data, error } = await admin.from('menu_items').insert({
      restaurant_id, name: name.trim(), price, category, description: description?.trim() || null, is_available: true,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, item: data })
  }

  // ── Delete item ──────────────────────────────────────────
  if (action === 'delete_item') {
    await admin.from('menu_items').delete().eq('id', id)
    return NextResponse.json({ success: true })
  }

    // ── Pre-order config ─────────────────────────────────────
  if (action === 'update_hours') {
    const { open_time, close_time, is_manually_closed } = value as {
      open_time?: string | null
      close_time?: string | null
      is_manually_closed?: boolean
    }
    const updates: Record<string, unknown> = {}
    if (open_time !== undefined)          updates.open_time = open_time || null
    if (close_time !== undefined)         updates.close_time = close_time || null
    if (is_manually_closed !== undefined) updates.is_manually_closed = is_manually_closed

    // For manual close override: bypass the sync function entirely and set is_open directly
    // (works even if the sync_restaurant_hours function isn't installed)
    if (is_manually_closed === true)  updates.is_open = false
    if (is_manually_closed === false && open_time === undefined && close_time === undefined) {
      // Re-opening from a force-close — use the function if available, else just set to true
      // Actual sync happens below
    }

    const { error: updateErr } = await admin.from('restaurants').update(updates).eq('id', id)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Try to sync via RPC. Surface error if the function isn't installed.
    const { error: rpcErr } = await admin.rpc('sync_restaurant_hours')
    if (rpcErr) {
      return NextResponse.json({
        success: true,
        warning: 'Saved, but auto-sync function is missing. Run sql/rain_and_hours_fix.sql.',
        rpcError: rpcErr.message,
      })
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'sync_hours_now') {
    // Manual trigger for syncing all restaurants' is_open based on their schedules.
    // Useful when admin sets hours and wants to verify immediately, or when cron isn't running.
    const { data: count, error: rpcErr } = await admin.rpc('sync_restaurant_hours')
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message + ' — run sql/rain_and_hours_fix.sql' }, { status: 500 })
    }
    return NextResponse.json({ success: true, synced: count ?? 0 })
  }

  if (action === 'toggle_rain') {
    const { active } = value as { active?: boolean }
    const newValue = active ? 'true' : 'false'
    const { error } = await admin
      .from('app_config')
      .upsert({ key: 'rain_active', value: newValue })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, rain_active: active })
  }

  if (action === 'update_pre_order') {
    const { pre_order_enabled, peak_open_time, pre_order_window_minutes, post_peak_delay_minutes } = value as {
      pre_order_enabled?: boolean
      peak_open_time?: string | null
      pre_order_window_minutes?: number | null
      post_peak_delay_minutes?: number | null
    }
    const updates: Record<string, unknown> = {}
    if (pre_order_enabled !== undefined)        updates.pre_order_enabled = pre_order_enabled
    if (peak_open_time !== undefined)           updates.peak_open_time = peak_open_time || null
    if (pre_order_window_minutes !== undefined) updates.pre_order_window_minutes = pre_order_window_minutes ?? 120
    if (post_peak_delay_minutes !== undefined)  updates.post_peak_delay_minutes  = post_peak_delay_minutes  ?? 30
    await admin.from('restaurants').update(updates).eq('id', id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
