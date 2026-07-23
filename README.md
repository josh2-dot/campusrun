# Runner-Funded — Real Paystack Transfers

## The mea culpa

You asked for automatic Paystack transfers to runners. I saw the existing `restaurant_transfer_queue` pattern in your codebase and decided a queue-based flow was "actually better for the pilot — every runner-facing transfer gets eyeballed before hitting send." That was me overriding your stated requirement with my own design opinion, and it re-created the exact float-tending workflow you were trying to escape. This bundle fixes that.

## What changes

Runner-funded transfers now fire **automatically via the Paystack Transfers API** on runner accept. No admin approval step. Money goes directly from your Paystack Balance to the runner's registered bank account.

The `runner_transfer_queue` table stays — but as an **audit log**, not an action queue. `/admin/runner-transfers` becomes a read-only monitoring view.

## The new flow

```
Runner clicks Accept on a runner-funded order
        ↓
Get or create Paystack transfer recipient for this runner
  (creates once, then cached on runner_profiles.paystack_recipient_code)
        ↓
POST /transfer  (source: balance, amount: kobo, recipient: RCP_...)
        ↓
     ┌──────────────┬─────────────┬────────────┐
     ↓              ↓             ↓            ↓
  success        pending         otp         error
(test mode /   (live mode —   (config     (balance,
 fast live)     wait for      error —      network,
                webhook)      OTP is on)   etc.)
     ↓              ↓             ↓            ↓
  Order →      Order stays   Rollback +   Rollback +
  awaiting_    pending_      "disable      surface
  pickup       transfer      OTP" error    error
     ↓              ↓
  Push runner    Push runner
  "funds sent"   "processing"
                     ↓
              [webhook fires]
                     ↓
               transfer.success
                     ↓
                  Order →
                  awaiting_pickup
                     ↓
                  Push runner
                  "funds sent"

Failure paths:
  transfer.failed  → Rollback order + push runner + SMS admin
  transfer.reversed → Alert admin (money bounced back — needs manual handling)
```

## What this bundle contains

**8 files:**

| Path | Change | Purpose |
|---|---|---|
| `sql/002_paystack_transfers.sql` | **NEW MIGRATION** | Adds `paystack_recipient_code` to runner_profiles, `paystack_transfer_code` + `failure_reason` to runner_transfer_queue, extends status CHECK with `success`/`reversed` |
| `lib/paystack/transfers.ts` | **NEW** | Bank code lookup + get-or-create recipient + initiate transfer, with proper OTP + error handling |
| `app/api/payments/transfer/runner.ts` | **REPLACES** | Now fires the real Paystack transfer instead of just queueing |
| `app/api/runner/accept/route.ts` | **MODIFIED** | Reacts to Paystack's initial status — advances order to awaiting_pickup on immediate success, sends "processing" push when pending |
| `app/api/payments/webhook/route.ts` | **MODIFIED** | Handles `transfer.success` / `transfer.failed` / `transfer.reversed` events. Advances order, rolls back on failure, alerts admin on reversal |
| `app/api/runner/bank-details/route.ts` | **MODIFIED** | Clears cached `paystack_recipient_code` when runner updates bank |
| `app/api/admin/runner-transfers/route.ts` | **REPLACES** | Removes the manual mark-paid POST. GET now returns audit-view fields (success/failed/reversed counts, transfer_code, failure_reason) |
| `app/admin/runner-transfers/page.tsx` | **REPLACES** | Redesigned as read-only audit view. Status pills (IN FLIGHT / SUCCESS / FAILED / REVERSED), failure reasons inline, copyable transfer codes for Paystack reconciliation |

## Install

### 1. Run the migration

```bash
psql "$DATABASE_URL" -f sql/002_paystack_transfers.sql
```

Or paste into the Supabase SQL editor. Idempotent.

### 2. Reload the Supabase schema cache

```sql
NOTIFY pgrst, 'reload schema';
```

New columns need to be visible to PostgREST.

### 3. Disable Paystack OTP for transfers

**Critical.** Without this, transfers require someone to manually approve each one via SMS — which defeats the whole point.

- Log into your Paystack Dashboard
- Go to **Settings → Preferences**
- Find **"Confirm transfers before sending"**
- **Uncheck it**
- Save

If you skip this step, every transfer will come back with `status: 'otp'` and the accept route will surface: *"Paystack OTP is on — admin needs to disable it in Paystack settings."* You'll know immediately.

### 4. Configure the webhook URL

If your webhook is already set up for `charge.success` events, it's already receiving `transfer.*` events too — Paystack sends everything to the same URL. No new configuration needed.

Confirm at **Paystack Dashboard → Settings → API Keys & Webhooks**. Your webhook URL should be `https://your-domain.com/api/payments/webhook`.

### 5. Overlay the code

Drop all 8 files into your repo. Restart. `npx tsc --noEmit` clean.

### 6. Fund the Paystack Balance

Runner-funded transfers pull from your Paystack Balance, not from a linked bank. Make sure there's enough there to cover expected daily volume + a buffer. Top-up via the Paystack Dashboard.

Suggested starting float: `per_order_cap × expected_orders_per_day × 2`. For pilot at ₦8,000 cap and 10 orders/day → ₦160,000 buffer.

## Testing

### Test mode

Paystack test transfers **always succeed instantly**. Response comes back with `status: 'success'` and the webhook fires immediately. Your test flow:

1. Runner accepts a runner-funded order.
2. Paystack test transfer fires.
3. Response is `success`.
4. Order advances directly to `runner_funded_awaiting_pickup`.
5. Runner sees "funds sent — go buy" push.
6. No actual money moves (test mode).

Verify by checking the queue row:

```sql
SELECT status, paystack_transfer_code, paystack_ref
FROM runner_transfer_queue
ORDER BY created_at DESC
LIMIT 1;
```

You should see `status = 'success'` and a valid `TRF_...` code.

### Live mode

Live transfers may return `status: 'pending'` initially and complete via webhook in seconds to minutes. Your flow:

1. Runner accepts.
2. Response is `pending`.
3. Order stays in `runner_funded_pending_transfer`, runner sees "processing your transfer" push.
4. Webhook `transfer.success` arrives → order advances to `runner_funded_awaiting_pickup`, runner sees "funds sent — go buy" push.
5. Money is actually in the runner's bank account.

## Error handling

Every failure mode has an intentional path:

| Failure | Where it fails | User-facing behaviour |
|---|---|---|
| Runner has no bank details | Preflight in accept route | Blocked with "add bank in Profile" |
| Runner has invalid bank details | `getOrCreateRecipient` fails | Bailed with Paystack's error message |
| Paystack balance too low | `initiateTransfer` returns 400 | Order rolled back, runner sees error, admin gets SMS |
| OTP is enabled | `initiateTransfer` returns `status: 'otp'` | Specific error asking to disable OTP |
| Bank code not found | `getBankCode` returns null | Error: "Couldn't find Paystack bank code for X" |
| Transfer initiated but later fails | `transfer.failed` webhook | Order rolled back, runner + admin notified |
| Transfer bounces after success | `transfer.reversed` webhook | Admin SMS'd — money is back in balance but runner may have already spent |

## What the `transfer_reversed` case actually means

If a transfer completes successfully but the destination bank rejects it later (wrong account number, closed account, etc.), Paystack sends `transfer.reversed`. The money returns to your Paystack Balance.

By the time this fires, the runner has probably already gone to the restaurant and spent their own money on the food. So we **don't automatically roll back the order** — we just SMS you so you can handle it out-of-band. Options in that case: manually re-fire the transfer to a different account, or reimburse the runner directly.

Rare in practice (Paystack's account resolution API catches most bad account numbers at recipient creation), but worth knowing exists.

## What the audit view now shows

`/admin/runner-transfers` per runner:

- **In flight**: transfers where the webhook hasn't confirmed yet
- **Sent**: successfully completed transfers
- **Failed**: transfers Paystack rejected or reversed

Runners with any failures get a red-bordered card so you can spot them at a glance. Expanding a runner shows the transfer list with status pills, timestamps, amounts, and copyable Paystack transfer codes for reconciliation against Paystack's Dashboard.

## Verify end-to-end

After overlaying and running the migration:

```sql
-- Check the recipient column exists on runner_profiles
SELECT column_name FROM information_schema.columns
WHERE table_name = 'runner_profiles' AND column_name = 'paystack_recipient_code';

-- Check the queue has the new columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'runner_transfer_queue'
  AND column_name IN ('paystack_transfer_code', 'failure_reason');

-- Check the status CHECK includes success/reversed
SELECT pg_get_constraintdef(c.oid)
FROM pg_constraint c
WHERE c.conname = 'runner_transfer_queue_status_check';
```

Then have your allowlisted runner accept a runner-funded order. Watch:
- Order state advances to `runner_funded_awaiting_pickup` (test mode) or stays `runner_funded_pending_transfer` (live mode)
- Queue row appears with `status = 'success'` or `sent`, and `paystack_transfer_code` populated
- Runner sees the "funds sent" or "processing" push
- `/admin/runner-transfers` shows the transfer with the right status pill

If any of those don't happen, run:

```sql
SELECT status, paystack_ref, paystack_transfer_code, failure_reason
FROM runner_transfer_queue
ORDER BY created_at DESC LIMIT 5;
```

And send me what you see. The `failure_reason` column now captures Paystack's error text directly, so debugging becomes: "read the failure_reason and act on it."
