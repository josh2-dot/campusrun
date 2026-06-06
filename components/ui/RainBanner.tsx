// components/ui/RainBanner.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Variant = 'customer' | 'runner'

export function RainBanner({ variant = 'customer' }: { variant?: Variant }) {
  const [active, setActive] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const supabase = createClient()

    async function check() {
      const { data } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'rain_active')
        .single()
      setActive(data?.value === 'true')
    }
    check()

    // Re-check every 60s while on this page (lightweight — single row)
    const interval = setInterval(check, 60_000)

    // Listen to live changes — admin toggles propagate to users within seconds
    const channel = supabase
      .channel('rain-banner-' + Date.now())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_config', filter: 'key=eq.rain_active' },
        () => check()
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [])

  if (!mounted || !active) return null

  if (variant === 'runner') {
    return (
      <div style={{
        background: 'rgba(74,158,255,0.12)',
        border: '1px solid rgba(74,158,255,0.3)',
        borderRadius: 14,
        padding: '12px 14px',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <span style={{ fontSize: 20, lineHeight: 1, marginTop: -1 }}>🌧️</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 800, fontSize: 13, color: '#4A9EFF', margin: 0 }}>
            Rain mode on
          </p>
          <p style={{ fontSize: 12, color: '#15130F', fontWeight: 600, margin: '2px 0 0', lineHeight: 1.5 }}>
            Take your time. Customers have been told to expect delays.
          </p>
        </div>
      </div>
    )
  }

  // Customer variant
  return (
    <div style={{
      background: 'rgba(74,158,255,0.08)',
      border: '1px solid rgba(74,158,255,0.25)',
      borderRadius: 14,
      padding: '12px 14px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      <span style={{ fontSize: 20, lineHeight: 1, marginTop: -1 }}>🌧️</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 800, fontSize: 13, color: '#4A9EFF', margin: 0 }}>
          It&apos;s raining
        </p>
        <p style={{ fontSize: 12, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '2px 0 0', lineHeight: 1.5 }}>
          Deliveries are slower right now. Your runner&apos;s staying safe.
        </p>
      </div>
    </div>
  )
}
