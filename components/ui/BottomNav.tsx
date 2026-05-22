import Link from 'next/link'
import { Home, Package, User } from 'lucide-react'

export type BottomNavTab = 'home' | 'orders' | 'profile'

const TABS = [
  { id: 'home'    as const, Icon: Home,    label: 'Home',    href: '/home'    },
  { id: 'orders'  as const, Icon: Package, label: 'Orders',  href: '/orders'  },
  { id: 'profile' as const, Icon: User,    label: 'Profile', href: '/profile' },
]

export function BottomNav({ active }: { active: BottomNavTab }) {
  return (
    <nav role="navigation" aria-label="Main navigation" style={{ display: 'flex', borderTop: '1px solid var(--line-soft, #1F1D1B)', background: 'var(--bg-0, #0C0B09)', position: 'sticky', bottom: 0, zIndex: 10 }}>
      {TABS.map(({ id, Icon, label, href }) => {
        const on = id === active
        return (
          <Link key={id} href={href} aria-current={on ? 'page' : undefined} className="press" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 0 14px', textDecoration: 'none' }}>
            <Icon size={20} strokeWidth={2.2} color={on ? '#FF6B2B' : '#444038'} />
            <span style={{ fontSize: 10, fontWeight: 800, color: on ? '#FF6B2B' : '#444038' }}>{label}</span>
            {on && <span aria-hidden="true" style={{ width: 18, height: 2, borderRadius: 2, background: '#FF6B2B' }} />}
          </Link>
        )
      })}
    </nav>
  )
}
