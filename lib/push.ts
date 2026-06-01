// lib/push.ts
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// Current state — does the user have an active push subscription?
export async function getPushState(): Promise<'unsupported' | 'denied' | 'off' | 'on'> {
  if (typeof window === 'undefined')               return 'unsupported'
  if (!('serviceWorker' in navigator))             return 'unsupported'
  if (!('PushManager' in window))                  return 'unsupported'
  if (!('Notification' in window))                 return 'unsupported'

  if (Notification.permission === 'denied') return 'denied'

  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return 'off'
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

// Subscribe — used by initPush AND the new profile toggle
export async function subscribePush(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined')   return { ok: false, error: 'Not available' }
  if (!('serviceWorker' in navigator)) return { ok: false, error: 'Notifications not supported on this device' }
  if (!('PushManager' in window))      return { ok: false, error: 'Notifications not supported on this device' }
  if (!VAPID_PUBLIC_KEY)               return { ok: false, error: 'Notifications not configured' }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, error: permission === 'denied'
        ? 'Permission blocked. Enable notifications in your browser/phone settings.'
        : 'Permission not granted' }
    }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const deviceHint = navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), deviceHint }),
    })
    return { ok: true }
  } catch (e) {
    console.error('Push subscribe error:', e)
    return { ok: false, error: 'Failed to enable notifications' }
  }
}

// Unsubscribe — turn off
export async function unsubscribePush(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined') return { ok: false }
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return { ok: true } // nothing to unsubscribe

    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      // Tell server to delete the row
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
    }
    return { ok: true }
  } catch (e) {
    console.error('Push unsubscribe error:', e)
    return { ok: false, error: 'Failed to disable notifications' }
  }
}

// Legacy alias — already-existing call sites
export const initPush = subscribePush
