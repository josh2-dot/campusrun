# Direct-Pay — Customer Tracking UX

Fixes for the customer-facing tracking page when the order is runner-funded. The screen was showing "PREPARING · 3 min · ON TIME" which is copy borrowed from the restaurant_paid flow where a restaurant cooks the food. In runner-funded, there's no restaurant preparing anything for you — a runner walks in and buys off the shelf.

## What changes

Four adjustments, all in `app/track/[id]/page.tsx`:

### 1. ETA computation branches on `payment_model`

Old:
```
runner_assigned_at set → label = 'Preparing', arriveAt = assigned + prep + 3min
```

New:
```
runner_funded + awaiting_payment  → 'Send payment', no countdown
runner_funded + payment_confirmed → 'Buying your food', ~25min rough estimate
restaurant_paid + runner_assigned  → 'Preparing' (unchanged)
```

The 25-min estimate for `payment_confirmed` breaks down as: 5 min to restaurant + 10 min to buy + 10 min to deliver. Rough, so it prefixes with "est." and the "ON TIME / RUNNING LATE" pill doesn't render for it (that pill is precise-ETA-only).

### 2. Header hides the countdown when it'd be misleading

For `runner_funded_awaiting_payment`: the SendPaymentCard has its own 20-min countdown to the payment deadline. Adding a second countdown at the top of the page competes with it and confuses. Now the header shows a clean "Send payment to your runner" line with no minutes.

### 3. Better status label for `payment_confirmed`

"Runner is on it" was too vague. Customer needs to understand the runner is going to a restaurant to buy their food — not that food is already being prepared.

`runner_funded_payment_confirmed` → **"Runner buying your food"**

### 4. Progress bar step for `awaiting_payment`

Was mapped to step 2 (On the way). But nothing's moving yet — the runner is waiting for the customer to pay. Now maps to step 1 (Confirmed), same as `awaiting_runner`. Progress advances to step 2 only when the runner has actually started doing something (payment confirmed, going to buy).

## What the customer will now see

| State | Header (large) | Subhead | Progress bar |
|---|---|---|---|
| `awaiting_runner` | "Finding a runner…" | (empty) | Step 1 |
| `runner_funded_awaiting_payment` | "Send payment to your runner" | "From Madam Joe" | Step 1 |
| `runner_funded_payment_confirmed` | "**est. ~25 min**" + "Runner buying your food · **Madam Joe**" | | Step 2 |
| `picked_up` | "**~10 min**" ON TIME · "Out for delivery" | | Step 2 |
| `delivered` | "Delivered!" | | Step 3 |

## Install

1 file, no migration.

- `app/track/[id]/page.tsx`

Overlay, restart. `npx tsc --noEmit` clean.

## Reality check about the "3 min" you saw

The "3 min" specifically was the old code computing:
```
arriveAt = runner_assigned_at + prep(15) + 3 = 18 minutes after assignment
now = 15 minutes after assignment
remaining = 18 - 15 = 3 minutes
```

Meaningless for runner-funded — nothing was actually happening at Madam Joe. The runner had just accepted, and any minute now had to walk to Madam Joe and buy the malt. New copy sets expectations closer to reality.

## Next thing worth doing (not in this bundle)

The runner's `/order/[id]` page needs similar language work. Currently the flow after payment_confirmed uses restaurant_paid copy — "Head to restaurant", "Pick up the food". For runner-funded it's more like "Go buy the malt from Madam Joe", "Grab the food, head to the customer". Small tweaks, worth doing separately.
