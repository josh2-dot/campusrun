'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Send } from 'lucide-react'
import { useCartStore } from '@/store/cart'
import { ExpressOrderSheet } from '@/components/ui/ExpressOrderSheet'
import { createClient } from '@/lib/supabase/client'

type ParsedItem = {
  menu_item_id:    string
  name:            string
  price:           number
  quantity:        number
  restaurant_id:   string
  restaurant_name: string
  confidence:      'high' | 'medium' | 'low'
}

type ChatMessage = {
  id:        string
  role:      'bot' | 'user'
  text:      string
  parsed?:   ParsedItem[]
  awaitConfirmation?: boolean
}

export default function QuickOrderPage() {
  const router = useRouter()
  const cart   = useCartStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input,    setInput]    = useState('')
  const [typing,   setTyping]   = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const [isAnonymous,    setIsAnonymous]    = useState(false)
  const [showExpressSheet, setShowExpressSheet] = useState(false)

  // Check if user is anonymous
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setIsAnonymous(!user))
  }, [])

  // Greeting on mount
  useEffect(() => {
    const greeting = `Hey 👋 What would you like to order today? Just type it like you would in WhatsApp.\n\ne.g. "2 jollof and chicken from amanam's"`
    setMessages([{ id: 'g0', role: 'bot', text: greeting }])
    setTimeout(() => inputRef.current?.focus(), 200)
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, typing])

  async function handleSend() {
    const text = input.trim()
    if (!text || typing) return

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTyping(true)

    try {
      const res = await fetch('/api/parse-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
      })
      const data = await res.json()

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        role: 'bot',
        text: data.message || 'Here is what I found.',
        parsed: data.items?.length ? data.items : undefined,
        awaitConfirmation: data.ok && data.items?.length > 0,
      }
      setMessages(prev => [...prev, botMsg])

      // Append suggestions as quick replies if clarification is needed
      if (data.needs_clarification && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        const suggestMsg: ChatMessage = {
          id: `b-sug-${Date.now()}`,
          role: 'bot',
          text: data.suggestions.map((s: string) => `• ${s}`).join('\n'),
        }
        setMessages(prev => [...prev, suggestMsg])
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `b-err-${Date.now()}`,
        role: 'bot',
        text: 'Hmm, network issue. Want to try again or browse menus instead?',
      }])
    }
    setTyping(false)
  }

  function handleConfirm(parsed: ParsedItem[]) {
    if (!parsed.length) return
    const rid  = parsed[0].restaurant_id
    const rname = parsed[0].restaurant_name

    // Clear and rebuild cart
    cart.clearCart()
    for (const item of parsed) {
      for (let i = 0; i < item.quantity; i++) {
        cart.addItem(
          {
            id: item.menu_item_id,
            name: item.name,
            price: item.price,
            is_available: true,
            restaurant_id: item.restaurant_id,
            category: '',
            description: '',
          },
          rid,
          rname,
        )
      }
    }

    // For anonymous users, show express signup sheet instead of routing
    if (isAnonymous) {
      setMessages(prev => [...prev, {
        id: `b-conf-${Date.now()}`,
        role: 'bot',
        text: 'Almost there — just need your delivery details 📦',
      }])
      setTimeout(() => setShowExpressSheet(true), 400)
      return
    }

    setMessages(prev => [...prev, {
      id: `b-conf-${Date.now()}`,
      role: 'bot',
      text: 'Taking you to checkout… 🛵',
    }])
    setTimeout(() => router.push('/checkout'), 500)
  }

  function handleEdit() {
    setMessages(prev => [...prev, {
      id: `b-edit-${Date.now()}`,
      role: 'bot',
      text: 'No worries. Tell me what to change.',
    }])
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <div
      style={{
        maxWidth: 430, margin: '0 auto',
        minHeight: '100vh',
        background: '#0C0B09',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Nunito', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ padding: '50px 16px 12px', background: '#1A1917', borderBottom: '1px solid #2A2825', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/home" aria-label="Back to home" className="press"
          style={{ background: '#26241F', border: '1px solid #2A2825', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', textDecoration: 'none' }}>
          <ChevronLeft size={18} />
        </Link>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0 }}>CampusRun</p>
          <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 600, margin: '2px 0 0' }}>
            Online · type your order
          </p>
        </div>
        <Link href="/home" className="press"
          style={{ background: 'transparent', color: '#FF6B2B', fontWeight: 800, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: '4px 8px' }}>
          Browse menus
        </Link>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map(m => (
          <MessageBubble
            key={m.id}
            msg={m}
            onConfirm={() => m.parsed && handleConfirm(m.parsed)}
            onEdit={handleEdit}
          />
        ))}
        {typing && <TypingBubble />}
      </div>

      {/* Express order sheet for anonymous users */}
      {showExpressSheet && (
        <ExpressOrderSheet
          intent="/checkout"
          contextText="Tell us how to reach you. We'll send your runner over."
          onClose={() => setShowExpressSheet(false)}
        />
      )}

      {/* Input */}
      <div style={{ padding: '10px 12px 18px', background: '#0C0B09', borderTop: '1px solid #1F1D1B', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Type what you want…"
          maxLength={500}
          disabled={typing}
          style={{ flex: 1, background: '#1A1917', border: '1px solid #2A2825', borderRadius: 999, padding: '12px 16px', color: 'white', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit', opacity: typing ? 0.6 : 1 }}
        />
        <button onClick={handleSend} disabled={!input.trim() || typing} aria-label="Send"
          style={{ width: 42, height: 42, borderRadius: '50%', background: input.trim() && !typing ? '#FF6B2B' : '#2A2825', color: 'white', border: 'none', cursor: input.trim() && !typing ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

function MessageBubble({ msg, onConfirm, onEdit }: { msg: ChatMessage; onConfirm: () => void; onEdit: () => void }) {
  const isUser = msg.role === 'user'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%', alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        background: isUser ? '#FF6B2B' : '#1A1917',
        color: 'white',
        border: isUser ? 'none' : '1px solid #2A2825',
        borderRadius: 16,
        borderBottomRightRadius: isUser ? 4 : 16,
        borderBottomLeftRadius:  isUser ? 16 : 4,
        padding: '10px 14px',
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.text}
      </div>

      {/* Parsed cart preview */}
      {msg.parsed && msg.parsed.length > 0 && (
        <div style={{ marginTop: 8, background: '#1A1917', border: '1px solid #2A2825', borderRadius: 14, padding: '12px 14px', width: '100%', maxWidth: 340 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#6B6660', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>
            From {msg.parsed[0].restaurant_name}
          </p>
          {msg.parsed.map((item, idx) => (
            <div key={`${item.menu_item_id}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>
                {item.quantity}× {item.name}
              </span>
              <span style={{ color: '#FF6B2B', fontSize: 13, fontWeight: 800 }}>
                ₦{(item.price * item.quantity).toLocaleString()}
              </span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #2A2825', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#A09A8E', fontSize: 12, fontWeight: 700 }}>Subtotal</span>
            <span style={{ color: 'white', fontSize: 14, fontWeight: 900 }}>
              ₦{msg.parsed.reduce((s, i) => s + i.price * i.quantity, 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Confirmation buttons */}
      {msg.awaitConfirmation && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={onConfirm} className="press"
            style={{ background: '#FF6B2B', color: 'white', border: 'none', borderRadius: 999, padding: '8px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            ✓ Confirm
          </button>
          <button onClick={onEdit} className="press"
            style={{ background: 'transparent', color: '#A09A8E', border: '1px solid #2A2825', borderRadius: 999, padding: '8px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            ✗ Edit
          </button>
        </div>
      )}
    </div>
  )
}

function TypingBubble() {
  return (
    <div style={{ alignSelf: 'flex-start', background: '#1A1917', border: '1px solid #2A2825', borderRadius: 16, padding: '12px 16px' }}>
      <style>{`
        @keyframes crDot { 0%, 60%, 100% { opacity: 0.3 } 30% { opacity: 1 } }
        .cr-dot { display: inline-block; width: 6px; height: 6px; background: #A09A8E; border-radius: 50%; margin: 0 2px; animation: crDot 1.2s infinite }
        .cr-dot:nth-child(2) { animation-delay: 0.15s }
        .cr-dot:nth-child(3) { animation-delay: 0.3s }
      `}</style>
      <span className="cr-dot" />
      <span className="cr-dot" />
      <span className="cr-dot" />
    </div>
  )
}
