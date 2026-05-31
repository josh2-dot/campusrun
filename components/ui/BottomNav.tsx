'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Home, Package, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export type BottomNavTab = 'home' | 'orders' | 'profile'

// Active order statuses — anything the customer should be tracking right now
const ACTIVE_STATUSES = [
  'confirmed',
  'awaiting_runner',
  'runner_assigned',
  'picked_up',
  'needs_attention',
]

export function BottomNav({ active }: { active: BottomNavTab }) {
  const [hasActiveOrder, setHasActiveOrder] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let mounted = true

    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', user.id)
        .in('status', ACTIVE_STATUSES)
      if (mounted) setHasActiveOrder((count ?? 0) > 0)
    }

    check()
    const interval = setInterval(check, 20_000)

    const channel = supabase
      .channel('bottomnav-orders-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => check())
      .subscribe()

    return () => {
      mounted = false
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const TABS = [
    { id: 'home'    as const, Icon: Home,    label: 'Home',    href: '/home',    badge: false           },
    { id: 'orders'  as const, Icon: Package, label: 'Orders',  href: '/orders',  badge: hasActiveOrder  },
    { id: 'profile' as const, Icon: User,    label: 'Profile', href: '/profile', badge: false           },
  ]

  return (
    <nav role="navigation" aria-label="Main navigation" style={{
      display: 'flex',
      borderTop: '1px solid var(--line-soft, #1F1D1B)',
      background: 'var(--bg-0, #0C0B09)',
      position: 'sticky', bottom: 0, zIndex: 10,
    }}>
      <style>{`
        @keyframes cr-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.7; }
        }
        @keyframes cr-pulse-ring {
          0%   { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0;   }
        }
      `}</style>

      {TABS.map(({ id, Icon, label, href, badge }) => {
        const on = id === active
        return (
          <Link
            key={id}
            href={href}
            aria-current={on ? 'page' : undefined}
            aria-label={badge ? `${label} — active order in progress` : label}
            className="press"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 0 14px', textDecoration: 'none', position: 'relative' }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={20} strokeWidth={2.2} color={on ? '#FF6B2B' : badge ? '#FF6B2B' : '#444038'} />

              {badge && (
                <>
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: -2, right: -5,
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#FF6B2B',
                    boxShadow: '0 0 0 2px var(--bg-0, #0C0B09)',
                    animation: 'cr-pulse-dot 1.6s ease-in-out infinite',
                    zIndex: 2,
                  }} />
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: -4, right: -7,
                    width: 12, height: 12, borderRadius: '50%',
                    background: 'rgba(255,107,43,0.4)',
                    animation: 'cr-pulse-ring 1.6s ease-out infinite',
                    zIndex: 1,
                  }} />
                </>
              )}
            </div>

            <span style={{ fontSize: 10, fontWeight: 800, color: on ? '#FF6B2B' : badge ? '#FF6B2B' : '#444038' }}>
              {label}
            </span>
            {on && <span aria-hidden="true" style={{ width: 18, height: 2, borderRadius: 2, background: '#FF6B2B' }} />}
          </Link>
        )
      })}
    </nav>
  )
}
