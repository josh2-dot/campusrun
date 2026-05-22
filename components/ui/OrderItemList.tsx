// components/ui/OrderItemList.tsx
// Renders a full, detailed item list for any order.
// Handles: regular items, swallow choice, portion items, bundled addons (with their own portions).
// Used on: receipt, track, runner order, orders history, checkout summary, admin pre-orders, admin dashboard.

import type { CartItem } from '@/types'

type Item = CartItem & Record<string, unknown>

// ── Helpers ──────────────────────────────────────────────────────
const N = '\u20A6'

function swallowLabel(s: string) {
  return s === 'garri' ? 'Garri (Eba)' : 'Fufu'
}

function itemBasePrice(item: Item): number {
  if (item.options?.portions?.length) {
    return (item.options.portions as Array<{ price: number; quantity: number }>)
      .reduce((s, p) => s + p.price * p.quantity, 0)
  }
  return item.price * item.quantity
}

function addonPrice(addon: {
  price: number; quantity: number
  portions?: Array<{ price: number; quantity: number }>
}): number {
  if (addon.portions?.length) {
    return addon.portions.reduce((s, p) => s + p.price * p.quantity, 0)
  }
  return addon.price * addon.quantity
}

function itemTotal(item: Item): number {
  const base   = itemBasePrice(item)
  const addons = (item.options?.addons ?? []) as Array<{
    price: number; quantity: number
    portions?: Array<{ price: number; quantity: number }>
  }>
  return base + addons.reduce((s, a) => s + addonPrice(a), 0)
}

// ── Theme presets ─────────────────────────────────────────────────
// 'dark'  = customer-facing dark screens (track, runner order)
// 'paper' = receipt paper (monospace, cream palette)
// 'light' = light-background screens (runner order page, admin)
// 'admin' = compact, no prices, just items

export type OrderItemTheme = 'dark' | 'paper' | 'admin'

interface OrderItemListProps {
  items: CartItem[]
  theme?: OrderItemTheme
  showPrices?: boolean    // default true
  showTotal?: boolean     // default false
  totalLabel?: string     // default 'Total'
  foodTotal?: number      // override calculated total (if plates fees etc.)
  deliveryFee?: number
}

export function OrderItemList({
  items,
  theme = 'dark',
  showPrices = true,
  showTotal = false,
  totalLabel = 'Total',
  foodTotal,
  deliveryFee,
}: OrderItemListProps) {
  const mono  = "'Courier New', ui-monospace, monospace"
  const isPaper = theme === 'paper'
  const isAdmin = theme === 'admin'

  const baseColor    = isPaper ? '#1A1917' : isAdmin ? 'var(--ink-2, #A09A8E)' : 'white'
  const mutedColor   = isPaper ? '#8B857B' : isAdmin ? 'var(--ink-3, #6B6660)' : 'var(--ink-3, #6B6660)'
  const accentColor  = isPaper ? '#FF6B2B' : 'var(--accent, #FF6B2B)'
  const dividerColor = isPaper ? '#C9C0B0' : 'var(--line-soft, #1F1D1B)'
  const fontFamily   = isPaper ? mono : "inherit"
  const nameFontSize = isPaper ? 13 : isAdmin ? 12 : 14
  const detailFontSize = isPaper ? 11 : 11
  const divider = `1px solid ${dividerColor}`

  const calculated = items.reduce((s, i) => s + itemTotal(i as Item), 0)
  const grandTotal = (foodTotal ?? calculated) + (deliveryFee ?? 0)

  return (
    <div style={{ fontFamily }}>
      {items.map((item, i) => {
        const it       = item as Item
        const portions = it.options?.portions as Array<{ price: number; quantity: number }> | undefined
        const addons   = it.options?.addons   as Array<{
          menu_item_id: string; name: string; price: number; quantity: number
          portions?: Array<{ price: number; quantity: number }>
        }> | undefined
        const swallow  = it.options?.swallow as string | undefined
        const hasPortions = portions && portions.length > 0
        const hasAddons   = addons   && addons.length   > 0
        const total       = itemTotal(it)
        const isLast      = i === items.length - 1

        return (
          <div key={i} style={{
            paddingBottom: 10,
            marginBottom: 10,
            borderBottom: isLast ? 'none' : divider,
          }}>

            {/* Main dish line */}
            {hasPortions ? (
              // Portion item — show each size as sub-line
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                  <span style={{ fontWeight: 800, fontSize: nameFontSize, color: baseColor, flex: 1, marginRight: 8 }}>
                    {it.name}
                    {swallow && (
                      <span style={{ marginLeft: 8, background: 'rgba(255,107,43,0.12)', color: accentColor, fontSize: 10, fontWeight: 900, padding: '1px 6px', borderRadius: 4, border: `1px solid rgba(255,107,43,0.25)` }}>
                        {swallowLabel(swallow)}
                      </span>
                    )}
                  </span>
                  {showPrices && (
                    <span style={{ fontWeight: 800, fontSize: nameFontSize, color: baseColor, whiteSpace: 'nowrap' }}>
                      {N}{total.toLocaleString()}
                    </span>
                  )}
                </div>
                {portions.map((p, pi) => (
                  <p key={pi} style={{ fontSize: detailFontSize, color: mutedColor, fontWeight: 600, margin: '2px 0 0' }}>
                    {'\u00B7'} {p.quantity} {p.quantity === 1 ? 'plate' : 'plates'} {showPrices ? `${N}${p.price.toLocaleString()} each` : ''}
                  </p>
                ))}
              </div>
            ) : (
              // Regular item
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: nameFontSize, color: baseColor }}>
                    {it.name}
                    {swallow && (
                      <span style={{ marginLeft: 8, background: 'rgba(255,107,43,0.12)', color: accentColor, fontSize: 10, fontWeight: 900, padding: '1px 6px', borderRadius: 4, border: `1px solid rgba(255,107,43,0.25)` }}>
                        {swallowLabel(swallow)}
                      </span>
                    )}
                  </span>
                  {showPrices && it.quantity > 1 && (
                    <p style={{ fontSize: detailFontSize, color: mutedColor, fontWeight: 600, margin: '2px 0 0' }}>
                      {it.quantity} {'\u00D7'} {N}{it.price.toLocaleString()}
                    </p>
                  )}
                  {!showPrices && it.quantity > 1 && (
                    <p style={{ fontSize: detailFontSize, color: mutedColor, fontWeight: 600, margin: '2px 0 0' }}>
                      {'×'}{it.quantity}
                    </p>
                  )}
                </div>
                {showPrices && (
                  <span style={{ fontWeight: 800, fontSize: nameFontSize, color: baseColor, whiteSpace: 'nowrap' }}>
                    {N}{(it.price * it.quantity).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            {/* Bundled addons */}
            {hasAddons && addons!.map((addon, ai) => {
              const ap = addonPrice(addon)
              const isPortioned = addon.portions && addon.portions.length > 0
              return (
                <div key={ai} style={{ marginTop: 5, paddingLeft: 10, borderLeft: `2px solid ${isPaper ? '#D4C8B0' : 'var(--line, #2A2825)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: detailFontSize, fontWeight: 700, color: isPaper ? '#4A463F' : 'var(--ink-2, #A09A8E)' }}>
                      + {addon.name}
                    </span>
                    {showPrices && (
                      <span style={{ fontSize: detailFontSize, fontWeight: 700, color: mutedColor, whiteSpace: 'nowrap' }}>
                        {N}{ap.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {isPortioned && addon.portions!.map((p, pi) => (
                    <p key={pi} style={{ fontSize: 10, color: mutedColor, fontWeight: 600, margin: '1px 0 0' }}>
                      {'\u00B7'} {p.quantity} {p.quantity === 1 ? 'piece' : 'pieces'} {showPrices ? `${N}${p.price.toLocaleString()} each` : ''}
                    </p>
                  ))}
                  {!isPortioned && addon.quantity > 1 && (
                    <p style={{ fontSize: 10, color: mutedColor, fontWeight: 600, margin: '1px 0 0' }}>
                      {'\u00B7'} {'×'}{addon.quantity}
                    </p>
                  )}
                </div>
              )
            })}

          </div>
        )
      })}

      {/* Optional grand total */}
      {showTotal && showPrices && (
        <>
          <div style={{ borderTop: `2px dashed ${isPaper ? '#8B857B' : 'var(--line, #2A2825)'}`, margin: '8px 0 10px' }} />
          {deliveryFee !== undefined && deliveryFee > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: mutedColor, fontWeight: 600, marginBottom: 4 }}>
              <span>Delivery</span>
              <span>{N}{deliveryFee.toLocaleString()}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, fontSize: nameFontSize, color: baseColor }}>{totalLabel}</span>
            <span className="font-display" style={{ fontSize: 20, color: accentColor }}>
              {N}{grandTotal.toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
