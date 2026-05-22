'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Restaurant } from '@/types'
import { Home, Package, User, Zap } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [firstName, setFirstName] = useState('there')
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: profile }, { data: rests }] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', user.id).single(),
        supabase.from('restaurants').select('*').order('is_open', { ascending: false }).order('name'),
      ])
      setFirstName(profile?.full_name?.split(' ')[0] ?? 'there')
      setRestaurants(rests ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0B09', fontSize: 40 }}><Package size={40} color="#FF6B2B" /></div>

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#0C0B09', fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div className="dot-texture" style={{ padding: '56px 20px 20px', background: '#0C0B09', borderBottom: '1px solid #1A1917' }}>
        <p className="fade-up-1" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 600, margin: 0 }}>{greeting}</p>
        <h1 className="font-display fade-up-2 jitter" style={{ color: 'white', fontSize: 32, fontWeight: 900, margin: '2px 0 16px' }}>{firstName}!</h1>
        <div className="fade-up-3" style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, display:"flex",alignItems:"center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
          <span style={{ color: '#444', fontSize: 14, fontWeight: 600 }}>Search restaurants or food...</span>
        </div>
      </div>

      <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 20px' }}>
        <div className="jitter-btn fade-up-4" style={{ background: 'linear-gradient(135deg, #FF6B2B, #FF4500)', borderRadius: 16, padding: '16px', marginBottom: 20, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
          <div style={{ position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)', fontSize: 64, opacity: 0.1 }}>CR</div>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.6)', margin: 0, letterSpacing: 2, textTransform: 'uppercase' }}>Campus deal</p>
          <p className="font-display" style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: '2px 0 0' }}>Order now, eat fast</p>
        </div>

        <h2 className="font-display fade-up-5" style={{ fontSize: 12, fontWeight: 800, margin: '0 0 12px', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase' }}>Open Now</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {restaurants.map((r: Restaurant) => (
            <Link key={r.id} href={`/restaurant/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="jitter-btn" style={{ background: '#1A1917', border: '1px solid #2A2825', borderRadius: 16, display: 'flex', alignItems: 'center', overflow: 'hidden', opacity: r.is_open ? 1 : 0.4 }}>
                <div style={{ width: 80, height: 80, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0 }}>
                  {r.emoji || '🍽️'}
                </div>
                <div style={{ padding: '12px', flex: 1 }}>
                  <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: 'white' }}>{r.name}</p>
                  <p style={{ fontSize: 12, fontWeight: 600, margin: '3px 0 0', color: '#555' }}>
                    {r.is_open ? <><span style={{ color: '#1DB954', fontWeight: 800 }}>OPEN</span> · {r.avg_prep_time}–{r.avg_prep_time + 5} min · ₦500 delivery</> : 'Currently closed'}
                  </p>
                </div>
                <div style={{ paddingRight: 16, color: '#333', fontSize: 18 }}>›</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <nav style={{ display: 'flex', borderTop: '1px solid #1A1917', background: '#0C0B09' }}>
        { ([
          { Icon: Home, label: 'Home', href: '/home', active: true },
          { Icon: Package, label: 'Orders', href: '/orders', active: false },
          { Icon: User, label: 'Profile', href: '/profile', active: false },
        ] as const).map(({ Icon, label, href, active }) => (
          <Link key={label} href={href} className="jitter-btn" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 0', textDecoration: 'none' }}>
            <Icon size={22} color={active ? '#FF6B2B' : '#333'} />
            <span style={{ fontSize: 10, fontWeight: 800, color: active ? '#FF6B2B' : '#333' }}>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
