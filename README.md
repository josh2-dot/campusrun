# Runner-Funded — Admin API Join Fix

## The bug

Symptom: an order was accepted, its status advanced to `runner_funded_pending_transfer`, the runner was on the allowlist, but `/admin/runner-transfers` showed nothing.

Cause: my original admin API queries used PostgREST joins:

```ts
.select('*, runner:users!runner_id(...), order:orders!order_id(restaurant:restaurants(name))')
```

For that to work, PostgREST needs to detect the foreign keys on `runner_transfer_queue` in its schema cache. When you add a new table via `CREATE TABLE`, **PostgREST doesn't automatically pick up the new FKs** — the schema cache is stale until someone reloads it. When it's stale, the join fails and the whole query returns an error. My original code didn't surface the error, so the admin page silently showed an empty list.

## The fix

Two things:

**1. Immediate — reload the schema cache** on your Supabase project. Two ways:

Via SQL editor:

```sql
NOTIFY pgrst, 'reload schema';
```

Or via dashboard: **Settings → API → Reload schema cache**.

That alone should make everything work with the code you already have. Try it first, refresh `/admin/runner-transfers`, and see if the pending transfers show up.

**2. Code fix — remove the dependency on the schema cache.** This bundle contains rewritten versions of the two admin APIs that use explicit lookups instead of PostgREST joins. Two effects:

- These APIs work on a fresh migration without needing anyone to remember to reload the schema cache.
- If a query does fail, the error now surfaces in the JSON response instead of silently returning empty.

## What this bundle contains

**2 files:**

| Path | Change |
|---|---|
| `app/api/admin/runner-transfers/route.ts` | **REPLACES** — batched explicit lookups: pull queue rows → collect unique runner_ids + order_ids → look up users, orders, restaurants in three parallel queries → assemble the response. Same output shape as before, no client changes needed. |
| `app/api/admin/runner-funded/route.ts` | **REPLACES** — same treatment for the allowlist API. The FKs on `runner_funded_allowlist.runner_id → users` are the same kind of new relationship the schema cache might not have picked up. |

## Install

Overlay the 2 files. Restart. Also run the schema-cache reload once — even though the code no longer depends on it, other things in Supabase might (RLS policies, other joined queries elsewhere in the app).

## Verify

1. Have an active runner-funded order in `runner_funded_pending_transfer` state.
2. Open `/admin/runner-transfers`.
3. You should see: total pending amount at the top, the runner grouped card, expandable to show the pending transfer with amount and bank details.
4. Select the transfer, optionally paste the real Paystack ref, mark paid.
5. Order advances to `runner_funded_awaiting_pickup`; runner gets the "💸 funds sent — go buy" push.

## If it's still empty after the fix

Then the queue insert genuinely didn't happen. Run:

```sql
SELECT * FROM runner_transfer_queue ORDER BY created_at DESC;
```

If it's empty, the accept route's `queueRunnerTransfer()` bailed and the order state advanced anyway — which would be a separate bug. Send me the row from `orders` for the pending order and I'll trace it:

```sql
SELECT id, order_ref, status, payment_model, runner_id,
       runner_funded_transfer_ref, runner_funded_transfer_amount
FROM orders
WHERE status LIKE 'runner_funded%';
```

If `runner_funded_transfer_ref IS NULL`, `queueRunnerTransfer()` never ran to completion, and I'll need to look at what caused that.
