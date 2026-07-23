# Runner-Funded Direct-Pay — Clean Rebuild

Full rebuild of the runner-funded flow with paranoid error surfacing. Every failure now returns the actual reason (PostgREST error, HTTP code, hint) instead of masking as "Order not found".

## The design (recap from chat)

**Money math** (verified against your CR-1009 row):
- Customer sends runner: `food_total + delivery_fee`
- Runner spends at restaurant: ≈ `food_total`
- Runner keeps: `runner_earnings` (₦300 default)
- Runner owes CampusRun: `delivery_fee - runner_earnings` (₦200 default, equals `platform_cut`)

**State machine**:
```
pending → confirmed → awaiting_runner
                          ↓ [runner accepts]
                    runner_funded_awaiting_payment
                          ↓ [customer sends payment via bank]
                          ↓ [runner taps "I received the payment"]
                    runner_funded_payment_confirmed
                          ↓ [normal delivery flow]
                    picked_up → delivered
                          ↓ [runner accumulates platform_owed_amount]
                          ↓ [runner sends admin bank transfer]
                          ↓ [admin marks settled]
                    (settlement recorded)
```

**No Paystack** touches runner-funded orders. Ever. Customer pays runner directly.

## Rule I baked in this time

**Every failure surfaces the actual reason.** No more masked "Order not found" hiding schema errors, RLS blocks, or missing columns.

- Accept API: bank details lookup fails? You'll see the exact PostgREST message.
- Update fails because a column doesn't exist? Message tells you which column.
- RLS blocks a read? Message says so.

If it breaks after deploy, the alert on the runner's phone will tell you exactly what's wrong on the first try. No more debug rounds.

## Files (15 total)

**SQL:**
- `sql/001_direct_pay_full.sql` — consolidated migration, idempotent, ends with `NOTIFY pgrst, 'reload schema'`

**Types:**
- `types/index.ts` — add `runner_funded_awaiting_payment`, `runner_funded_payment_confirmed` to OrderStatus; add PaymentModel type

**API:**
- `app/api/runner/accept/route.ts` — verbose error surfacing throughout
- `app/api/runner/confirm-payment/route.ts` — runner taps "received"
- `app/api/runner/return-funds/route.ts` — direct-refund flow
- `app/api/payments/init/route.ts` — runner-funded skips Paystack, triggers allocation
- `app/api/payments/webhook/route.ts` — restaurant_paid only
- `app/api/admin/settlements/route.ts` — GET outstanding + POST record
- `app/api/admin/manual-order/create/route.ts` — reads restaurant flag, stamps `payment_model`
- `app/api/cron/watchdog/route.ts` — 20-min payment timeout job added

**Pages:**
- `app/checkout/page.tsx` — reads `requires_runner_funded`, stamps `payment_model`, handles `skipPayment`
- `app/track/[id]/page.tsx` — SendPaymentCard, explicit lookup for runner bank details
- `app/order/[id]/page.tsx` — direct-pay card + refund sheet, verbose fetch errors
- `app/admin/settlements/page.tsx` — settlements management UI
- `app/admin/dashboard/page.tsx` — added settlements nav

## Install

### Order matters

**Step 1: Migration first, and reload schema cache.**

```sql
-- Paste sql/001_direct_pay_full.sql into Supabase SQL editor. Run.
-- The migration ends with NOTIFY pgrst, 'reload schema'; already.
```

Wait 30 seconds. Then verify with:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name IN (
  'payment_model',
  'runner_funded_payment_expected_amount',
  'runner_funded_payment_deadline',
  'platform_owed_amount'
);
-- Should return 4 rows.

SELECT table_name FROM information_schema.tables
WHERE table_name IN ('runner_funded_allowlist', 'platform_settlements');
-- Should return 2 rows.

SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'order_status'::regtype
  AND enumlabel LIKE 'runner_funded%';
-- Should include awaiting_payment and payment_confirmed
```

If any of these don't return the expected count, migration didn't finish. Rerun.

**Step 2: Overlay all 15 files.** Keep your existing directory structure. Do NOT wholesale replace `types/index.ts` — the file in this bundle only adds two lines to the existing OrderStatus type + a new PaymentModel type. Merge them into whatever you already have.

**Step 3: Restart your dev server / redeploy.** For Vercel, push to trigger a new build. Do NOT trust hot-reload for API routes — force a rebuild.

**Step 4: Verify deploy took effect.** After redeploy:

```bash
# On your deployed code, this should return nothing:
grep -r plate_fee app/api/runner/accept/route.ts

# And this should return the new error-surfacing code:
grep -n "orderErr.message" app/api/runner/accept/route.ts
# Should show 2-3 lines mentioning error messages
```

If those checks don't match, your deploy is stale. Investigate build cache / branch mismatch.

## Test flow

1. Set a restaurant's `requires_runner_funded = true` in Supabase.
2. As customer: place order. You should land straight on `/track/[id]` — no Paystack redirect.
3. As allowlisted runner (with bank details on file): from `/dashboard`, tap Accept.
   - **If it fails**: the alert now tells you WHY. Paste that reason and I'll know exactly what to fix.
4. Runner's order page shows direct-pay card with breakdown + "I received the payment" button.
5. Customer's track page shows SendPaymentCard with bank name, account number (copyable), amount, countdown.
6. Runner taps "I received the payment" → order → `runner_funded_payment_confirmed`.
7. Normal flow: picked up, delivered.
8. `/admin/settlements` shows the runner as owing ₦200 (or whatever `delivery_fee - runner_earnings` computes to).
9. When runner sends admin the debt, admin marks it settled.

## Debugging when it goes wrong

Since every failure now surfaces its actual reason, debugging is:

1. Read the error message on the runner's screen.
2. If it's a PostgREST error like "column X does not exist" → the migration didn't fully take effect. Rerun step 1.
3. If it's "relation Y does not exist" → same, table missing from migration.
4. If it's an RLS error → check the RLS policies on the mentioned table.
5. If it's "Order was taken by another runner just now" → race condition, refresh.
6. If it's `NO_PAYOUT_ACCOUNT` → runner needs to set bank details first.

No more silent failures. No more "Order not found" hiding a real error.

## Env vars

```bash
RUNNER_FUNDED_PER_ORDER_CAP_NAIRA=8000            # optional, default 8000
RUNNER_FUNDED_PAYMENT_DEADLINE_MIN=20             # optional, default 20
NEXT_PUBLIC_ADMIN_WHATSAPP=2348068404839          # optional, has fallback
```

Nothing new required for basic operation.

## Rollback

Everything's additive. To disable direct-pay entirely:

```sql
UPDATE restaurants SET requires_runner_funded = FALSE;
```

New orders route through Paystack again. In-flight direct-pay orders complete via the new flow.

To wipe the schema additions (if you really need to):

```sql
DROP TABLE IF EXISTS platform_settlements;
DROP TABLE IF EXISTS runner_funded_allowlist;
-- Enum values can't easily be dropped in Postgres; leave them alone.
-- Columns can be dropped individually but the code will complain until
-- you also revert the code changes.
```
