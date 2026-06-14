// components/ui/PortionPickerSheet.tsx
// Reusable portion picker — used on both the customer-facing restaurant page
// and the admin manual-order tool. Same look, same data shape, single source of truth.

'use client'

import { useState } from 'react'
import type { MenuItem } from '@/types'

export type PortionAddon = {
  menu_item_id: string
  name:         string
  price:        number
  quantity:     number
  portions?:    Array<{ price: number; quantity: number }>
}

export type PortionSelection = { price: number; quantity: number }

export function PortionPickerSheet({ item, extras = [], onConfirm, onClose }: {
  item:     MenuItem
  extras?:  MenuItem[]
  onConfirm: (
    selections: PortionSelection[],
    addons:     PortionAddon[],
    swallow?:   'garri' | 'fufu'
  ) => void
  onClose: () => void
}) {
  const N = '\u20A6'
  const SWALLOW_KW = ['swallow', 'eba', 'fufu', 'garri', 'amala', 'pounded yam', 'semovita', 'tuwo']
  const isSwallow  = SWALLOW_KW.some(k => (item.name + ' ' + (item.category ?? '')).toLowerCase().includes(k))
  const minPrice  = item.portion_min_price  ?? item.price
  const firstStep = item.portion_first_step ?? 200
  const step      = item.portion_step       ?? 100
  const maxPrice  = item.portion_max_price  ?? item.price
  const steps: number[] = [minPrice]
  if (maxPrice > minPrice && firstStep > 0) {
    const second = minPrice + firstStep
    if (second <= maxPrice) {
      steps.push(second)
      if (step > 0) { let c = second + step; while (c <= maxPrice) { steps.push(c); c += step } }
    }
  }
  const [selectedPrice, setSelectedPrice] = useState(steps[0])
  const [swallowChoice, setSwallowChoice] = useState<'garri' | 'fufu' | null>(null)
  const [addonQtys, setAddonQtys] = useState<Record<string, number>>({})
  const [addonPortionQtys, setAddonPortionQtys] = useState<Record<string, Record<number, number>>>({})
  function incA(id: string) { setAddonQtys(q => ({ ...q, [id]: (q[id] ?? 0) + 1 })) }
  function decA(id: string) {
    setAddonQtys(q => { const next = (q[id] ?? 0) - 1; if (next <= 0) { const { [id]: _, ...rest } = q; return rest }; return { ...q, [id]: next } })
  }
  function incAP(id: string, price: number) {
    setAddonPortionQtys(q => ({ ...q, [id]: { ...(q[id] ?? {}), [price]: ((q[id] ?? {})[price] ?? 0) + 1 } }))
  }
  function decAP(id: string, price: number) {
    setAddonPortionQtys(q => { const tier = { ...(q[id] ?? {}) }; tier[price] = (tier[price] ?? 0) - 1; if (tier[price] <= 0) delete tier[price]; return { ...q, [id]: tier } })
  }
  function pickSize(price: number) { setSelectedPrice(price); setAddonQtys({}); setAddonPortionQtys({}) }
  const addonSelections: PortionAddon[] = extras
    .filter(e => { if (e.has_portions) return Object.values(addonPortionQtys[e.id] ?? {}).some(qty => qty > 0); return (addonQtys[e.id] ?? 0) > 0 })
    .map(e => {
      if (e.has_portions) {
        const portionList = Object.entries(addonPortionQtys[e.id] ?? {}).map(([p, q]) => ({ price: Number(p), quantity: q })).filter(p => p.quantity > 0)
        return { menu_item_id: e.id, name: e.name, price: 0, quantity: 0, portions: portionList }
      }
      return { menu_item_id: e.id, name: e.name, price: e.price, quantity: addonQtys[e.id], portions: undefined }
    })
  const addonAmount = addonSelections.reduce((s, a) => {
    if (a.portions && a.portions.length > 0) return s + a.portions.reduce((ps, p) => ps + p.price * p.quantity, 0)
    return s + a.price * a.quantity
  }, 0)
  const selections: PortionSelection[] = [{ price: selectedPrice, quantity: 1 }]
  const totalAmount = selectedPrice + addonAmount
  const canAdd      = !isSwallow || swallowChoice !== null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', maxWidth: 430, margin: '0 auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', background: 'var(--bg-1, #1A1917)', borderTopLeftRadius: 24, borderTopRightRadius: 24, border: '1px solid var(--line, #2A2825)', borderBottom: 'none', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 18px' }} />
          <p style={{ fontWeight: 900, fontSize: 17, color: 'white', margin: '0 0 2px' }}>{item.name}</p>
          <p style={{ fontSize: 13, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '0 0 20px' }}>
            {isSwallow ? 'Build your plate.' : 'Pick a size, then build your plate.'}
          </p>
        </div>
        <div className="scroll-hide" style={{ overflowY: 'auto', padding: '0 20px', flex: 1 }}>
          {steps.length > 1 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3, #6B6660)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>Size</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
                {steps.map(p => { const on = selectedPrice === p; return (
                  <button key={p} onClick={() => pickSize(p)} className="press"
                    style={{ padding: '8px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 14, background: on ? 'var(--accent, #FF6B2B)' : 'var(--bg-0, #0C0B09)', color: on ? 'white' : 'var(--ink-2, #A09A8E)', border: on ? 'none' : '1px solid var(--line, #2A2825)', boxShadow: on ? '0 2px 8px rgba(255,107,43,0.35)' : 'none' }}>
                    {N}{p.toLocaleString()}
                  </button>
                )})}
              </div>
            </>
          )}
          {isSwallow && (
            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3, #6B6660)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>
                Swallow <span style={{ color: 'var(--danger, #FF3B30)', fontWeight: 900 }}>*</span>
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['garri', 'fufu'] as const).map(val => {
                  const label = val === 'garri' ? 'Garri (Eba)' : 'Fufu'
                  const emoji = val === 'garri' ? '🫙' : '🥣'
                  const on = swallowChoice === val
                  return (
                    <button key={val} onClick={() => setSwallowChoice(val)} className="press"
                      style={{ flex: 1, background: on ? 'rgba(255,107,43,0.12)' : 'var(--bg-0, #0C0B09)', border: `2px solid ${on ? 'var(--accent, #FF6B2B)' : 'var(--line, #2A2825)'}`, borderRadius: 16, padding: '16px 12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 32 }}>{emoji}</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: on ? 'var(--accent, #FF6B2B)' : 'white' }}>{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {extras.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3, #6B6660)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }}>
                Add to plate <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>(optional)</span>
              </p>
              {extras.map(e => {
                if (e.has_portions) {
                  const aMin = e.portion_min_price ?? e.price; const aFst = e.portion_first_step ?? 200
                  const aStp = e.portion_step ?? 100; const aMax = e.portion_max_price ?? e.price
                  const aSteps: number[] = [aMin]
                  if (aMax > aMin && aFst > 0) { const sec = aMin + aFst; if (sec <= aMax) { aSteps.push(sec); if (aStp > 0) { let c = sec + aStp; while (c <= aMax) { aSteps.push(c); c += aStp } } } }
                  const tiers = addonPortionQtys[e.id] ?? {}; const anySelected = Object.values(tiers).some(q => q > 0)
                  return (
                    <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: anySelected ? 'var(--accent, #FF6B2B)' : 'white', margin: '0 0 8px' }}>{e.name}</p>
                      {aSteps.map(p => { const qty = tiers[p] ?? 0; return (
                        <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0 5px 12px' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'var(--ink-2, #A09A8E)' }}>+{N}{p.toLocaleString()}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button onClick={() => decAP(e.id, p)} className="press"
                              style={{ width: 28, height: 28, borderRadius: '50%', background: qty > 0 ? 'rgba(255,107,43,0.15)' : 'var(--bg-0, #0C0B09)', border: `1px solid ${qty > 0 ? 'rgba(255,107,43,0.4)' : 'var(--line, #2A2825)'}`, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', opacity: qty === 0 ? 0.35 : 1 }}>-</button>
                            <span style={{ fontSize: 14, fontWeight: 900, color: 'white', minWidth: 16, textAlign: 'center' }}>{qty}</span>
                            <button onClick={() => incAP(e.id, p)} className="press"
                              style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', border: 'none', color: 'white', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                          </div>
                        </div>
                      )})}
                    </div>
                  )
                }
                const qty = addonQtys[e.id] ?? 0
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--line-soft, #1F1D1B)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'white', margin: 0 }}>{e.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600, margin: '2px 0 0' }}>+{N}{e.price.toLocaleString()}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <button onClick={() => decA(e.id)} className="press"
                        style={{ width: 34, height: 34, borderRadius: '50%', background: qty > 0 ? 'rgba(255,107,43,0.15)' : 'var(--bg-0, #0C0B09)', border: `1px solid ${qty > 0 ? 'rgba(255,107,43,0.4)' : 'var(--line, #2A2825)'}`, color: qty > 0 ? 'var(--accent, #FF6B2B)' : 'var(--ink-3, #6B6660)', fontSize: 18, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', opacity: qty === 0 ? 0.35 : 1 }}>-</button>
                      <span style={{ fontSize: 16, fontWeight: 900, color: 'white', minWidth: 20, textAlign: 'center' }}>{qty}</span>
                      <button onClick={() => incA(e.id)} className="press"
                        style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent, #FF6B2B)', border: 'none', color: 'white', fontSize: 18, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ height: 20 }} />
        </div>
        <div style={{ padding: '12px 20px 32px', borderTop: '1px solid var(--line, #2A2825)', flexShrink: 0, background: 'var(--bg-1, #1A1917)' }}>
          {isSwallow && !swallowChoice && (
            <p style={{ fontSize: 12, color: 'var(--danger, #FF3B30)', fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
              Choose your swallow to continue
            </p>
          )}
          {totalAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3, #6B6660)', fontWeight: 600 }}>
                {N}{selectedPrice.toLocaleString()} plate
                {swallowChoice && ` \u00B7 ${swallowChoice === 'garri' ? 'Garri (Eba)' : 'Fufu'}`}
                {addonSelections.length > 0 && ` + ${addonSelections.length} extra${addonSelections.length !== 1 ? 's' : ''}`}
              </span>
              <span className="font-display" style={{ fontSize: 22, color: 'var(--accent, #FF6B2B)' }}>{N}{totalAmount.toLocaleString()}</span>
            </div>
          )}
          <button onClick={() => canAdd && onConfirm(selections, addonSelections, swallowChoice ?? undefined)} className="press"
            style={{ width: '100%', background: canAdd ? 'var(--accent, #FF6B2B)' : 'var(--bg-2, #26241F)', color: canAdd ? 'white' : 'var(--ink-3, #6B6660)', border: 'none', borderRadius: 14, padding: '14px', fontWeight: 900, fontSize: 16, cursor: canAdd ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            Add plate {'\u2014'} {N}{totalAmount.toLocaleString()}
          </button>
          <button onClick={onClose} style={{ width: '100%', marginTop: 8, background: 'transparent', border: 'none', color: 'var(--ink-3, #6B6660)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
