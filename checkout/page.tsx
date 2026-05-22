'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cart'
import { Landmark, MapPin } from 'lucide-react'

const DELIVERY_FEE = 500
const PLATFORM_CUT = 200
const RUNNER_EARNINGS = 300
function generateOrderRef() { return `CR-${Math.floor(1000 + Math.random() * 9000)}` }

export default function CheckoutPage() {
  const router = useRouter()
  const supabase = createClient()
  const { items, restaurantId, restaurantName, foodTotal, deliveryAddress, setDeliveryAddress, clearCart } = useCartStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const subtotal = foodTotal()
  const total = subtotal + DELIVERY_FEE

  if (items.length === 0) { router.push('/home'); return null }

  async function handlePlaceOrder() {
    if (!deliveryAddress.trim()) { setError('Please enter your delivery address'); return }
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('users').select('email').eq('id', user.id).single()
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      order_ref: generateOrderRef(), customer_id: user.id, restaurant_id: restaurantId, items,
      delivery_address: deliveryAddress, food_total: subtotal, delivery_fee: DELIVERY_FEE,
      platform_cut: PLATFORM_CUT, runner_earnings: RUNNER_EARNINGS, status: 'pending', broadcast_count: 0,
    }).select().single()
    if (orderError) { setError('Failed to create order: ' + orderError.message); setLoading(false); return }
    const res = await fetch('/api/payments/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, amount: total, email: profile?.email || user.email }) })
    const result = await res.json()
    if (result.error) { setError(result.error); setLoading(false); return }
    clearCart()
    window.location.href = result.authorization_url
  }

  const dark = { bg: '#0C0B09', card: '#1A1917', border: '#2A2825', text: 'white', muted: '#666' }

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: dark.bg, fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: dark.card, padding: '52px 20px 16px', borderBottom: `1px solid ${dark.border}` }}>
        <button onClick={() => router.back()} style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, display: 'block', color: dark.text }}>←</button>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: dark.text }}>Checkout</h1>
        <p style={{ fontSize: 13, color: dark.muted, fontWeight: 600, marginTop: 2 }}>{restaurantName}</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Order items */}
        <div style={{ background: dark.card, borderRadius: 16, padding: 16, marginBottom: 12, border: `1px solid ${dark.border}` }}>
          <p style={{ fontWeight: 800, fontSize: 14, margin: '0 0 12px', color: dark.text }}>Your order</p>
          {items.map(item => (
            <div key={item.menu_item_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${dark.border}` }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: dark.muted }}>{item.name} ×{item.quantity}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: dark.text }}>₦{(item.price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Address */}
        <div style={{ background: '#0D1B2A', borderRadius: 16, padding: 16, marginBottom: 12, border: '1px solid #1A2E42' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#4A9EFF', marginBottom: 6 }}><MapPin size={12} style={{marginRight:4,verticalAlign:'middle'}} /> Delivery location</p>
          <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="e.g. Block C, Alvan Ikoku Hall, Room 204" rows={2}
            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: dark.text, resize: 'none', outline: 'none', fontFamily: 'inherit' }} />
        </div>

        {/* Price */}
        <div style={{ background: dark.card, borderRadius: 16, padding: 16, marginBottom: 12, border: `1px solid ${dark.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: dark.muted, fontWeight: 600 }}>Food total</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: dark.text }}>₦{subtotal.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: dark.muted, fontWeight: 600 }}>Delivery fee</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: dark.text }}>₦{DELIVERY_FEE.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: `2px solid ${dark.border}` }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: dark.text }}>Total</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#FF6B2B' }}>₦{total.toLocaleString()}</span>
          </div>
        </div>

        {/* Payment */}
        <div style={{ background: dark.card, borderRadius: 16, padding: 16, marginBottom: 12, border: `1px solid ${dark.border}` }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: dark.text, margin: '0 0 3px' }}><Landmark size={14} style={{marginRight:6,verticalAlign:'middle'}} /> Bank Transfer / USSD</p>
          <p style={{ fontSize: 12, color: dark.muted, fontWeight: 600, margin: 0 }}>You&apos;ll get payment details from Paystack</p>
        </div>

        {error && <div style={{ background: '#2A0A0A', color: '#FF5555', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
      </div>

      <div style={{ padding: '12px 16px 28px', background: dark.card, borderTop: `1px solid ${dark.border}` }}>
        <button onClick={handlePlaceOrder} disabled={loading} style={{ width: '100%', background: '#FF6B2B', color: 'white', fontWeight: 900, fontSize: 17, padding: 16, borderRadius: 16, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Processing...' : `Place Order · ₦${total.toLocaleString()}`}
        </button>
      </div>
    </div>
  )
}
