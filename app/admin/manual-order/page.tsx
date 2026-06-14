'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Copy, MessageCircle, Sliders } from 'lucide-react'
import { PortionPickerSheet, type PortionAddon } from '@/components/ui/PortionPickerSheet'
import type { MenuItem as FullMenuItem } from '@/types'
import { createClient } from '@/lib/supabase/client'

type ParsedItem = {
  menu_item_id:       string
  name:               string
  price:              number      // line total when no options; base price otherwise
  quantity:           number
  restaurant_id:      string
  restaurant_name:    string
  restaurant_is_open: boolean
  options?: {
    is_pantry?: boolean
    swallow?:   'garri' | 'fufu'
    portions?:  Array<{ price: number; quantity: number }>
    addons?:    PortionAddon[]
  }
}

type Restaurant = { id: string; name: string; is_open: boolean }
type MenuItem   = FullMenuItem

export default function ManualOrderPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [authChecking, setAuthChecking] = useState(true)
  const [rawMessage, setRawMessage]     = useState('')

  // Editable form
  const [customerName,    setCustomerName]    = useState('')
  const [customerPhone,   setCustomerPhone]   = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [restaurantId,    setRestaurantId]    = useState('')
  const [items,           setItems]           = useState<ParsedItem[]>([])
  const [pickerForIdx,    setPickerForIdx]    = useState<number | null>(null)
  const [wantPlate,       setWantPlate]       = useState(false)
  const [deliveryFee,     setDeliveryFee]     = useState(500)
  const [notes,           setNotes]           = useState('')

  // For dropdowns
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [menuItems,   setMenuItems]   = useState<MenuItem[]>([])

  // Result state
  const [creating,    setCreating]    = useState(false)
  const [paymentUrl,  setPaymentUrl]  = useState('')
  const [orderRef,    setOrderRef]    = useState('')
  const [createError, setCreateError] = useState('')
  const [copied,      setCopied]      = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (!profile || !['admin', 'support'].includes(profile.role)) {
        router.replace('/home')
        return
      }
      setAuthChecking(false)

      // Load restaurants + menu
      const [{ data: rests }, { data: mItems }] = await Promise.all([
        supabase.from('restaurants').select('id, name, is_open').eq('is_pantry', false).order('name'),
        supabase.from('menu_items').select('id, name, price, restaurant_id, category, description, is_available, has_portions, portion_min_price, portion_first_step, portion_step, portion_max_price').eq('is_available', true),
      ])
      setRestaurants(rests ?? [])
      setMenuItems(mItems ?? [])
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps



  // Compute the total price of a single ParsedItem (used in totals + UI)
  function itemTotal(item: ParsedItem): number {
    if (item.options?.portions && item.options.portions.length > 0) {
      const portionsTotal = item.options.portions.reduce((s, p) => s + p.price * p.quantity, 0)
      const addonsTotal = (item.options.addons ?? []).reduce((s, a) => {
        if (a.portions && a.portions.length > 0) return s + a.portions.reduce((ps, p) => ps + p.price * p.quantity, 0)
        return s + a.price * a.quantity
      }, 0)
      return (portionsTotal + addonsTotal) * item.quantity
    }
    return item.price * item.quantity
  }

  function describeOptions(item: ParsedItem): string | null {
    if (!item.options) return null
    const parts: string[] = []
    if (item.options.portions?.length) {
      const sizes = item.options.portions.map(p => `₦${p.price.toLocaleString()}`).join(', ')
      parts.push(`Size: ${sizes}`)
    }
    if (item.options.swallow) parts.push(item.options.swallow === 'garri' ? 'Garri (Eba)' : 'Fufu')
    const addonCount = item.options.addons?.reduce((s, a) => {
      if (a.portions) return s + a.portions.reduce((q, p) => q + p.quantity, 0)
      return s + a.quantity
    }, 0) ?? 0
    if (addonCount > 0) parts.push(`+${addonCount} extra${addonCount !== 1 ? 's' : ''}`)
    return parts.length ? parts.join(' · ') : null
  }

  function handlePortionConfirm(
    idx: number,
    portions: Array<{ price: number; quantity: number }>,
    addons:   PortionAddon[],
    swallow?: 'garri' | 'fufu',
  ) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, options: { ...(it.options ?? {}), portions, addons, swallow } } : it))
    setPickerForIdx(null)
  }

  function addItem() {
    const validRestaurantItems = menuItems.filter(m => m.restaurant_id === restaurantId)
    if (!validRestaurantItems.length) return
    const m = validRestaurantItems[0]
    const r = restaurants.find(r => r.id === restaurantId)
    if (!r) return
    setItems([...items, {
      menu_item_id: m.id, name: m.name, price: m.price, quantity: 1,
      restaurant_id: r.id, restaurant_name: r.name, restaurant_is_open: r.is_open,
    }])
  }

  function updateItem(idx: number, updates: Partial<ParsedItem>) {
    setItems(items.map((it, i) => i === idx ? { ...it, ...updates } : it))
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx))
  }

  function changeItemMenu(idx: number, menuItemId: string) {
    const m = menuItems.find(x => x.id === menuItemId)
    if (!m) return
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, menu_item_id: m.id, name: m.name, price: m.price, options: undefined } : it))
  }

  const foodTotal       = items.reduce((s, i) => s + itemTotal(i), 0)
  const totalItemCount  = items.reduce((s, i) => s + i.quantity, 0)
  const plateFee        = wantPlate ? totalItemCount * 200 : 0
  const orderTotal      = foodTotal + plateFee + deliveryFee

  async function handleCreate() {
    if (!customerPhone || !restaurantId || !items.length || !deliveryAddress) {
      setCreateError('Please fill all required fields')
      return
    }
    setCreating(true); setCreateError('')

    try {
      const res = await fetch('/api/admin/manual-order/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_phone:    customerPhone,
          customer_name:     customerName,
          restaurant_id:     restaurantId,
          items:             items.map(i => ({ menu_item_id: i.menu_item_id, name: i.name, price: i.price, quantity: i.quantity, options: i.options })),
          delivery_address:  deliveryAddress,
          delivery_fee:      deliveryFee,
          want_plate:        wantPlate,
          notes:             notes || undefined,
          raw_message:       rawMessage,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error || 'Failed to create order')
        setCreating(false); return
      }
      setPaymentUrl(data.payment_url)
      setOrderRef(data.order_ref || '')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Network error')
    }
    setCreating(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(paymentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function reset() {
    setRawMessage(''); setCustomerName(''); setCustomerPhone('')
    setDeliveryAddress(''); setRestaurantId(''); setItems([])
    setWantPlate(false); setDeliveryFee(500); setNotes('')
    setPaymentUrl(''); setOrderRef(''); setCreateError('')
  }

  if (authChecking) {
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6660', fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>
        Loading…
      </div>
    )
  }

  const validRestaurantItems = menuItems.filter(m => m.restaurant_id === restaurantId)

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '50px 16px 12px', background: '#1A1917', borderBottom: '1px solid #2A2825', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/admin/dashboard" aria-label="Back"
          style={{ background: '#26241F', border: '1px solid #2A2825', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', textDecoration: 'none' }}>
          <ChevronLeft size={18} />
        </Link>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#6B6660', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Manual order</p>
          <h1 className="font-display" style={{ fontSize: 18, color: 'white', margin: 0 }}>WhatsApp → Order</h1>
        </div>
      </div>

      {paymentUrl ? (
        // SUCCESS STATE
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(29,185,84,0.1)', border: '1px solid rgba(29,185,84,0.3)', borderRadius: 14, padding: 16 }}>
            <p style={{ fontWeight: 900, fontSize: 16, color: '#1DB954', margin: 0 }}>✓ Order created</p>
            <p style={{ fontSize: 13, color: 'white', fontWeight: 600, margin: '6px 0 0' }}>
              Reference: <strong>{orderRef}</strong>
            </p>
            <p style={{ fontSize: 12, color: '#A09A8E', fontWeight: 600, margin: '4px 0 0' }}>
              Paystack link expires in 1 hour
            </p>
          </div>

          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#A09A8E', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>
              Payment link
            </p>
            <div style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 12, padding: '12px 14px', fontSize: 11, color: 'white', fontWeight: 600, wordBreak: 'break-all', marginBottom: 8 }}>
              {paymentUrl}
            </div>
            <button onClick={handleCopy} className="press"
              style={{ width: '100%', background: '#FF6B2B', color: 'white', border: 'none', borderRadius: 12, padding: '14px 16px', fontWeight: 900, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Copy size={16} />
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          <div>
            <a
              href={`https://wa.me/${customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${customerName || 'there'}! Your order ${orderRef} is ready. Pay here: ${paymentUrl}\n\nTotal: ₦${orderTotal.toLocaleString()}\nLink expires in 1 hour.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="press"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#25D366', color: 'white', borderRadius: 12, padding: '14px 16px', fontWeight: 900, fontSize: 14, textDecoration: 'none' }}
            >
              <MessageCircle size={16} />
              Send via WhatsApp
            </a>
          </div>

          <button onClick={reset}
            style={{ background: 'transparent', color: '#6B6660', border: '1px solid #2A2825', borderRadius: 12, padding: '12px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Create another order
          </button>
        </div>
      ) : (
        // FORM STATE
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Step 1: Paste WhatsApp message */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#A09A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
              Original WhatsApp message (kept for records)
            </label>
            <textarea
              value={rawMessage}
              onChange={e => setRawMessage(e.target.value)}
              placeholder="Paste the customer's WhatsApp message here for reference. Then fill in the order details below."
              rows={4}
              style={{ width: '100%', background: '#1A1917', border: '1px solid #2A2825', borderRadius: 12, padding: '12px 14px', color: 'white', fontSize: 13, fontWeight: 600, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 600, margin: '6px 0 0' }}>
              Optional. We log this with the order so you have an audit trail.
            </p>
          </div>

          {/* Step 2: Edit details */}
          <div style={{ borderTop: '1px solid #1F1D1B', paddingTop: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#A09A8E', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
              1. Customer details
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FormInput label="Name (optional)" value={customerName} onChange={setCustomerName} placeholder="Adaobi" />
              <FormInput label="Phone *" value={customerPhone} onChange={setCustomerPhone} placeholder="+2348012345678" />
              <FormInput label="Delivery address *" value={deliveryAddress} onChange={setDeliveryAddress} placeholder="Block C, Room 12" />
            </div>
          </div>

          {/* Step 3: Order */}
          <div style={{ borderTop: '1px solid #1F1D1B', paddingTop: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#A09A8E', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
              2. Order
            </p>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6B6660', display: 'block', marginBottom: 4 }}>Restaurant *</label>
            <select
              value={restaurantId}
              onChange={e => { setRestaurantId(e.target.value); setItems([]) }}
              style={{ width: '100%', background: '#1A1917', border: '1px solid #2A2825', borderRadius: 12, padding: '12px 14px', color: 'white', fontSize: 13, fontWeight: 600, outline: 'none', fontFamily: 'inherit', marginBottom: 12 }}
            >
              <option value="">Pick a restaurant</option>
              {restaurants.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}{!r.is_open ? ' (CLOSED)' : ''}
                </option>
              ))}
            </select>

            {restaurantId && (
              <>
                {items.map((item, idx) => {
                  const menuItem = menuItems.find(m => m.id === item.menu_item_id)
                  const hasPortions = !!menuItem?.has_portions
                  const optionDesc  = describeOptions(item)
                  const lineTotal   = itemTotal(item)
                  return (
                    <div key={idx} style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 12, padding: 10, marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={item.menu_item_id}
                          onChange={e => changeItemMenu(idx, e.target.value)}
                          style={{ flex: 1, background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: 12, fontWeight: 600, outline: 'none', fontFamily: 'inherit', minWidth: 0 }}
                        >
                          {validRestaurantItems.map(m => (
                            <option key={m.id} value={m.id}>{m.name} {m.has_portions ? '· portions' : `(₦${m.price})`}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={item.quantity}
                          onChange={e => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                          style={{ width: 50, background: '#0C0B09', border: '1px solid #2A2825', borderRadius: 8, padding: '8px', color: 'white', fontSize: 12, fontWeight: 700, outline: 'none', fontFamily: 'inherit', textAlign: 'center' }}
                        />
                        <button onClick={() => removeItem(idx)} aria-label="Remove"
                          style={{ background: 'transparent', color: '#FF3B30', border: 'none', cursor: 'pointer', padding: 4, fontSize: 18 }}>
                          ×
                        </button>
                      </div>

                      {/* Build plate button for items that have portions */}
                      {hasPortions && (
                        <button onClick={() => setPickerForIdx(idx)}
                          style={{ width: '100%', marginTop: 8, background: item.options?.portions ? 'rgba(255,107,43,0.12)' : '#0C0B09', color: item.options?.portions ? '#FF6B2B' : '#A09A8E', border: `1px solid ${item.options?.portions ? '#FF6B2B' : '#2A2825'}`, borderRadius: 8, padding: '8px 12px', fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <Sliders size={12} />
                          {item.options?.portions ? 'Edit plate' : 'Build plate (portion + extras)'}
                        </button>
                      )}

                      {/* Option summary + computed total */}
                      {(optionDesc || hasPortions) && (
                        <div style={{ marginTop: 8, padding: '6px 8px', background: '#0C0B09', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#A09A8E', fontWeight: 600, flex: 1 }}>
                            {optionDesc ?? (hasPortions ? 'No portion set yet' : null)}
                          </span>
                          <span style={{ fontSize: 12, color: '#FF6B2B', fontWeight: 800, flexShrink: 0 }}>
                            ₦{lineTotal.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button onClick={addItem}
                  style={{ width: '100%', background: 'transparent', color: '#FF6B2B', border: '1px dashed #FF6B2B', borderRadius: 10, padding: '10px', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Add item
                </button>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '8px 0' }}>
              <input type="checkbox" id="wantPlate" checked={wantPlate} onChange={e => setWantPlate(e.target.checked)} />
              <label htmlFor="wantPlate" style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>Plate fee (₦200/item)</label>
            </div>

            <FormInput label="Delivery fee (₦)" value={String(deliveryFee)} onChange={v => setDeliveryFee(parseInt(v) || 0)} type="number" />
            <FormInput label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Extra pepper, no plantain" />
          </div>

          {/* Totals */}
          {items.length > 0 && (
            <div style={{ borderTop: '1px solid #1F1D1B', paddingTop: 14, background: '#1A1917', borderRadius: 14, padding: 14, border: '1px solid #2A2825' }}>
              <Row label="Food" value={foodTotal} />
              {wantPlate && <Row label="Plate fee" value={plateFee} />}
              <Row label="Delivery" value={deliveryFee} />
              <div style={{ borderTop: '1px solid #2A2825', marginTop: 6, paddingTop: 6 }}>
                <Row label="Total" value={orderTotal} bold />
              </div>
            </div>
          )}

          {createError && (
            <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#FF3B30', padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
              {createError}
            </div>
          )}

          <button onClick={handleCreate} disabled={creating || !customerPhone || !restaurantId || !items.length || !deliveryAddress} className="press"
            style={{ width: '100%', background: '#FF6B2B', color: 'white', border: 'none', borderRadius: 14, padding: '14px 16px', fontWeight: 900, fontSize: 15, cursor: creating ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: creating || !customerPhone || !restaurantId || !items.length || !deliveryAddress ? 0.5 : 1 }}>
            {creating ? 'Creating…' : 'Create order & generate payment link'}
          </button>
        </div>
      )}

      {/* Portion picker modal */}
      {pickerForIdx !== null && items[pickerForIdx] && (() => {
        const idx = pickerForIdx
        const targetItem = menuItems.find(m => m.id === items[idx].menu_item_id)
        if (!targetItem) { setPickerForIdx(null); return null }
        // Extras = all other available items in this restaurant
        const extras = menuItems.filter(m => m.restaurant_id === restaurantId && m.id !== targetItem.id)
        return (
          <PortionPickerSheet
            item={targetItem}
            extras={extras}
            onConfirm={(portions, addons, swallow) => handlePortionConfirm(idx, portions, addons, swallow)}
            onClose={() => setPickerForIdx(null)}
          />
        )
      })()}
    </div>
  )
}

function FormInput({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#6B6660', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', background: '#1A1917', border: '1px solid #2A2825', borderRadius: 12, padding: '11px 14px', color: 'white', fontSize: 13, fontWeight: 600, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: bold ? 'white' : '#A09A8E', fontSize: 13, fontWeight: bold ? 900 : 700 }}>{label}</span>
      <span style={{ color: bold ? '#FF6B2B' : 'white', fontSize: bold ? 16 : 13, fontWeight: 900 }}>
        ₦{value.toLocaleString()}
      </span>
    </div>
  )
}
