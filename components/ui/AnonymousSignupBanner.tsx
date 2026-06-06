// components/ui/AnonymousSignupBanner.tsx
'use client'

import Link from 'next/link'
import { Sparkles, ChevronRight } from 'lucide-react'

export function AnonymousSignupBanner() {
  return (
    <Link
      href="/signup"
      className="press"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'linear-gradient(90deg, rgba(255,107,43,0.14), rgba(255,107,43,0.06))',
        border: '1px solid rgba(255,107,43,0.35)',
        borderRadius: 14,
        padding: '11px 14px',
        marginBottom: 14,
        textDecoration: 'none',
        fontFamily: "'Nunito', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: 32, height: 32, borderRadius: 10,
          background: 'rgba(255,107,43,0.2)',
          color: '#FF6B2B',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Sparkles size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>
          Create your account
        </p>
        <p style={{ fontSize: 11, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '2px 0 0' }}>
          30 seconds. No card needed. Then you can order.
        </p>
      </div>
      <ChevronRight size={18} color="#FF6B2B" />
    </Link>
  )
}
