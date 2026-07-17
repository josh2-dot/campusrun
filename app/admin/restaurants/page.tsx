'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
interface RestaurantWithBank extends Restaurant {
  open_time?:          string | null
  close_time?:         string | null
  is_manually_closed?: boolean
  bank_name?:          string | null
  account_number?:     string | null
  account_name?:       string | null
  pre_order_enabled?:  boolean
  peak_open_time?:     string | null
  pre_order_window_minutes?: number
  post_peak_delay_minutes?: number
}

import type { Restaurant, MenuItem } from '@/types'

const N = '\u20A6'
const CATEGORIES = ['Main', 'Side', 'Drink', 'Snack', 'Dessert', 'Protein', 'Swallow']

// ── Portion form state type ──────────────────────────────
interface PortionForm {
  has_portions:       boolean
  portion_min_price:  string
  portion_first_step: string
  portion_step:       string
  portion_max_price:  string
}

function defaultPortionForm(item: MenuItem): PortionForm {
  const m = item as MenuItem & {
    has_portions?: boolean
    portion_min_price?: number
    portion_first_step?: number
    portion_step?: number
    portion_max_price?: number
  }
  return {
    has_portions:       m.has_portions       ?? false,
    portion_min_price:  String(m.portion_min_price  ?? item.price),
    portion_first_step: String(m.portion_first_step ?? 200),
    portion_step:       String(m.portion_step       ?? 100),
    portion_max_price:  String(m.portion_max_price  ?? item.price),
  }
}

// ── Preview helper ───────────────────────────────────────
function previewSteps(f: PortionForm): number[] {
  const min   = parseInt(f.portion_min_price)  || 0
  const first = parseInt(f.portion_first_step) || 0
  const step  = parseInt(f.portion_step)       || 0
  const max   = parseInt(f.portion_max_price)  || 0
  if (!min || !max || max <= min) return min ? [min] : []
  const steps = [min]
  const second = min + first
  if (first > 0 && second <= max) {
    steps.push(second)
    if (step > 0) {
      for (let p = second + step; p <= max; p += step) steps.push(p)
    }
  }
  return steps
}

export default function AdminRestaurantsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [menuItems,   setMenuItems]   = useState<MenuItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState<string | null>(null)

  // Expanded restaurant
  const [expanded,    setExpanded]    = useState<string | null>(null)
  // Which item has portions open
  const [portionOpen, setPortionOpen] = useState<string | null>(null)
  const [portionForms, setPortionForms] = useState<Record<string, PortionForm>>({})

  // Add item form
  const [addingItem,  setAddingItem]  = useState<string | null>(null)
  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Main', description: '' })

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/restaurants')
    if (res.status === 403) { router.push('/home'); return }
    const { restaurants: rests, items } = await res.json()
    setRestaurants(rests ?? [])
    setMenuItems(items ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (p?.role !== 'admin') { router.push('/home'); return }
      load()
    })
  }, [load, router, supabase])

  async function api(action: string, id: string, value: unknown) {
    const res = await fetch('/api/admin/restaurants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, value }),
    })
    return res.json()
  }

  async function toggleRestaurant(r: Restaurant) {
    setSaving(r.id)
    await api('toggle_restaurant', r.id, !r.is_open)
    await load()
    setSaving(null)
  }

  // Toggle whether this restaurant routes through the runner-funded
  // flow. Used for unregistered off-campus restaurants without payment
  // integration. See supabase-schema addition + api/admin/restaurants.
  async function toggleRunnerFunded(r: Restaurant) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (r as any).requires_runner_funded ?? false
    setSaving(r.id)
    await api('toggle_runner_funded', r.id, !cur)
    await load()
    setSaving(null)
  }

  async function toggleItem(item: MenuItem) {
    setSaving(item.id)
    await api('toggle_item', item.id, !item.is_available)
    await load()
    setSaving(null)
  }

  async function updatePrice(item: MenuItem, price: number) {
    if (!price || price < 0 || price === item.price) return
    setSaving(item.id)
    await api('update_price', item.id, price)
    await load()
    setSaving(null)
  }

  async function savePortions(itemId: string) {
    const f = portionForms[itemId]
    if (!f) return
    setSaving(itemId)
    await api('update_portions', itemId, {
      has_portions:       f.has_portions,
      portion_min_price:  f.has_portions ? parseInt(f.portion_min_price)  || null : null,
      portion_first_step: f.has_portions ? parseInt(f.portion_first_step) || null : null,
      portion_step:       f.has_portions ? parseInt(f.portion_step)       || null : null,
      portion_max_price:  f.has_portions ? parseInt(f.portion_max_price)  || null : null,
    })
    await load()
    setPortionOpen(null)
    setSaving(null)
  }

  async function addMenuItem(restaurantId: string) {
    if (!newItem.name || !newItem.price) return
    setSaving(restaurantId)
    await api('add_item', '', { restaurant_id: restaurantId, name: newItem.name.trim(), price: parseInt(newItem.price), category: newItem.category, description: newItem.description.trim() })
    setNewItem({ name: '', price: '', category: 'Main', description: '' })
    setAddingItem(null)
    await load()
    setSaving(null)
  }

  async function deleteItem(itemId: string) {
    if (!confirm('Delete this item?')) return
    setSaving(itemId)
    await api('delete_item', itemId, null)
    await load()
    setSaving(null)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-0, #0C0B09)', fontSize: 40 }}>
      {'\uD83C\uDF7D\uFE0F'}
    </div>
  )

  const INPUT: React.CSSProperties = {
    background: 'var(--bg-0, #0C0B09)', border: '1px solid var(--line, #2A2825)',
    borderRadius: 10, padding: '9px 12px', color: 'white',
    fontSize: 13, fontFamily: "'Nunito', sans-serif", width: '100%',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>

      {/* Header */}
      <div className="dot-texture" style={{ padding: '52px 20px 20px', borderBottom: '1px solid var(--line, #2A2825)' }}>
        <Link href="/admin/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-2, #A09A8E)', textDecoration: 'none', marginBottom: 12 }}>
          {'\u2190'} Dashboard
        </Link>
        <h1 className="font-display" style={{ color: 'white', fontSize: 24, margin: 0 }}>Restaurants</h1>
        <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
          {restaurants.length} restaurants {'\u00B7'} tap to manage
        </p>
      </div>

      {/* Restaurant list */}
      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px' }}>
        {restaurants.map(r => {
          const items = menuItems.filter(i => i.restaurant_id === r.id)
          const categories = [...new Set(items.map(i => i.category))]
          const isExpanded = expanded === r.id

          return (
            <div key={r.id} style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, marginBottom: 12, border: `1px solid ${r.is_open ? 'var(--line, #2A2825)' : 'rgba(255,59,48,0.2)'}`, overflow: 'hidden' }}>

              {/* Restaurant header row */}
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, background: 'var(--bg-0, #0C0B09)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, border: '1px solid var(--line, #2A2825)' }}>
                  {(r as Restaurant & { emoji?: string }).emoji ?? '\uD83C\uDF7D\uFE0F'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>{r.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
                    {items.length} items {'\u00B7'} {r.location}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <button
                    onClick={() => toggleRestaurant(r)}
                    disabled={saving === r.id}
                    className="press"
                    style={{ background: r.is_open ? 'rgba(29,185,84,0.1)' : 'rgba(255,59,48,0.1)', border: `1px solid ${r.is_open ? 'rgba(29,185,84,0.25)' : 'rgba(255,59,48,0.25)'}`, color: r.is_open ? 'var(--ok, #1DB954)' : 'var(--danger, #FF3B30)', fontSize: 11, fontWeight: 800, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', opacity: saving === r.id ? 0.6 : 1 }}
                  >
                    {saving === r.id ? '...' : r.is_open ? 'OPEN' : 'CLOSED'}
                  </button>
                  {/* Runner-funded flag — visible always so admin can flip
                      unregistered off-campus restaurants without diving
                      into the menu. Yellow signals "pilot flow"; grey =
                      standard restaurant-paid. */}
                  {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const isRF = !!(r as any).requires_runner_funded
                    return (
                      <button
                        onClick={() => toggleRunnerFunded(r)}
                        disabled={saving === r.id}
                        className="press"
                        aria-label={isRF ? 'Turn off runner-funded routing' : 'Enable runner-funded routing'}
                        style={{
                          background: isRF ? 'rgba(255,184,0,0.1)' : 'transparent',
                          border: `1px solid ${isRF ? 'rgba(255,184,0,0.3)' : 'var(--line, #2A2825)'}`,
                          color: isRF ? '#FFB800' : 'var(--ink-3, #6B6660)',
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '4px 10px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          opacity: saving === r.id ? 0.6 : 1,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {isRF ? '💸 RUNNER PAYS' : 'runner pays?'}
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : r.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--ink-3, #6B6660)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                  >
                    {isExpanded ? '\u25B2 Hide' : '\u25BC Menu'}
                  </button>
                </div>
              </div>

              {/* Expanded menu */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--line, #2A2825)', padding: '12px 16px' }}>

                  {/* Hours config */}
                  <div style={{ marginBottom: 16, background: 'var(--bg-0, #0C0B09)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--line, #2A2825)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 9, margin: 0 }}>Open hours</p>
                      <span style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 700 }}>(WAT)</span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Opens at</label>
                        <input type="time"
                          defaultValue={(r as RestaurantWithBank).open_time?.slice(0,5) ?? ''}
                          onBlur={async (e) => {
                            const v = e.target.value
                            setSaving(r.id)
                            await api('update_hours', r.id, { open_time: v ? `${v}:00` : null })
                            await load()
                            setSaving(null)
                          }}
                          style={{ width: '100%', background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Closes at</label>
                        <input type="time"
                          defaultValue={(r as RestaurantWithBank).close_time?.slice(0,5) ?? ''}
                          onBlur={async (e) => {
                            const v = e.target.value
                            setSaving(r.id)
                            await api('update_hours', r.id, { close_time: v ? `${v}:00` : null })
                            await load()
                            setSaving(null)
                          }}
                          style={{ width: '100%', background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }} />
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        setSaving(r.id)
                        await api('update_hours', r.id, { is_manually_closed: !(r as RestaurantWithBank).is_manually_closed })
                        await load()
                        setSaving(null)
                      }}
                      style={{ width: '100%', background: (r as RestaurantWithBank).is_manually_closed ? 'rgba(255,59,48,0.12)' : 'var(--bg-1, #1A1917)', border: `1px solid ${(r as RestaurantWithBank).is_manually_closed ? 'rgba(255,59,48,0.4)' : 'var(--line, #2A2825)'}`, borderRadius: 8, padding: '10px', color: (r as RestaurantWithBank).is_manually_closed ? 'var(--danger, #FF3B30)' : 'var(--ink-2, #A09A8E)', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {(r as RestaurantWithBank).is_manually_closed ? '✕ Force-closed (tap to re-open)' : 'Force-close override'}
                    </button>

                    {!(r as RestaurantWithBank).open_time && (
                      <p style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '8px 0 0', textAlign: 'center' }}>
                        No schedule set — only the manual toggle controls this restaurant.
                      </p>
                    )}
                  </div>

                  {/* Pre-order config */}
                  <div style={{ marginBottom: 16, background: 'var(--bg-0, #0C0B09)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--line, #2A2825)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 9, margin: 0 }}>Pre-order window</p>
                      <button
                        onClick={async () => {
                          setSaving(r.id)
                          await api('update_pre_order', r.id, {
                            pre_order_enabled: !(r as Restaurant & { pre_order_enabled?: boolean }).pre_order_enabled,
                          })
                          await load()
                          setSaving(null)
                        }}
                        style={{
                          background: (r as Restaurant & { pre_order_enabled?: boolean }).pre_order_enabled ? 'rgba(255,107,43,0.15)' : 'var(--bg-2, #26241F)',
                          border: `1px solid ${(r as Restaurant & { pre_order_enabled?: boolean }).pre_order_enabled ? 'var(--accent, #FF6B2B)' : 'var(--line, #2A2825)'}`,
                          color:  (r as Restaurant & { pre_order_enabled?: boolean }).pre_order_enabled ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)',
                          fontSize: 10, fontWeight: 900, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        {(r as Restaurant & { pre_order_enabled?: boolean }).pre_order_enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    {(r as Restaurant & { pre_order_enabled?: boolean }).pre_order_enabled && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3, #6B6660)', minWidth: 70, flexShrink: 0 }}>Peak time</label>
                          <input
                            type="time"
                            defaultValue={((r as Restaurant & { peak_open_time?: string | null }).peak_open_time ?? '').slice(0, 5)}
                            onBlur={async e => {
                              const v = e.target.value
                              if (v !== (((r as Restaurant & { peak_open_time?: string | null }).peak_open_time ?? '').slice(0, 5))) {
                                setSaving(r.id)
                                await api('update_pre_order', r.id, { peak_open_time: v ? `${v}:00` : null })
                                await load()
                                setSaving(null)
                              }
                            }}
                            style={{ ...INPUT, flex: 1, padding: '7px 10px', fontSize: 12 }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3, #6B6660)', minWidth: 70, flexShrink: 0 }}>Window</label>
                          <input
                            type="number"
                            min="30"
                            max="360"
                            defaultValue={(r as Restaurant & { pre_order_window_minutes?: number }).pre_order_window_minutes ?? 120}
                            onBlur={async e => {
                              const v = parseInt(e.target.value)
                              if (!isNaN(v) && v !== ((r as Restaurant & { pre_order_window_minutes?: number }).pre_order_window_minutes ?? 120)) {
                                setSaving(r.id)
                                await api('update_pre_order', r.id, { pre_order_window_minutes: v })
                                await load()
                                setSaving(null)
                              }
                            }}
                            style={{ ...INPUT, flex: 1, padding: '7px 10px', fontSize: 12 }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>min before peak</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3, #6B6660)', minWidth: 70, flexShrink: 0 }}>Post-peak</label>
                          <input
                            type="number"
                            min="0"
                            max="120"
                            defaultValue={(r as Restaurant & { post_peak_delay_minutes?: number }).post_peak_delay_minutes ?? 30}
                            onBlur={async e => {
                              const v = parseInt(e.target.value)
                              if (!isNaN(v) && v !== ((r as Restaurant & { post_peak_delay_minutes?: number }).post_peak_delay_minutes ?? 30)) {
                                setSaving(r.id)
                                await api('update_pre_order', r.id, { post_peak_delay_minutes: v })
                                await load()
                                setSaving(null)
                              }
                            }}
                            style={{ ...INPUT, flex: 1, padding: '7px 10px', fontSize: 12 }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>min "longer wait" after</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Bank details */}
                  <div style={{ marginBottom: 16, background: 'var(--bg-0, #0C0B09)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--line, #2A2825)' }}>
                    <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 9, margin: '0 0 8px' }}>Bank details (payment queue)</p>
                    {([
                      { key: 'bank_name',      label: 'Bank',    ph: 'e.g. GTBank'     },
                      { key: 'account_number', label: 'Account', ph: '10-digit number' },
                      { key: 'account_name',   label: 'Name',    ph: 'Name on account' },
                    ] as const).map(f => (
                      <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3, #6B6660)', minWidth: 52, flexShrink: 0 }}>{f.label}</label>
                        <input
                          placeholder={f.ph}
                          defaultValue={(r as Restaurant & Record<string, string>)[f.key] ?? ''}
                          onBlur={async e => {
                            const v = e.target.value.trim()
                            if (v !== ((r as Restaurant & Record<string, string>)[f.key] ?? '')) {
                              setSaving(r.id)
                              await api('update_bank_field', r.id, { field: f.key, value: v })
                              await load()
                              setSaving(null)
                            }
                          }}
                          style={{ ...INPUT, flex: 1, padding: '7px 10px', fontSize: 12 }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Menu items by category */}
                  {categories.map(cat => (
                    <div key={cat} style={{ marginBottom: 16 }}>
                      <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 10, margin: '0 0 8px' }}>{cat.toUpperCase()}</p>
                      {items.filter(i => i.category === cat).map(item => {
                        const m = item as MenuItem & {
                          has_portions?: boolean
                          portion_min_price?: number
                          portion_first_step?: number
                          portion_step?: number
                          portion_max_price?: number
                        }
                        const isPortionOpen = portionOpen === item.id
                        const pForm = portionForms[item.id]

                        return (
                          <div key={item.id} style={{ background: 'var(--bg-0, #0C0B09)', borderRadius: 12, padding: '10px 12px', marginBottom: 8, border: `1px solid ${item.is_available ? 'var(--line, #2A2825)' : 'rgba(255,59,48,0.2)'}` }}>
                            {/* Item main row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {/* Image — tap to upload/replace */}
                              <label style={{ width: 40, height: 40, borderRadius: 10, border: `1.5px dashed ${item.image_url ? 'transparent' : 'var(--line, #2A2825)'}`, flexShrink: 0, cursor: 'pointer', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-1, #1A1917)' }}>
                                {item.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                ) : (
                                  <span style={{ fontSize: 18, opacity: 0.4 }}>📷</span>
                                )}
                                {/* Overlay on hover */}
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }} onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
                                  <span style={{ fontSize: 14 }}>✏️</span>
                                </div>
                                <input type="file" accept="image/*" style={{ display: 'none' }}
                                  onChange={async e => {
                                    const file = e.target.files?.[0]
                                    if (!file) return
                                    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return }
                                    setSaving(item.id)
                                    const fd = new FormData()
                                    fd.append('file', file)
                                    fd.append('itemId', item.id)
                                    const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd })
                                    const { error } = await res.json()
                                    if (error) alert(error)
                                    await load()
                                    setSaving(null)
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontWeight: 700, fontSize: 13, color: item.is_available ? 'white' : 'var(--ink-3, #6B6660)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.name}
                                  {m.has_portions && (
                                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: 'var(--warn, #FFB800)', background: 'rgba(255,184,0,0.12)', padding: '1px 6px', borderRadius: 5 }}>
                                      PORTIONS
                                    </span>
                                  )}
                                  {item.is_featured && (
                                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 900, color: '#FFB800' }}>★</span>
                                  )}
                                </p>
                                {/* Price input */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                  <span style={{ color: 'var(--ink-3, #6B6660)', fontSize: 12 }}>{N}</span>
                                  <input
                                    type="number"
                                    defaultValue={item.price}
                                    onBlur={e => updatePrice(item, parseInt(e.target.value))}
                                    style={{ ...INPUT, width: 80, padding: '3px 8px', fontSize: 12 }}
                                  />
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                                <button
                                  onClick={() => toggleItem(item)}
                                  disabled={saving === item.id}
                                  className="press"
                                  style={{ background: item.is_available ? 'rgba(29,185,84,0.1)' : 'rgba(255,59,48,0.1)', border: 'none', color: item.is_available ? 'var(--ok, #1DB954)' : 'var(--danger, #FF3B30)', fontSize: 11, fontWeight: 800, padding: '5px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', opacity: saving === item.id ? 0.5 : 1 }}
                                >
                                  {saving === item.id ? '...' : item.is_available ? 'ON' : 'OFF'}
                                </button>
                                {/* Star / featured toggle */}
                                <button
                                  onClick={async () => {
                                    setSaving(item.id)
                                    await api('toggle_featured', item.id, !item.is_featured)
                                    await load()
                                    setSaving(null)
                                  }}
                                  disabled={saving === item.id}
                                  title={item.is_featured ? 'Remove from featured' : 'Feature this dish'}
                                  className="press"
                                  style={{ background: item.is_featured ? 'rgba(255,184,0,0.15)' : 'var(--bg-0, #0C0B09)', border: `1px solid ${item.is_featured ? 'rgba(255,184,0,0.4)' : 'var(--line, #2A2825)'}`, color: item.is_featured ? '#FFB800' : 'var(--ink-3, #6B6660)', fontSize: 13, padding: '4px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', opacity: saving === item.id ? 0.5 : 1 }}
                                >
                                  ★
                                </button>
                                {/* Portions toggle */}
                                <button
                                  onClick={() => {
                                    if (!portionForms[item.id]) {
                                      setPortionForms(pf => ({ ...pf, [item.id]: defaultPortionForm(item) }))
                                    }
                                    setPortionOpen(isPortionOpen ? null : item.id)
                                  }}
                                  className="press"
                                  style={{ background: m.has_portions ? 'rgba(255,184,0,0.12)' : 'var(--bg-1, #1A1917)', border: `1px solid ${m.has_portions ? 'rgba(255,184,0,0.3)' : 'var(--line, #2A2825)'}`, color: m.has_portions ? 'var(--warn, #FFB800)' : 'var(--ink-3, #6B6660)', fontSize: 10, fontWeight: 800, padding: '5px 7px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                  {'\u2696\uFE0F'}
                                </button>
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  style={{ background: 'rgba(255,59,48,0.08)', border: 'none', color: 'var(--danger, #FF3B30)', fontSize: 13, borderRadius: 8, cursor: 'pointer', padding: '4px 7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  {'\uD83D\uDDD1'}
                                </button>
                              </div>
                            </div>

                            {/* Portion config panel */}
                            {isPortionOpen && pForm && (
                              <div style={{ marginTop: 12, background: 'var(--bg-1, #1A1917)', borderRadius: 12, padding: 14, border: `1px solid ${pForm.has_portions ? 'rgba(255,184,0,0.3)' : 'var(--line, #2A2825)'}` }}>
                                <p className="label-cap" style={{ color: 'var(--warn, #FFB800)', fontSize: 9, margin: '0 0 10px' }}>Portion pricing</p>

                                {/* Enable toggle */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Enable portions</span>
                                  <button
                                    onClick={() => setPortionForms(pf => ({ ...pf, [item.id]: { ...pf[item.id], has_portions: !pf[item.id].has_portions } }))}
                                    style={{ width: 44, height: 24, borderRadius: 999, background: pForm.has_portions ? '#FFB800' : 'var(--bg-2, #26241F)', border: `1px solid ${pForm.has_portions ? '#CC9400' : 'var(--line, #2A2825)'}`, cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                                  >
                                    <div style={{ position: 'absolute', top: 2, width: 20, height: 20, background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', left: pForm.has_portions ? 22 : 2, transition: 'left 0.15s' }} />
                                  </button>
                                </div>

                                {pForm.has_portions && (
                                  <>
                                    {/* Four fields */}
                                    {([
                                      { key: 'portion_min_price',  label: 'Start price',   ph: 'e.g. 1000', hint: 'Cheapest option' },
                                      { key: 'portion_first_step', label: 'First jump',    ph: 'e.g. 200',  hint: '1000 \u2192 1200' },
                                      { key: 'portion_step',       label: 'Next steps',    ph: 'e.g. 100',  hint: '1200 \u2192 1300 \u2192 1400...' },
                                      { key: 'portion_max_price',  label: 'Max price',     ph: 'e.g. 2000', hint: 'Most expensive option' },
                                    ] as const).map(f => (
                                      <div key={f.key} style={{ marginBottom: 10 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3, #6B6660)' }}>{f.label}</label>
                                          <span style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>{f.hint}</span>
                                        </div>
                                        <input
                                          type="number"
                                          value={pForm[f.key]}
                                          onChange={e => setPortionForms(pf => ({ ...pf, [item.id]: { ...pf[item.id], [f.key]: e.target.value } }))}
                                          placeholder={f.ph}
                                          style={INPUT}
                                        />
                                      </div>
                                    ))}

                                    {/* Preview */}
                                    {(() => {
                                      const steps = previewSteps(pForm)
                                      return steps.length > 0 ? (
                                        <div style={{ background: 'var(--bg-0, #0C0B09)', borderRadius: 10, padding: '8px 12px', marginBottom: 10, border: '1px solid var(--line, #2A2825)' }}>
                                          <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', fontSize: 9, margin: '0 0 6px' }}>Preview ({steps.length} options)</p>
                                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {steps.map(p => (
                                              <span key={p} style={{ background: 'rgba(255,184,0,0.1)', color: 'var(--warn, #FFB800)', fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8 }}>
                                                {N}{p.toLocaleString()}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null
                                    })()}
                                  </>
                                )}

                                {/* Save / Cancel */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                  <button
                                    onClick={() => setPortionOpen(null)}
                                    style={{ flex: 1, background: 'var(--bg-2, #26241F)', color: 'var(--ink-2, #A09A8E)', fontWeight: 700, fontSize: 13, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => savePortions(item.id)}
                                    disabled={saving === item.id}
                                    className="press"
                                    style={{ flex: 2, background: 'var(--warn, #FFB800)', color: '#15130F', fontWeight: 900, fontSize: 13, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving === item.id ? 0.7 : 1 }}
                                  >
                                    {saving === item.id ? 'Saving...' : 'Save portions'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  {/* Add item */}
                  {addingItem === r.id ? (
                    <div style={{ background: 'var(--bg-0, #0C0B09)', borderRadius: 14, padding: 14, border: '1px solid rgba(255,107,43,0.25)', marginTop: 4 }}>
                      <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: '0 0 10px' }}>New item</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input placeholder="Item name *" value={newItem.name} onChange={e => setNewItem(v => ({ ...v, name: e.target.value }))} style={INPUT} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder={`${N} Price *`} type="number" value={newItem.price} onChange={e => setNewItem(v => ({ ...v, price: e.target.value }))} style={{ ...INPUT, flex: 1 }} />
                          <select value={newItem.category} onChange={e => setNewItem(v => ({ ...v, category: e.target.value }))} style={{ ...INPUT, flex: 1, cursor: 'pointer' }}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <input placeholder="Description (optional)" value={newItem.description} onChange={e => setNewItem(v => ({ ...v, description: e.target.value }))} style={INPUT} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setAddingItem(null); setNewItem({ name: '', price: '', category: 'Main', description: '' }) }} className="press" style={{ flex: 1, background: 'var(--bg-2, #26241F)', color: 'var(--ink-2, #A09A8E)', fontWeight: 700, fontSize: 13, padding: '11px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancel
                          </button>
                          <button
                            onClick={() => addMenuItem(r.id)}
                            disabled={!newItem.name || !newItem.price || saving === r.id}
                            className="press"
                            style={{ flex: 2, background: newItem.name && newItem.price ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', color: 'white', fontWeight: 900, fontSize: 13, padding: '11px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving === r.id ? 0.7 : 1 }}
                          >
                            {saving === r.id ? 'Adding...' : '+ Add Item'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingItem(r.id)}
                      className="press"
                      style={{ width: '100%', background: 'rgba(255,107,43,0.06)', border: '1px dashed rgba(255,107,43,0.25)', color: 'var(--accent, #FF6B2B)', fontWeight: 800, fontSize: 13, padding: '11px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}
                    >
                      + Add menu item
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
