'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    // Both anonymous and authenticated users go straight to /home.
    // /home now renders for anonymous users with a signup banner;
    // authenticated users see their personalized version.
    router.replace('/home')
  }, [router])

  return (
    <div
      style={{
        maxWidth: 430, margin: '0 auto', minHeight: '100vh',
        background: '#0C0B09',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Nunito', system-ui, sans-serif",
      }}
    >
      <p style={{ color: '#6B6660', fontWeight: 700, fontSize: 14 }}>Loading…</p>
    </div>
  )
}
