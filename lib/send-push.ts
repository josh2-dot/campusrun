// lib/send-push.ts — server-side only, call from API routes
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:jittersmail00@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!process.env.VAPID_PRIVATE_KEY) return
  const admin = createAdminClient()
  const { data: subs } = await admin.from('push_subscriptions').select('subscription, device_hint').eq('user_id', userId)
  if (!subs?.length) return

  await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(s.subscription, JSON.stringify(payload)).catch(async (err) => {
        // Remove expired subscriptions (410 Gone)
        if (err.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('user_id', userId).eq('device_hint', s.device_hint)
        }
      })
    )
  )
}

export async function sendPushToAvailableRunners(payload: PushPayload) {
  if (!process.env.VAPID_PRIVATE_KEY) return
  const admin = createAdminClient()
  const { data: profiles } = await admin.from('runner_profiles').select('user_id').eq('is_available', true).eq('is_suspended', false)
  if (!profiles?.length) return
  await Promise.allSettled(profiles.map(p => sendPushToUser(p.user_id, payload)))
}

export async function sendPushToAdmins(payload: PushPayload) {
  if (!process.env.VAPID_PRIVATE_KEY) return
  const admin = createAdminClient()
  const { data: admins } = await admin.from('users').select('id').eq('role', 'admin')
  if (!admins?.length) return
  await Promise.allSettled(admins.map(a => sendPushToUser(a.id, payload)))
}
