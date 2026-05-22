'use client'

import Link from 'next/link'

export default function SplashPage() {
  return (
    <div
      className="scanline"
      style={{
        maxWidth: 430,
        margin: '0 auto',
        minHeight: '100vh',
        background: '#0C0B09',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        textAlign: 'center',
      }}
    >
      {/* Wordmark — idles with jitter, full glitch on hover */}
      <div
        className="jitter fade-up-1"
        style={{ marginBottom: 24, fontSize: 56, lineHeight: 1.1, letterSpacing: '-1px' }}
      >
        <span className="font-brand" style={{ color: '#FF6B2B' }}>Campus</span>
        <span className="font-brand" style={{ color: 'white' }}>Run</span>
      </div>

      <h1
        className="font-display fade-up-2"
        style={{
          fontSize: 34,
          fontWeight: 900,
          color: 'white',
          lineHeight: 1.15,
          margin: '0 0 12px',
        }}
      >
        Food to your door.<br />On campus.
      </h1>

      <p
        className="fade-up-3"
        style={{
          color: 'rgba(255,255,255,0.55)',
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 48,
          lineHeight: 1.65,
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        Order from any campus restaurant.<br />
        Delivered by fellow students.
      </p>

      <div
        className="fade-up-4"
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {/* Primary CTA — jitter on hover */}
        <Link
          href="/signup"
          className="jitter-btn"
          style={{
            width: '100%',
            background: '#FF6B2B',
            color: 'white',
            fontWeight: 900,
            fontSize: 18,
            padding: '16px',
            borderRadius: 16,
            textAlign: 'center',
            display: 'block',
            textDecoration: 'none',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          Get Started
        </Link>

        {/* Secondary — border style, no jitter */}
        <Link
          href="/login"
          style={{
            width: '100%',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            fontWeight: 700,
            fontSize: 18,
            padding: '16px',
            borderRadius: 16,
            textAlign: 'center',
            display: 'block',
            textDecoration: 'none',
            fontFamily: "'Nunito', sans-serif",
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = '#FF6B2B'
            ;(e.currentTarget as HTMLElement).style.color = '#FF6B2B'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)'
            ;(e.currentTarget as HTMLElement).style.color = 'white'
          }}
        >
          I already have an account
        </Link>

        {/* Runner pill link */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <Link
            href="/signup?role=runner"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.65)',
              fontSize: 13,
              fontWeight: 700,
              padding: '8px 18px',
              borderRadius: 999,
              textDecoration: 'none',
              fontFamily: "'Nunito', sans-serif",
              border: '1px solid rgba(255,255,255,0.08)',
              transition: 'background 0.15s',
            }}
          >
            🛵 Want to earn as a Runner?
          </Link>
        </div>
      </div>
    </div>
  )
}
