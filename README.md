# Runner-Funded Payment Flow — CampusRun

Pilot implementation of the off-campus runner-funded flow. Runners on a hand-picked allowlist can accept orders to unregistered off-campus restaurants; they receive the food purchase float in their own bank account and walk in as paying customers.

**Scope, deliberately narrow:**
- Off-campus orders only (campus orders continue on `restaurant_paid`)
- Hand-picked runner allowlist, no self-service tiering
- Per-order cap `₦8,000` during pilot
- No receipt capture — restaurant price-gouging handled out-of-band via WhatsApp
- Queue-based transfers reviewed by admin (mirrors the existing `restaurant_transfer_queue`)

**Not in scope:** internal wallet, receipt capture, tier automation, cumulative float caps, customer-facing payment-model visibility.

---

## Install order

Steps 1 and 2 are safe to run against a live system; step 3 is a code deploy and needs a restart.

### 1. Run the migration

Path: `sql/001_runner_funded.sql`

```bash
psql "$DATABASE_URL" -f sql/001_runner_funded.sql
```

Idempotent — safe to re-run. Adds:
- `restaurants.requires_runner_funded` (bool, default false)
- `orders.payment_model` + 6 tracking columns
- `runner_funded_allowlist` table
- `runner_transfer_queue` table
- 3 new `order_status` enum values

### 2. Set env vars

Add to `.env`:

```bash
# Cap per single runner-funded order in naira. During pilot: 8000.
RUNNER_FUNDED_PER_ORDER_CAP_NAIRA=8000

# Michael's WhatsApp number (E.164, no + prefix). Runners' WhatsApp
# shortcut opens a chat with this number when they need help.
# The runner-funded flow explicitly does NOT collect receipts —
# price-gouging is handled by runners messaging Michael directly.
ADMIN_WHATSAPP_NUMBER=2348068404839
```

`ADMIN_WHATSAPP_NUMBER` isn't strictly required — falls back to `2348068404839` in code — but setting it explicitly makes future changes one place, not a search-and-replace.

### 3. Overlay the code

Copy each file to the corresponding path in your repo. Directory structure mirrors the app:

```
sql/001_runner_funded.sql                                    → sql/
app/api/payments/transfer/runner.ts                          → app/api/payments/transfer/
app/api/runner/accept/route.ts                    (replaces)
app/api/runner/return-funds/route.ts                         → app/api/runner/return-funds/  (new)
app/api/payments/webhook/route.ts                 (replaces)
app/api/admin/runner-transfers/route.ts                      → app/api/admin/runner-transfers/  (new)
app/api/admin/restaurants/route.ts                (replaces)
app/checkout/page.tsx                             (replaces)
app/admin/dashboard/page.tsx                      (replaces)
app/admin/restaurants/page.tsx                    (replaces)
app/admin/runner-funded/page.tsx                             → app/admin/runner-funded/  (new)
app/admin/runner-transfers/page.tsx                          → app/admin/runner-transfers/  (new)
app/dashboard/page.tsx                            (replaces)  (runner dashboard)
app/order/[id]/page.tsx                           (replaces)  (runner order detail)
types/index.ts                                    (replaces)
```

12 files touched, 4 new files, 1 migration.

**Typecheck:** `npx tsc --noEmit` after overlay should return 0 errors.

### 4. Set up the pilot

**Add trusted runners to the allowlist.** Navigate to `/admin/runner-funded` and add the 3–5 runners you personally vouch for. Include a note with each — you'll thank yourself in 6 months when you're trying to remember why someone's on the list.

**Flag restaurants to require runner-funded.** In `/admin/restaurants`, tap the small "runner pays?" toggle on any unregistered off-campus restaurant. It turns yellow ("💸 RUNNER PAYS") when active. All new orders to that restaurant will route through the new flow.

**Tell the runners.** WhatsApp message to each allowlisted runner:

> Hey — you're now approved for our pilot **runner-funded** flow. When you see a yellow-bordered order marked "YOU BUY FOOD", accepting means we send the food money + your earnings straight to your bank account. You walk in, buy the food like any customer, and deliver.
>
> Two important things:
> 1. If the restaurant is closed or refuses the sale, tap **Return Funds** in the order screen. It'll walk you through paying the money back. Don't just keep it — the money is tracked.
> 2. If the restaurant overcharges you compared to the menu price, **don't eat the loss**. Message me on WhatsApp and I'll sort it out.
>
> Per-order cap during the pilot is **₦8,000**. Anything bigger gets skipped.

Without that message, runners will silently eat gouging losses and stop taking runner-funded orders — you'll find out only when the pilot has already failed. The onboarding sentence is load-bearing.

---

## Smoke test walkthrough

Run these in order against staging. Full flow takes ~10 minutes.

### Test 1 — order routing at creation

1. In `/admin/restaurants`, flag one restaurant as runner-funded.
2. As a customer, place an order to that restaurant.
3. In your database, verify: `select payment_model from orders order by created_at desc limit 1;` → should be `runner_funded`.

### Test 2 — runner accept, non-allowlisted

1. As a runner who is NOT on the allowlist, try to accept a runner-funded order.
2. Expected: error message "you're not on the allowlist yet."

### Test 3 — runner accept, allowlisted

1. Add yourself to the allowlist in `/admin/runner-funded`.
2. As the allowlisted runner, ensure your bank details are filled in (in earnings/profile).
3. Accept a runner-funded order.
4. Expected: order state → `runner_funded_pending_transfer`; a row appears in `runner_transfer_queue` with `status='pending'`; Michael receives an SMS alert; the order page shows the "Waiting for funds" card with the amount breakdown.

### Test 4 — admin marks transfer sent

1. Navigate to `/admin/runner-transfers`.
2. Expand the runner's card, select the pending transfer, optionally paste the real Paystack reference, mark paid.
3. Expected: order state → `runner_funded_awaiting_pickup`; runner receives push notification "💸 Funds sent — go buy"; order page shows the "You buy the food" card with sent-at time and reference; the WhatsApp + Return Funds buttons become visible.

### Test 5 — happy path completion

1. As runner, mark picked up in the order screen.
2. Verify the delivery flow continues normally (`picked_up` → `delivered`).
3. Runner keeps their earnings (already in their account).

### Test 6 — Return Funds flow

1. Repeat tests 3 + 4 on a new order.
2. On the awaiting-pickup screen, tap "Return funds", pick a reason ("Restaurant is closed"), submit.
3. Expected: opens Paystack payment link for the transfer amount; order state → `runner_funded_returning`.
4. Complete the payment (use Paystack test cards if on staging).
5. Expected: webhook fires; order state → `cancelled`; customer refund queued; both parties get push notifications.

### Test 7 — over-cap rejection

1. Create an order with `food_total + runner_earnings > 8000`.
2. As allowlisted runner, try to accept.
3. Expected: "Order value exceeds the current runner-funded cap of ₦8,000."

---

## Rollback plan

If something breaks in production and you need to disable the flow immediately:

**Fastest — disable at the restaurant level.** Toggle `requires_runner_funded=false` on the flagged restaurant(s):

```sql
UPDATE restaurants SET requires_runner_funded = FALSE;
```

New orders will route back through the existing `restaurant_paid` flow. In-flight runner-funded orders will complete normally.

**Nuclear — revert the code.** The four replaced routes (`accept`, `webhook`, `restaurants` API, `checkout`) can each revert to their previous version cleanly. The migration is additive — nothing in the old code touches the new columns/tables/statuses.

The migration itself is safe to leave in place after a code rollback. The added columns and tables just won't be read from.

---

## What triggers policy revisit

Per the spec: the trust-based direct-transfer model in this pilot works because you personally vouch for every runner. It stops holding when any of these fire:

- **6+ month tenure:** any runner in the runner-funded flow hasn't been personally known to you for 6+ months
- **Volume threshold:** total prepaid runner-funded volume crosses ₦500K/week
- **Any incident:** any incident of any size that involves runner-side money handling — fraud, honest mistake, misplaced funds, runner going offline mid-order with money in hand

When any trigger fires, revisit the wallet-vs-transfer decision, revisit exposure caps, and revisit whether receipt capture becomes worth building. None of that infrastructure exists in this pilot — deliberately.

---

## Success criteria at 4 weeks

Watch these:

- **Zero incidents involving runner-side money handling.** Not "low" — zero. If the trust assumption holds at 3–5 known runners, this is what the data should look like.
- **Under 2% of runner-funded orders end in Return Funds.** Higher signals the wrong restaurants got flagged.
- **Under 1 gouging report per week.** More than that, receipt capture becomes worth building.
- **At least 8 off-campus restaurants live on runner-funded within 30 days.** This is the whole reason for the exercise — if you're not onboarding restaurants faster than under the old flow, the pilot didn't work.

If the first criterion fails, pause the pilot immediately and reopen the wallet decision. The others are data for the next iteration.
