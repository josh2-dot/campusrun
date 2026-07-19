# Runner-Funded — Manual Order + Pantry Flag Fix

## What went wrong

You had every off-campus restaurant flagged `requires_runner_funded = true`, but every new order still came out as `payment_model = 'restaurant_paid'`. Two root causes:

### Root cause 1: I only patched the customer checkout, not the admin manual-order flow

The codebase has **two order-insertion points**:

- `app/checkout/page.tsx` — customer places an order via the app ✅ patched
- `app/api/admin/manual-order/create/route.ts` — admin creates orders from WhatsApp messages ❌ **not patched**

Since most restaurants in your DB have `is_open = false`, customers can't reach the checkout for them. All the recent test orders (CR-1001 → CR-1004) went through the admin manual-order flow, which never saw the runner-funded flag and defaulted to the DB's `restaurant_paid` fallback.

### Root cause 2: My checkout patch explicitly skipped pantry orders

I wrote a comment: *"Pantry orders are always restaurant_paid — pantry is internal."* That was a wrong opinion. You've flagged `CampusRun Pantry` as `requires_runner_funded = true`, meaning you want pantry orders to route through runner-funded too. My patch ignored that.

CR-1004 is a pantry order. Even if it had gone through checkout instead of manual-order, my patch would still have marked it `restaurant_paid`.

## The fix

**2 files:**

| Path | Change |
|---|---|
| `app/api/admin/manual-order/create/route.ts` | Now reads `restaurants.requires_runner_funded` and sets `payment_model` accordingly. |
| `app/checkout/page.tsx` | Pantry orders now also respect the flag on the pantry restaurant. |

## Install

Overlay the 2 files. Restart. `npx tsc --noEmit` clean.

## Verify

**Manual-order path** (this is where CR-1001 through CR-1004 went):

1. In `/admin/manual-order`, build an order from a WhatsApp message. Pick any flagged restaurant (e.g. Havilah's, which is `is_open: true`).
2. Complete the flow → order gets created with `payment_model = 'runner_funded'` (not `restaurant_paid`).
3. Runner accepts → order enters `runner_funded_pending_transfer`.
4. Row appears in `runner_transfer_queue`.
5. `/admin/runner-transfers` shows the pending transfer.

**SQL check:**

```sql
SELECT id, order_ref, status, payment_model, restaurant_id, created_at
FROM orders
ORDER BY created_at DESC
LIMIT 5;
```

New orders to flagged restaurants should show `payment_model = 'runner_funded'`.

## About the existing test orders

CR-1001 through CR-1004 are already stamped `payment_model = 'restaurant_paid'`. That's baked in at creation, so it doesn't change retroactively. Two options:

1. **Leave them as-is.** They're already cancelled or delivered anyway.
2. **Manually flip one** if you want to test the runner-funded flow without placing a new order:

```sql
-- Warning: only do this on a test/staging order, or one you're comfortable
-- putting through a state change. This bypasses the checkout logic that
-- normally sets payment_model.
UPDATE orders
SET payment_model = 'runner_funded',
    status = 'awaiting_runner',
    runner_id = NULL,
    runner_assigned_at = NULL
WHERE order_ref = 'CR-1004';
```

Then have your allowlisted runner accept it. Note this bypasses the `is_open` check; if the pantry is closed you'll need to reopen it first for the runner to see the order in their available list.

For a cleaner test, just create a new manual order after overlaying the fix.

## Why this pattern of bugs keeps coming up

Same class of mistake as the allowlist and admin-join fixes: I patched the obvious path (customer checkout) but didn't audit the full surface area of order creation. Every place that inserts into `orders` needs the same `payment_model` logic. In your codebase that's now two places; if you ever add a third (an in-app quick-order, a scheduled-order path, etc.), the pattern needs to move with it.

Cleanest long-term solution would be a shared helper — `resolvePaymentModel(restaurantId)` — used by every order-creation path. Overkill for pilot scale (two callers), worth extracting when it becomes three.
