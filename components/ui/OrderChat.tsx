// components/ui/OrderChat.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Flag, Send, Bell, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getPushState, subscribePush } from '@/lib/push'
import type { MessageRow } from '@/lib/messaging'

type Role = 'customer' | 'runner'

const QUICK_REPLIES_CUSTOMER = [
  "Where are you?",
  "I'm at the gate",
  "Use the back entrance",
  "5 min",
  "Thanks!",
]
const QUICK_REPLIES_RUNNER = [
  "On my way",
  "I'm here",
  "Can't find the place",
  "5 more min",
  "Outside",
]

interface OrderChatProps {
  orderId:    string
  myRole:     Role
  otherName:  string
  orderRef?:  string
  isOpen:     boolean        // is the chat allowed (order is in active status)
  onClose:    () => void
}

export function OrderChat({ orderId, myRole, otherName, orderRef, isOpen, onClose }: OrderChatProps) {
  const supabase = createClient()
  const [messages, setMessages]   = useState<MessageRow[]>([])
  const [text,     setText]       = useState('')
  const [sending,  setSending]    = useState(false)
  const [error,    setError]      = useState('')
  const [showFilteredWarn, setShowFilteredWarn] = useState(false)
  const [pushPromptOpen, setPushPromptOpen]     = useState(false)
  const [pushState, setPushState] = useState<'on' | 'off' | 'denied' | 'unsupported' | 'loading'>('loading')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Initial load + realtime subscription
  useEffect(() => {
    let mounted = true

    async function load() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })

      if (!mounted) return
      setMessages(data ?? [])

      // Mark all as read
      await fetch('/api/messages/mark-read', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId }),
      }).catch(() => {})
    }
    load()

    // Push state — for the inline prompt
    getPushState().then(s => mounted && setPushState(s)).catch(() => mounted && setPushState('off'))

    // Subscribe to new messages
    const channel = supabase
      .channel(`order-chat-${orderId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` },
        (payload) => {
          if (!mounted) return
          const newMsg = payload.new as MessageRow
          setMessages(prev => {
            // De-dupe in case of optimistic insertion + realtime
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          // Mark as read if it's from the other party
          if (newMsg.sender_role !== myRole && newMsg.sender_role !== 'system') {
            fetch('/api/messages/mark-read', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ orderId }),
            }).catch(() => {})
          }
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Focus input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200)
    return () => clearTimeout(t)
  }, [])

  async function handleSend(messageText: string) {
    const t = messageText.trim()
    if (!t || sending) return
    if (!isOpen) {
      setError('Chat is closed for this order.')
      return
    }
    setSending(true)
    setError('')

    try {
      const res = await fetch('/api/messages/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId, text: t }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Could not send.')
        setSending(false)
        return
      }

      if (data.blocked) {
        setShowFilteredWarn(true)
        setTimeout(() => setShowFilteredWarn(false), 4000)
      }

      setText('')
      setSending(false)

      // After first successful send, prompt for push if it's off
      if (pushState === 'off' && messages.filter(m => m.sender_id === undefined ? false : true).length === 0) {
        setPushPromptOpen(true)
      }
    } catch {
      setError('Network error. Try again.')
      setSending(false)
    }
  }

  async function handleReport(messageId: string) {
    const reason = window.prompt('Why are you reporting this message?')
    if (!reason) return
    try {
      await fetch('/api/messages/report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messageId, reason }),
      })
      alert('Reported. Our team will review it.')
    } catch {
      alert('Could not report. Please try again.')
    }
  }

  async function handleEnablePush() {
    const { ok } = await subscribePush()
    if (ok) setPushState('on')
    setPushPromptOpen(false)
  }

  const quickReplies = useMemo(() => myRole === 'customer' ? QUICK_REPLIES_CUSTOMER : QUICK_REPLIES_RUNNER, [myRole])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#0C0B09',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Nunito', system-ui, sans-serif",
        maxWidth: 430, margin: '0 auto',
        animation: 'crSlideUp 0.25s ease',
      }}
    >
      <style>{`@keyframes crSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>

      {/* HEADER */}
      <div style={{ padding: '50px 16px 12px', background: '#1A1917', borderBottom: '1px solid #2A2825' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} aria-label="Close chat"
            style={{ background: '#26241F', color: 'white', border: '1px solid #2A2825', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {otherName}
            </p>
            <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 600, margin: '2px 0 0' }}>
              {myRole === 'customer' ? 'Your runner' : 'Customer'} {orderRef ? `· ${orderRef}` : ''}
            </p>
          </div>
        </div>

        {/* Disclaimer banner */}
        <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 10, padding: '8px 10px', marginTop: 10 }}>
          <p style={{ fontSize: 11, color: '#FFB800', fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
            ⚠️ Keep chat in the app. Phone numbers and WhatsApp links are auto-filtered.
          </p>
        </div>

        {/* Push permission inline prompt */}
        {pushPromptOpen && (
          <div style={{ background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={18} color="#FF6B2B" />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 800, fontSize: 12, color: 'white', margin: 0 }}>Turn on notifications</p>
              <p style={{ fontSize: 11, color: '#A09A8E', fontWeight: 600, margin: '2px 0 0' }}>So you don&apos;t miss the reply</p>
            </div>
            <button onClick={handleEnablePush}
              style={{ background: '#FF6B2B', color: 'white', border: 'none', borderRadius: 8, padding: '6px 10px', fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              Allow
            </button>
            <button onClick={() => setPushPromptOpen(false)}
              style={{ background: 'transparent', color: '#6B6660', border: 'none', fontSize: 16, cursor: 'pointer', padding: 4 }}
              aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
      </div>

      {/* MESSAGES */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: '#6B6660', fontSize: 13, fontWeight: 600 }}>
              No messages yet. Say hi 👋
            </p>
          </div>
        )}
        {messages.map(m => (
          <MessageBubble key={m.id} msg={m} mine={m.sender_role === myRole} onReport={() => handleReport(m.id)} />
        ))}
      </div>

      {/* CLOSED BANNER */}
      {!isOpen && (
        <div style={{ background: '#1A1917', borderTop: '1px solid #2A2825', padding: '12px 16px' }}>
          <p style={{ fontSize: 12, color: '#FFB800', fontWeight: 700, margin: 0, textAlign: 'center' }}>
            <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Chat is closed for this order
          </p>
        </div>
      )}

      {/* FILTERED WARNING */}
      {showFilteredWarn && (
        <div style={{ position: 'absolute', bottom: 80, left: 16, right: 16, background: '#FFB800', color: '#0C0B09', padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 800, textAlign: 'center' }}>
          Contact info removed from your message
        </div>
      )}

      {/* QUICK REPLIES + INPUT */}
      {isOpen && (
        <>
          <div className="scroll-hide" style={{ display: 'flex', gap: 6, padding: '6px 14px', overflowX: 'auto', background: '#0C0B09', borderTop: '1px solid #1F1D1B' }}>
            {quickReplies.map(qr => (
              <button key={qr} onClick={() => handleSend(qr)} disabled={sending}
                style={{ flexShrink: 0, background: '#1A1917', color: 'white', border: '1px solid #2A2825', borderRadius: 999, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                {qr}
              </button>
            ))}
          </div>

          <div style={{ padding: '8px 12px 14px', background: '#0C0B09', borderTop: '1px solid #1F1D1B', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(text) } }}
              placeholder="Type a message…"
              maxLength={1000}
              style={{ flex: 1, background: '#1A1917', border: '1px solid #2A2825', borderRadius: 999, padding: '10px 14px', color: 'white', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={() => handleSend(text)} disabled={!text.trim() || sending} aria-label="Send"
              style={{ width: 40, height: 40, borderRadius: '50%', background: text.trim() && !sending ? '#FF6B2B' : '#2A2825', color: 'white', border: 'none', cursor: text.trim() && !sending ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Send size={16} />
            </button>
          </div>
        </>
      )}

      {error && (
        <div style={{ position: 'absolute', bottom: 100, left: 16, right: 16, background: '#FF3B30', color: 'white', padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg, mine, onReport }: { msg: MessageRow; mine: boolean; onReport: () => void }) {
  // System message — centered grey pill
  if (msg.sender_role === 'system') {
    return (
      <div style={{ alignSelf: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '6px 12px', margin: '4px 0' }}>
        <p style={{ fontSize: 11, color: '#6B6660', fontWeight: 700, margin: 0 }}>{msg.text}</p>
      </div>
    )
  }

  const time = new Date(msg.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
      <div
        onContextMenu={(e) => { e.preventDefault(); if (!mine) onReport() }}
        style={{
          background: mine ? '#FF6B2B' : '#1A1917',
          color: mine ? 'white' : 'white',
          border: mine ? 'none' : '1px solid #2A2825',
          borderRadius: 14,
          padding: '8px 12px',
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.4,
          wordBreak: 'break-word',
        }}
      >
        {msg.text}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 10, color: '#6B6660', fontWeight: 600 }}>
          {time}{msg.read_at && mine ? ' · Seen' : ''}
        </span>
        {!mine && (
          <button onClick={onReport} aria-label="Report message"
            style={{ background: 'transparent', border: 'none', color: '#6B6660', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
            <Flag size={10} />
          </button>
        )}
      </div>
    </div>
  )
}
