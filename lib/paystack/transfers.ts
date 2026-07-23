// lib/paystack/transfers.ts
//
// Paystack transfer helpers. Three concerns, kept separate:
//   1. Bank name → bank code lookup (via the list-banks API)
//   2. Get-or-create transfer recipient (cached on runner_profiles)
//   3. Initiate a transfer to a recipient
//
// The runner-funded flow calls these in sequence from
// app/api/payments/transfer/runner.ts on runner accept. Webhook
// events (transfer.success, transfer.failed, transfer.reversed)
// are handled in app/api/payments/webhook/route.ts.

import { createAdminClient } from '@/lib/supabase/server'

const PAYSTACK_BASE = 'https://api.paystack.co'

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Bank lookup
// ───────────────────────────────────────────────────────────────────
//  Runner-side UI stores bank name as a display string ("Opay",
//  "Kuda Bank"). Paystack's transfer recipient endpoint needs the
//  bank_code (e.g. "999992" for Opay). We look it up once per runner
//  at recipient creation time, then cache the recipient_code so we
//  don't need to look up the code again.
//
//  The bank name matching is fuzzy — Paystack's canonical bank name
//  might be "Opay Digital Services Limited" while the runner picked
//  "Opay" from our dropdown. We normalize and match on prefix.
// ═══════════════════════════════════════════════════════════════════

function normalizeBankName(s: string): string {
  return s.toLowerCase()
    .replace(/\bbank\b/g, '')
    .replace(/\blimited\b/g, '')
    .replace(/\bltd\b/g, '')
    .replace(/\bplc\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

interface PaystackBank { name: string; code: string; active: boolean; country: string }
let bankCache: { list: PaystackBank[]; fetchedAt: number } | null = null

export async function getBankCode(bankName: string): Promise<string | null> {
  // Cache the bank list for an hour — codes don't change often.
  const now = Date.now()
  if (!bankCache || (now - bankCache.fetchedAt) > 3600 * 1000) {
    const res = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria&perPage=100`, {
      headers: authHeaders(),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.status || !Array.isArray(data.data)) return null
    bankCache = { list: data.data, fetchedAt: now }
  }

  const target = normalizeBankName(bankName)
  // Try exact normalized match first; fall back to prefix match.
  const exact = bankCache.list.find(b => normalizeBankName(b.name) === target)
  if (exact) return exact.code
  const prefix = bankCache.list.find(b => normalizeBankName(b.name).startsWith(target) || target.startsWith(normalizeBankName(b.name)))
  return prefix?.code ?? null
}

// ═══════════════════════════════════════════════════════════════════
//  Transfer recipient
// ───────────────────────────────────────────────────────────────────
//  Creates a Paystack transfer recipient for this runner if one
//  doesn't exist yet. Cache the recipient_code on runner_profiles
//  so subsequent transfers to the same runner skip this API call.
//
//  If the runner updates their bank details, the caller (the bank-
//  details save endpoint) should clear paystack_recipient_code so
//  the next transfer creates a fresh recipient.
// ═══════════════════════════════════════════════════════════════════

export async function getOrCreateRecipient(runnerId: string): Promise<
  | { ok: true; recipientCode: string }
  | { ok: false; reason: string }
> {
  const supabase = createAdminClient()

  const { data: profileRaw } = await supabase
    .from('runner_profiles')
    .select('paystack_recipient_code, bank_name, account_number')
    .eq('user_id', runnerId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = profileRaw as any

  if (profile?.paystack_recipient_code) {
    return { ok: true, recipientCode: profile.paystack_recipient_code }
  }
  if (!profile?.bank_name || !profile?.account_number) {
    return { ok: false, reason: 'Runner has no bank details on file' }
  }

  const { data: userRaw } = await supabase
    .from('users').select('full_name').eq('id', runnerId).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullName = (userRaw as any)?.full_name ?? 'Runner'

  const bankCode = await getBankCode(profile.bank_name)
  if (!bankCode) {
    return { ok: false, reason: `Couldn't find Paystack bank code for "${profile.bank_name}"` }
  }

  // Paystack's create-recipient endpoint returns the existing recipient
  // if the account_number + bank_code combo has been created before, so
  // this call is safe to make even when caching isn't perfect.
  const res = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      type: 'nuban',
      name: fullName,
      account_number: profile.account_number,
      bank_code: bankCode,
      currency: 'NGN',
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.status || !data.data?.recipient_code) {
    return { ok: false, reason: data.message ?? 'Paystack rejected the recipient' }
  }

  const recipientCode: string = data.data.recipient_code

  await supabase
    .from('runner_profiles')
    .update({ paystack_recipient_code: recipientCode })
    .eq('user_id', runnerId)

  return { ok: true, recipientCode }
}

// ═══════════════════════════════════════════════════════════════════
//  Initiate transfer
// ───────────────────────────────────────────────────────────────────
//  Paystack's initial response tells us the transfer was queued at
//  their end. The actual money movement is asynchronous — the final
//  outcome comes via webhook events (transfer.success, transfer.failed,
//  transfer.reversed).
//
//  Response's data.status field:
//    - 'success': test mode always, or live mode where the transfer
//                 completed immediately. Safe to advance the order.
//    - 'pending': live mode — accepted for processing, wait for webhook.
//                 Order stays in the pending_transfer state.
//    - 'otp':     OTP is enabled on the account. This is a configuration
//                 error for our use case — we can't complete the transfer
//                 without human intervention. Caller should surface a
//                 clear error asking admin to disable OTP in Paystack.
// ═══════════════════════════════════════════════════════════════════

export type TransferInitialStatus = 'success' | 'pending' | 'otp'

export async function initiateTransfer(params: {
  recipientCode: string
  amountNaira: number
  reference: string  // Our reference — used by webhook to identify the order
  reason: string     // Shows in the runner's bank statement
}): Promise<
  | { ok: true; transferCode: string; initialStatus: TransferInitialStatus }
  | { ok: false; reason: string; code?: string }
> {
  const res = await fetch(`${PAYSTACK_BASE}/transfer`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      source: 'balance',
      amount: params.amountNaira * 100, // Paystack works in kobo
      recipient: params.recipientCode,
      reason: params.reason,
      reference: params.reference,
      currency: 'NGN',
    }),
  })

  const data = await res.json()

  if (!res.ok || !data.status) {
    // Most common failures at this stage:
    //   - insufficient_balance: Paystack balance too low
    //   - invalid_key: PAYSTACK_SECRET_KEY wrong
    //   - transfer_disabled: account not approved for transfers
    return {
      ok: false,
      reason: data.message ?? 'Paystack rejected the transfer',
      code: data.code,
    }
  }

  const transferCode: string | undefined = data.data?.transfer_code
  const initialStatus: string = data.data?.status ?? 'pending'

  if (!transferCode) {
    return { ok: false, reason: 'Paystack returned no transfer_code' }
  }

  if (initialStatus !== 'success' && initialStatus !== 'pending' && initialStatus !== 'otp') {
    // Unknown state — treat as pending so we wait for the webhook
    return { ok: true, transferCode, initialStatus: 'pending' }
  }

  return { ok: true, transferCode, initialStatus: initialStatus as TransferInitialStatus }
}

// Convenience — clear the cached recipient. Called from the bank-details
// save endpoint so the next transfer picks up the new account details.
export async function invalidateRecipientCache(runnerId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('runner_profiles')
    .update({ paystack_recipient_code: null })
    .eq('user_id', runnerId)
}
