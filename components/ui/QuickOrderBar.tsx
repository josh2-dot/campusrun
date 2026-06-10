// components/ui/QuickOrderBar.tsx
'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'

export function QuickOrderBar() {
  return (
    <Link
      href="/quick"
      className="press"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'linear-gradient(135deg, rgba(255,107,43,0.16), rgba(255,107,43,0.08))',
        border: '1.5px solid rgba(255,107,43,0.4)',
        borderRadius: 16,
        padding: '14px 16px',
        marginBottom: 14,
        textDecoration: 'none',
        fontFamily: "'Nunito', system-ui, sans-serif",
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 38, height: 38, borderRadius: 12,
          background: 'rgba(255,107,43,0.22)',
          color: '#FF6B2B',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Sparkles size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 800, fontSize: 13, color: 'white', margin: 0 }}>
          What are you craving?
        </p>
        <p style={{ fontSize: 11, color: 'var(--ink-2, #A09A8E)', fontWeight: 600, margin: '2px 0 0' }}>
          Type it. We&apos;ll handle the rest.
        </p>
      </div>
      <span style={{ color: '#FF6B2B', fontWeight: 900, fontSize: 18 }}>→</span>
    </Link>
  )
}
