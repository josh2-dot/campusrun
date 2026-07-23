// app/api/admin/manual-order/create/route.ts
// Creates a draft order from manual admin entry + generates a Paystack link.
// Customer pays via the link; webhook converts draft → paid and broadcasts to runners.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/sentry'
import crypto from 'crypto'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY
const PAYSTACK_BASE   = 'https://api.paystack.co'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    customer_phone,
    customer_name,
    customer_email,
    restaurant_id,
    items,        // Array<{ menu_item_id, name, price, quantity }>
    delivery_address,
    delivery_fee = 500,
    want_plate   = false,
    plate_fee_per_item = 200,
    notes,
    raw_message,
  } = body as {
    customer_phone: string
    customer_name?: string
    customer_email?: string
    restaurant_id: string
    items: Array<{
      menu_item_id: string
      name:         string
      price:        number
      quantity:     number
      options?: {
        is_pantry?: boolean
        swallow?:   'garri' | 'fufu'
        portions?:  Array<{ price: number; quantity: number }>
        addons?:    Array<{ menu_item_id: string; name: string; price: number; quantity: number; portions?: Array<{ price: number; quantity: number }> }>
      }
    }>
    delivery_address: string
    delivery_fee?: number
    want_plate?: boolean
    plate_fee_per_item?: number
    notes?: string
    raw_message?: string
  }

  // Validate
  if (!customer_phone || !restaurant_id || !items?.length || !delivery_address) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Authz
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: caller } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!caller || !['admin', 'support'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find or create the customer (by phone)
  const normalizedPhone = customer_phone.trim()
  let { data: existingCustomer } = await admin
    .from('users')
    .select('id, email, full_name, phone')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  let customerId: string
  let customerEmail: string

  if (existingCustomer) {
    customerId = existingCustomer.id
    customerEmail = existingCustomer.email || customer_email || `${normalizedPhone.replace(/[^0-9]/g, '')}@whatsapp.campusrun.food`
  } else {
    // Create a placeholder customer that they can claim later
    const placeholderEmail = customer_email || `${normalizedPhone.replace(/[^0-9]/g, '')}@whatsapp.campusrun.food`
    const { data: newCustomer, error: createErr } = await admin.auth.admin.createUser({
      email: placeholderEmail,
      email_confirm: true,
      user_metadata: {
        full_name: customer_name || 'WhatsApp Customer',
        phone:     normalizedPhone,
        source:    'whatsapp_manual',
      },
    })
    if (createErr || !newCustomer.user) {
      captureError(createErr || new Error('Customer create failed'), { tags: { event: 'manual_order_customer_create_failed' } })
      return NextResponse.json({ error: 'Could not create customer placeholder' }, { status: 500 })
    }
    customerId = newCustomer.user.id
    customerEmail = placeholderEmail

    // Insert into users table
    await admin.from('users').insert({
      id:              customerId,
      email:           placeholderEmail,
      full_name:       customer_name || 'WhatsApp Customer',
      phone:           normalizedPhone,
      role:            'customer',
      is_active:       true,
      onboarding_done: true, // skip onboarding for WhatsApp-sourced customers
    })
  }

  // Compute totals — handles options (portions + addons) the same way cart.ts does
  function lineTotal(i: typeof items[0]): number {
    if (i.options?.portions && i.options.portions.length > 0) {
      const portionsTotal = i.options.portions.reduce((s, p) => s + p.price * p.quantity, 0)
      const addonsTotal = (i.options.addons ?? []).reduce((s, a) => {
        if (a.portions && a.portions.length > 0) return s + a.portions.reduce((ps, p) => ps + p.price * p.quantity, 0)
        return s + a.price * a.quantity
      }, 0)
      return (portionsTotal + addonsTotal) * i.quantity
    }
    return i.price * i.quantity
  }
  const foodTotal = items.reduce((sum, i) => sum + lineTotal(i), 0)
  const totalItemsForPlate = items.reduce((sum, i) => sum + i.quantity, 0)
  const plateFee = want_plate ? totalItemsForPlate * plate_fee_per_item : 0
  const orderTotal = foodTotal + plateFee + delivery_fee

  // Generate draft token + expiry
  const draftToken = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  // Read the restaurant's runner-funded flag so payment_model gets set correctly.
  // Without this, admin-created orders default to restaurant_paid regardless of
  // the restaurant's flag.
  const { data: restRow } = await admin
    .from('restaurants')
    .select('requires_runner_funded')
    .eq('id', restaurant_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentModel: 'restaurant_paid' | 'runner_funded' =
    (restRow as any)?.requires_runner_funded ? 'runner_funded' : 'restaurant_paid'

  // Insert the draft order
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      customer_id:        customerId,
      restaurant_id:      restaurant_id,
      items:              items.map(i => ({ menu_item_id: i.menu_item_id, name: i.name, price: i.price, quantity: i.quantity, options: i.options })),
      food_total:         foodTotal + plateFee,
      delivery_fee:       delivery_fee,
      total:              orderTotal,
      delivery_address:   delivery_address,
      want_plate:         want_plate,
      status:             'pending', // existing flow expects 'pending' before payment
      source:             'whatsapp_manual',
      draft_token:        draftToken,
      draft_expires_at:   expiresAt,
      notes:              notes,
      payment_model:      paymentModel,
    })
    .select()
    .single()

  if (orderErr || !order) {
    captureError(orderErr || new Error('Order create failed'), {
      tags: { event: 'manual_order_create_failed' },
      extra: { customerPhone: normalizedPhone, restaurant_id },
    })
    return NextResponse.json({ error: 'Could not create order: ' + (orderErr?.message ?? 'unknown') }, { status: 500 })
  }

  // Audit log
  await admin.from('manual_order_log').insert({
    order_id:       order.id,
    created_by:     user.id,
    raw_message:    raw_message,
    parsed_summary: { items, total: orderTotal, customer_phone: normalizedPhone },
  })

  // Initialize Paystack transaction
  if (!PAYSTACK_SECRET) {
    return NextResponse.json({ error: 'Paystack not configured' }, { status: 500 })
  }

  const callbackUrl = `${req.nextUrl.origin}/api/payments/callback`
  const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      email:        customerEmail,
      amount:       orderTotal * 100, // kobo
      callback_url: callbackUrl,
      metadata: {
        order_id:     order.id,
        customer_id:  customerId,
        source:       'whatsapp_manual',
        draft_token:  draftToken,
      },
    }),
  })

  const paystackData = await paystackRes.json()
  if (!paystackData?.status || !paystackData?.data?.authorization_url) {
    captureError(new Error('Paystack init failed for manual order'), {
      tags: { event: 'manual_order_paystack_failed' },
      extra: { orderId: order.id, paystackResponse: paystackData },
    })
    return NextResponse.json({ error: 'Could not generate payment link' }, { status: 500 })
  }

  // Save the reference on the order
  await admin
    .from('orders')
    .update({ paystack_reference: paystackData.data.reference })
    .eq('id', order.id)

  return NextResponse.json({
    success: true,
    order_id: order.id,
    order_ref: order.order_ref,
    payment_url: paystackData.data.authorization_url,
    paystack_reference: paystackData.data.reference,
    expires_at: expiresAt,
    total: orderTotal,
  })
}
