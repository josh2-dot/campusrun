'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cart'
import { captureError } from '@/lib/sentry'
import { ChevronLeft, Landmark, MapPin } from 'lucide-react'

const DELIVERY_FEE    = 500
const PLATFORM_CUT    = 200
const RUNNER_EARNINGS = 300

/** Paystack fee: 1.5% + ₦100, capped at ₦2,000. Charged on top of order total. */
function calcProcessingFee(amount: number): number {
  return Math.min(Math.round(amount * 0.015) + 100, 2000)
}

function buildTimeSlots(): { label: string; value: string }[] {
  const slots: { label: string; value: string }[] = []
  const base = new Date()
  base.setSeconds(0, 0)
  base.setMinutes(base.getMinutes() < 30 ? 30 : 60)
  for (let i = 0; i < 24; i++) {
    const slot = new Date(base.getTime() + i * 30 * 60 * 1000)
    slots.push({
      label: slot.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
      value: slot.toISOString(),
    })
  }
  return slots
}

export default function CheckoutPage() {
  const router  = useRouter()
  const supabase = createClient()
  const { items, restaurantId, restaurantName, foodTotal, plateFeeTotal, wantPlate, setWantPlate, deliveryAddress, setDeliveryAddress, clearCart } = useCartStore()

  const [loading,           setLoading]           = useState(false)
  const [validating,        setValidating]        = useState(true)
  const [restaurantOpen,    setRestaurantOpen]    = useState(true)
  const [unavailableItems,  setUnavailableItems]  = useState<string[]>([])
  const [error,         setError]         = useState('')
  const [orderNotes,    setOrderNotes]    = useState('')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduledFor,    setScheduledFor]    = useState('')
  const [preOrderPhase,   setPreOrderPhase]   = useState<{ phase: string; peakAt?: string } | null>(null)
  const [timeSlots]                           = useState(() => buildTimeSlots())

  const subtotal       = foodTotal()
  const plateFee       = plateFeeTotal()
  const orderTotal     = subtotal + plateFee + DELIVERY_FEE
  // Paystack now charges the processing fee directly to the customer on their checkout page.
  // We still display the estimate so there are no surprises.
  const processingFee  = calcProcessingFee(orderTotal)
  const grandTotal     = orderTotal

  useEffect(() => {
    // Anonymous users get sent to signup with intent preserved
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/signup?next=/checkout'); return }
    })
    if (items.length === 0) { router.push('/home'); return }
    // restaurantId may be null for pantry-only orders — we'll look it up below

    async function validate() {
      setValidating(true)

      // Pantry-only orders skip the food-restaurant open check
      const isPantryOnly = !restaurantId
      if (isPantryOnly) {
        setValidating(false); return
      }

      const { data: restaurant } = await supabase
        .from('restaurants').select('is_open, name').eq('id', restaurantId).single()

      if (!restaurant?.is_open) {
        setRestaurantOpen(false); setValidating(false); return
      }

      const { data: menuItems } = await supabase
        .from('menu_items').select('id, name, is_available').in('id', items.map(i => i.menu_item_id))

      setUnavailableItems((menuItems ?? []).filter(m => !m.is_available).map(m => m.name))
      setValidating(false)
      // Pre-order window state for this restaurant (skip if pantry-only)
      if (restaurantId) {
        fetch(`/api/restaurants/pre-order-window?restaurant_id=${restaurantId}`)
          .then(r => r.json()).then(setPreOrderPhase).catch(() => {})
      }
    }

    validate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePlaceOrder() {
    if (!deliveryAddress.trim()) {
      setError('Add a delivery address to continue.'); return
    }
    if (deliveryAddress.trim().length < 10) {
      setError('Please be more specific — include your hall, block, and room number.'); return
    }

    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login?next=/checkout'); return }

    // For pantry-only orders, use the pantry restaurant's ID for the insert.
    // Also determine payment_model from the effective restaurant.
    let effectiveRestaurantId = restaurantId
    let paymentModel: 'restaurant_paid' | 'runner_funded' = 'restaurant_paid'
    if (!effectiveRestaurantId) {
      const { data: pantryRest } = await supabase
        .from('restaurants').select('id, requires_runner_funded').eq('is_pantry', true).limit(1).maybeSingle()
      if (!pantryRest) {
        setError('Pantry is temporarily unavailable. Please try again later.')
        setLoading(false); return
      }
      effectiveRestaurantId = pantryRest.id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((pantryRest as any).requires_runner_funded) paymentModel = 'runner_funded'
    } else {
      const { data: restaurant } = await supabase
        .from('restaurants').select('is_open, requires_runner_funded').eq('id', restaurantId).single()
      if (!restaurant?.is_open) {
        setError('This restaurant just closed. Please choose another restaurant.')
        setRestaurantOpen(false); setLoading(false); return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((restaurant as any).requires_runner_funded) paymentModel = 'runner_funded'
    }

    const { data: profile } = await supabase
      .from('users').select('email').eq('id', user.id).single()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id:     user.id,
        restaurant_id:   effectiveRestaurantId,
        items,
        delivery_address: deliveryAddress.trim(),
        food_total:      subtotal + plateFee,
        delivery_fee:    DELIVERY_FEE,
        processing_fee:  processingFee,
        platform_cut:    PLATFORM_CUT,
        runner_earnings: RUNNER_EARNINGS,
        status:          'pending',
        broadcast_count: 0,
        order_notes:   orderNotes.trim() || null,
        scheduled_for: scheduleEnabled && scheduledFor ? scheduledFor : null,
        payment_model:   paymentModel,
      })
      .select()
      .single()

    if (orderError) {
      console.error('Order insert failed:', orderError)
      captureError(orderError, {
        tags:  { event: 'order_insert_failed' },
        userId: user?.id,
        extra: {
          restaurantId,
          itemCount: items.length,
          subtotal,
          plateFee,
          deliveryAddress: deliveryAddress.slice(0, 50),
          pgCode:  orderError.code,
          pgHint:  orderError.hint,
          pgDetails: orderError.details,
        },
      })
      setError("Couldn't place your order. Please try again — if it keeps failing, message us on WhatsApp.")
      setLoading(false); return
    }
    if (!order?.id) {
      setError("Order didn't save properly. Please try again.")
      setLoading(false); return
    }

    const res = await fetch('/api/payments/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        amount:  grandTotal,
        email:   profile?.email || user.email,
      }),
    })

    const result = await res.json()

    if (result.error) {
      captureError(new Error(result.error), {
        tags:  { event: 'payment_init_failed' },
        userId: user?.id,
        extra: { orderId: order.id, amount: grandTotal, errorMessage: result.error },
      })
      setError(result.error); setLoading(false); return
    }

    clearCart()
    // Runner-funded orders bypass Paystack entirely — jump to tracking.
    if (result.skipPayment) {
      window.location.href = result.trackUrl ?? `/track/${order.id}`
      return
    }
    window.location.href = result.authorization_url
  }

  /* ── Loading states ─────────────────────────────────────── */

  if (validating) return (
    <div className="mobile-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 36 }}>🔍</div>
      <p style={{ color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontFamily: "'Nunito', sans-serif", margin: 0 }}>
        Checking availability…
      </p>
    </div>
  )

  if (!restaurantOpen) return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>😔</div>
      <h2 className="font-display" style={{ color: 'white', fontSize: 22, margin: '0 0 8px' }}>{restaurantName} is closed</h2>
      <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 14, fontWeight: 600, margin: '0 0 28px', lineHeight: 1.6 }}>
        This restaurant closed while you were ordering. Your cart has been saved.
      </p>
      <button onClick={() => router.push('/home')} className="press" style={{ background: 'var(--accent, #FF6B2B)', color: 'white', fontWeight: 900, fontSize: 16, padding: '14px 32px', borderRadius: 16, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        Browse other restaurants
      </button>
    </div>
  )

  if (unavailableItems.length > 0) return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
      <h2 className="font-display" style={{ color: 'white', fontSize: 20, margin: '0 0 8px' }}>Some items are unavailable</h2>
      <p style={{ color: 'var(--ink-3, #6B6660)', fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>These items are no longer available:</p>
      <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 14, padding: '12px 16px', marginBottom: 24, border: '1px solid var(--line, #2A2825)', width: '100%' }}>
        {unavailableItems.map(name => (
          <p key={name} style={{ color: 'var(--danger, #FF3B30)', fontWeight: 700, fontSize: 14, margin: '4px 0' }}>• {name}</p>
        ))}
      </div>
      <button onClick={() => router.back()} className="press" style={{ background: 'var(--accent, #FF6B2B)', color: 'white', fontWeight: 900, fontSize: 16, padding: '14px 32px', borderRadius: 16, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        Go back to menu
      </button>
    </div>
  )

  /* ── Main checkout ──────────────────────────────────────── */

  const addressReady = deliveryAddress.trim().length >= 10
  const totalItemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className="mobile-container" style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '52px 20px 14px', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
        <button onClick={() => router.back()} className="press" aria-label="Back" style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, cursor: 'pointer' }}>
          <ChevronLeft size={18} />
        </button>
        <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: 0, fontSize: 10 }}>Checkout</p>
        <h1 className="font-display" style={{ fontSize: 24, margin: '4px 0 0', color: 'white' }}>{restaurantName || 'Pantry order'}</h1>
      </div>

      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Items */}
        <section style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: 16 }}>
          <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '0 0 8px', fontSize: 10 }}>Your order</p>
          {items.filter(i => !i.options?.is_pantry).map(item => {
            const portions = item.options?.portions
            const hasPortions = portions && Array.isArray(portions)
            
            if (hasPortions && portions) {
              const addons = item.options?.addons ?? []
              return (
                <React.Fragment key={item.menu_item_id}>
                  {portions.map((portion: {price: number; quantity: number}, idx: number) => (
                    <div key={`${item.menu_item_id}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line-soft, #1F1D1B)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2, #A09A8E)' }}>
                        {item.name} ×{portion.quantity}
                        <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 500 }}>
                          (₦{portion.price.toLocaleString()} each)
                        </span>
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                        ₦{(portion.price * portion.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {addons.map((addon: {menu_item_id: string; name: string; price: number; quantity: number; portions?: Array<{price: number; quantity: number}>}, aidx: number) => {
                    const isPortioned = addon.portions && addon.portions.length > 0
                    const addonCost = isPortioned
                      ? addon.portions!.reduce((s, p) => s + p.price * p.quantity, 0)
                      : addon.price * addon.quantity
                    const addonDesc = isPortioned
                      ? addon.portions!.map(p => `${p.quantity}×₦${p.price.toLocaleString()}`).join(', ')
                      : `×${addon.quantity}`
                    return (
                      <div key={`addon-${aidx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0 5px 14px', borderTop: '1px solid var(--line-soft, #1F1D1B)' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3, #6B6660)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 9, color: 'var(--accent, #FF6B2B)', fontWeight: 900 }}>⮡</span>
                          {addon.name} {addonDesc}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2, #A09A8E)' }}>₦{addonCost.toLocaleString()}</span>
                      </div>
                    )
                  })}
                </React.Fragment>
              )
            }
            
            const itemTotal = item.price * item.quantity
            return (
              <div key={item.menu_item_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line-soft, #1F1D1B)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2, #A09A8E)' }}>
                  {item.name} ×{item.quantity}
                  {item.options?.swallow && (
                    <span style={{ marginLeft: 6, background: 'rgba(255,107,43,0.12)', color: 'var(--accent, #FF6B2B)', fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 5 }}>
                      {item.options.swallow === 'garri' ? 'Garri (Eba)' : 'Fufu'}
                    </span>
                  )}
                  {item.quantity > 1 && (
                    <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 500 }}>
                      (₦{item.price.toLocaleString()} each)
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>₦{itemTotal.toLocaleString()}</span>
              </div>
            )
          })}
          
          {/* Pantry items in this order */}
          {items.filter(i => i.options?.is_pantry).length > 0 && (
            <>
              <div style={{ padding: '12px 0 6px', borderTop: '1px solid var(--line, #2A2825)', marginTop: 8 }}>
                <p className="label-cap" style={{ color: 'var(--accent, #FF6B2B)', fontSize: 10, margin: 0 }}>From the Pantry</p>
              </div>
              {items.filter(i => i.options?.is_pantry).map(item => (
                <div key={item.menu_item_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line-soft, #1F1D1B)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2, #A09A8E)' }}>
                    {item.name} ×{item.quantity}
                    {item.quantity > 1 && (
                      <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 500 }}>
                        (₦{item.price.toLocaleString()} each)
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>₦{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </>
          )}

          {wantPlate && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line-soft, #1F1D1B)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2, #A09A8E)' }}>
                🍽️ Plate fee ({totalItemCount} items)
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>₦{plateFee.toLocaleString()}</span>
            </div>
          )}
        </section>

        {/* Plate preference */}
        <div style={{ background: 'var(--bg-1, #1A1917)', borderRadius: 16, padding: 16, marginBottom: 12, border: '1px solid var(--line, #2A2825)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: wantPlate ? 8 : 0 }}>
            <div>
              <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>🍽️ Plate</p>
              <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>{wantPlate ? '+₦200 per item · Served on a plate' : 'Packed in foil — no charge'}</p>
            </div>
            <button
              onClick={() => setWantPlate(!wantPlate)}
              style={{ width: 52, height: 28, borderRadius: 14, background: wantPlate ? 'var(--accent, #FF6B2B)' : 'var(--line, #2A2825)', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
            >
              <div style={{ position: 'absolute', top: 3, width: 22, height: 22, background: 'white', borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transition: 'left 0.2s', left: wantPlate ? 27 : 3 }} />
            </button>
          </div>
        </div>

        {/* Address */}
        <section style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: 16 }}>
          <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '0 0 10px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={11} /> Delivery location
          </p>
          <textarea
            value={deliveryAddress}
            onChange={e => setDeliveryAddress(e.target.value)}
            placeholder="Block C, Alvan Ikoku Hall, Room 204"
            rows={2}
            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: 'white', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
          />
          {deliveryAddress.trim().length > 0 && deliveryAddress.trim().length < 10 && (
            <p style={{ color: '#FF9500', fontSize: 12, fontWeight: 700, margin: '6px 0 0' }}>
              ⚠️ Be more specific so your runner can find you
            </p>
          )}
          <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '6px 0 0' }}>
            Tip: include your hall, block, and room number for fastest drop.
          </p>
        </section>

        {/* Order notes */}
        <section style={{ background: 'var(--bg-1, #1A1917)', border: `1px solid ${orderNotes ? 'rgba(255,107,43,0.3)' : 'var(--line, #2A2825)'}`, borderRadius: 16, padding: 16, transition: 'border-color 0.2s' }}>
          <p className="label-cap" style={{ color: 'var(--ink-3, #6B6660)', margin: '0 0 8px', fontSize: 10 }}>
            📝 Special instructions (optional)
          </p>
          <textarea
            value={orderNotes}
            onChange={e => setOrderNotes(e.target.value)}
            placeholder="e.g. Extra sauce, no pepper, knock twice..."
            maxLength={200}
            rows={2}
            style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 13, fontWeight: 600, color: 'white', resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6 }}
          />
          <p style={{ fontSize: 10, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '4px 0 0', textAlign: 'right' }}>
            {orderNotes.length}/200
          </p>
        </section>

        {/* Price breakdown */}
        <section style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 600 }}>Food total</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>₦{subtotal.toLocaleString()}</span>
          </div>
          
          {wantPlate && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 600 }}>
                🍽️ Plate fee
                <span style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', marginLeft: 4 }}>
                  (₦200 × {totalItemCount})
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>₦{plateFee.toLocaleString()}</span>
            </div>
          )}
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 600 }}>Delivery fee</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>₦{DELIVERY_FEE.toLocaleString()}</span>
          </div>

          <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
          </div>

          {/* Paystack fee heads-up */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1 }}>ℹ️</span>
            <p style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, margin: 0, lineHeight: 1.5 }}>
              Paystack will add ~₦{processingFee.toLocaleString()} processing fee at the next step. That goes to Paystack, not us.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>Total</span>
            <span className="font-display" style={{ fontSize: 22, color: 'var(--accent, #FF6B2B)' }}>
              ₦{grandTotal.toLocaleString()}
            </span>
          </div>
        </section>

        {/* Schedule for later */}
        {/* Pre-order info banner */}
        {preOrderPhase?.phase === 'pre_order_open' && preOrderPhase.peakAt && !scheduleEnabled && (
          <section style={{ background: 'linear-gradient(135deg, rgba(255,107,43,0.14), rgba(255,138,79,0.06))', border: '1px solid rgba(255,107,43,0.35)', borderRadius: 16, padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--accent, #FF6B2B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 20, color: 'white' }}>{'\u26A1'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 900, fontSize: 14, color: 'var(--accent, #FF6B2B)', margin: 0 }}>This is a pre-order</p>
              <p style={{ fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '3px 0 0', lineHeight: 1.4 }}>
                Your food will be ready at <b style={{ color: 'white' }}>{new Date(preOrderPhase.peakAt).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true })}</b>. Skip the line, no queue.
              </p>
            </div>
          </section>
        )}
        {preOrderPhase?.phase === 'post_peak' && (
          <section style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 16, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 18 }}>{'\u23F3'}</span>
            <p style={{ fontSize: 12, color: 'var(--warn, #FFB800)', fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
              <b>Peak hours active.</b> Expect 30+ minute delivery times.
            </p>
          </section>
        )}

        <section style={{ background: 'var(--bg-1, #1A1917)', border: `1px solid ${scheduleEnabled ? 'rgba(255,184,0,0.35)' : 'var(--line, #2A2825)'}`, borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: scheduleEnabled ? 'rgba(255,184,0,0.12)' : 'var(--bg-2, #26241F)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16 }}>&#x1F551;</span>
              </div>
              <div>
                <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>Schedule for later</p>
                <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>
                  {scheduleEnabled && scheduledFor
                    ? `Delivering at ${new Date(scheduledFor).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Deliver now or pick a time'}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setScheduleEnabled(e => !e); setScheduledFor('') }}
              style={{ width: 46, height: 26, borderRadius: 999, background: scheduleEnabled ? '#FFB800' : 'var(--bg-2, #26241F)', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}
            >
              <div style={{ position: 'absolute', top: 3, width: 20, height: 20, background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', left: scheduleEnabled ? 23 : 3, transition: 'left 0.2s' }} />
            </button>
          </div>
          {scheduleEnabled && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 800, color: '#FFB800', margin: '0 0 8px', letterSpacing: '0.1em' }}>PICK A TIME</p>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {timeSlots.map(slot => (
                  <button
                    key={slot.value}
                    onClick={() => setScheduledFor(slot.value)}
                    style={{ padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${scheduledFor === slot.value ? '#FFB800' : 'var(--line, #2A2825)'}`, background: scheduledFor === slot.value ? 'rgba(255,184,0,0.12)' : 'var(--bg-0, #0C0B09)', color: scheduledFor === slot.value ? '#FFB800' : 'var(--ink-2, #A09A8E)', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Payment method */}
        <section style={{ background: 'var(--bg-1, #1A1917)', border: '1px solid var(--line, #2A2825)', borderRadius: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-2, #26241F)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Landmark size={16} color="#FF6B2B" />
          </div>
          <div>
            <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>Bank Transfer / USSD</p>
            <p style={{ fontSize: 11, color: 'var(--ink-3, #6B6660)', fontWeight: 500, margin: '2px 0 0' }}>
              You&apos;ll get payment details from Paystack.
            </p>
          </div>
        </section>

        {/* Delivery code note */}
        <div style={{ background: 'rgba(255,107,43,0.08)', borderRadius: 14, padding: '10px 14px', border: '1px solid rgba(255,107,43,0.15)' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,107,43,0.8)', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
            🔐 You&apos;ll receive a 4-digit delivery code after your runner picks up. Share it only with your runner to confirm delivery.
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--danger, #FF3B30)', lineHeight: 1.5 }}>
            {error}
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ padding: '12px 16px 24px', background: 'linear-gradient(to top, var(--bg-0, #0C0B09) 70%, transparent)' }}>
        <button
          onClick={handlePlaceOrder}
          disabled={loading || !addressReady}
          className="press"
          style={{
            width: '100%',
            background: loading || !addressReady ? '#2A2825' : 'var(--accent, #FF6B2B)',
            color:      loading || !addressReady ? '#555'    : 'white',
            fontWeight: 800, fontSize: 15, padding: 16, borderRadius: 16,
            border: 'none', cursor: loading || !addressReady ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: loading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span>
          {loading ? 'Processing…' : preOrderPhase?.phase === 'pre_order_open' && preOrderPhase.peakAt && !scheduleEnabled
          ? `Pre-order for ${new Date(preOrderPhase.peakAt).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true })}`
          : scheduleEnabled && scheduledFor
          ? `Schedule for ${new Date(scheduledFor).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`
          : 'Place order'}
          </span>
          {!loading && (
            <span className="font-display" style={{ fontSize: 16 }}>
              ₦{grandTotal.toLocaleString()}
            </span>
          )}
        </button>

      </div>
    </div>
  )
}