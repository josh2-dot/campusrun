# Runner-Funded — Direct-Pay Hotfix

Two bugs from the direct-pay bundle, both from me assuming things existed that didn't.

## Bug 1: "Order not found" when runner accepts

**Cause:** My accept route selected `plate_fee` from `orders`. That column doesn't exist — checkout folds the plate fee into `food_total` on insert. PostgREST rejected the select, `.single()` returned null, code returned "Order not found".

**Fix:** Removed `plate_fee` from the select. Fixed all downstream money math to work without it.

**Correct money model for direct-pay** (also documented inline):

- Customer sends runner: `food_total + delivery_fee` (same as they'd pay via Paystack — plate fee is already in `food_total`)
- Runner spends at restaurant: some subset of `food_total`
- Runner keeps: `runner_earnings` (₦300 default)
- Runner owes CampusRun: `delivery_fee - runner_earnings` (₦500 − ₦300 = ₦200 default, which is exactly `platform_cut`)

So on average per order: runner owes CampusRun ₦200.

## Bug 2: Customer's track page stuck on skeleton

**Cause:** My track page tried `runner_profile:runner_profiles!runner_id(...)` — but there's no direct FK from `orders` to `runner_profiles`. `runner_profiles` links to `users`, not `orders`. PostgREST couldn't resolve the relationship, the whole select failed silently, `order` stayed null, the loading skeleton never resolved.

**Fix:** Two changes:

1. **Nest the join** through users, which does have both FKs:
   ```
   runner:users!runner_id(full_name, phone, runner_profile:runner_profiles!user_id(bank_name, account_number))
   ```

2. **Add a defensive fallback**: if the joined query still comes back empty (e.g., schema cache stale after migration), fall back to a plain order select + separate lookups for runner + runner_profile. Same pattern I used in the admin APIs after the earlier schema-cache issue.

`SendPaymentCard` also updated to read bank details from `runner.runner_profile` instead of `order.runner_profile`.

## Install

**2 files, no migration:**

| Path | Change |
|---|---|
| `app/api/runner/accept/route.ts` | Removed `plate_fee` select + fixed money math |
| `app/track/[id]/page.tsx` | Fixed the join through users + added defensive fallback |

Overlay both, restart. `npx tsc --noEmit` clean.

## Verify

1. Reload the schema cache in Supabase (once):
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
2. Place a new test order to a `requires_runner_funded` restaurant.
3. **Customer side**: `/track/[id]` should render the send-payment card as soon as the runner accepts. Bank name, account number, amount, countdown.
4. **Runner side**: from `/dashboard`, tap Accept. Should route to `/order/[id]` with the direct-pay card in "awaiting payment" state, and the DB order status should be `runner_funded_awaiting_payment`.

If step 3 still shows a blank skeleton, the join is failing entirely — the fallback path should kick in. Check the browser console; you should see one of the two selects succeed.

If step 4 still says "Order not found", check:

```sql
SELECT id, order_ref, status, payment_model, runner_id
FROM orders
WHERE id = 'the-order-id-from-your-URL';
```

If the row exists with `payment_model = 'runner_funded'`, the accept route should now find it. If it doesn't exist at all, checkout didn't insert — separate issue.

## Pattern I'm going to internalize

This is the 5th or 6th time in this arc I've shipped code that assumes a column or relationship exists without checking the schema first. From now on, before writing any select against `orders`, `restaurants`, or `runner_profiles`, I'll open `supabase-schema.sql` and confirm the columns are actually there. If I need a column that doesn't exist, add a migration. If I need a join PostgREST doesn't have an FK for, either fix the FK or use explicit lookups.

`plate_fee` felt so obvious that I never questioned it — checkout was calling it `plateFee` in code, the checkout form displays it as a line item, and I filled in the mental gap that there must be a column. Never actually was.
