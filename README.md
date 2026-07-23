# Runner-Funded — Direct-Pay Bundle

## The pivot

Prior arc: runner-funded orders had Lymora (as admin) sending money to runners so they could go buy food. Every attempted approach — queue-based, Paystack transfers — either kept admin in the loop or ran into account-tier blockers.

This bundle flips the direction. **Customers pay the runner directly.** No Paystack for these orders. The runner keeps the customer's payment, uses it to buy the food, keeps their earnings, and owes CampusRun the delivery + plate fees for that order. Runners settle up periodically via bank transfer to admin.

## The flow

```
Customer places order (runner-funded restaurant)
        ↓
Order confirmed immediately (skip Paystack)
        ↓
Broadcast to available allowlisted runners
        ↓
Runner accepts → status: runner_funded_awaiting_payment
        ↓
Customer sees runner's bank details + amount to send
                       ↓
Customer sends payment via their own bank app
        ↓
Runner's bank alert lands
        ↓
Runner taps "I received the payment"
        ↓
Order → runner_funded_payment_confirmed → runner_assigned flow
        ↓
Runner buys food, delivers, marks delivered
        ↓
Runner now owes CampusRun (delivery_fee + plate_fee - runner_earnings)
        ↓
[Later] Runner sends accumulated debt to admin's bank
        ↓
Admin marks settled in /admin/settlements
```

## Money math per order

- Customer sends runner: `food_total + delivery_fee + plate_fee`
- Runner spends at restaurant: `food_total`
- Runner keeps: `runner_earnings`
- Runner owes CampusRun: `delivery_fee + plate_fee - runner_earnings`
- No processing_fee (no Paystack involved)

Stamped in `orders.platform_owed_amount` at accept time; cleared to 0 on cancel or set to 0 automatically on refund.

## Failure paths

- **Customer never pays** → cron watchdog auto-cancels after 20 min (configurable via `RUNNER_FUNDED_PAYMENT_DEADLINE_MIN`). Runner is freed to take other orders. Both parties get push.
- **Restaurant closed / can't buy** → runner opens "Cancel & refund" sheet, sends money back to customer from their bank app, taps "I've sent the refund". Order cancelled. Platform debt zeroed. Customer gets push.
- **Paystack Balance / transfer issues** → not applicable. Nothing routes through Paystack for these orders.

## What's in the bundle

**11 files, ~zero lingering Lymora/Michael references anywhere in the codebase:**

| Path | Change |
|---|---|
| `sql/003_direct_payment.sql` | **NEW MIGRATION.** New order statuses (`awaiting_payment`, `payment_confirmed`), payment-tracking columns on orders, `platform_owed_amount` + `platform_settled_at`, `platform_settlements` table |
| `types/index.ts` | New OrderStatus values |
| `app/api/payments/init/route.ts` | Detects runner-funded orders and short-circuits Paystack entirely; broadcasts to runners directly |
| `app/api/payments/webhook/route.ts` | Simplified — only handles restaurant_paid `charge.success` |
| `app/api/runner/accept/route.ts` | No Paystack call. Sets `runner_funded_awaiting_payment` + 20-min deadline + stamps `platform_owed_amount` |
| `app/api/runner/confirm-payment/route.ts` | **NEW.** Runner taps "received", advances to `payment_confirmed` |
| `app/api/runner/return-funds/route.ts` | Runner sends refund from own bank app, then confirms → order cancelled, platform debt zeroed |
| `app/api/admin/settlements/route.ts` | **NEW.** GET outstanding debt by runner; POST records a settlement |
| `app/api/cron/watchdog/route.ts` | New job: auto-cancel `runner_funded_awaiting_payment` orders past their deadline |
| `app/checkout/page.tsx` | Handles `skipPayment` response — no Paystack redirect for runner-funded |
| `app/order/[id]/page.tsx` | Runner order view. Direct-pay card with "I received the payment" CTA, platform-owed breakdown, "Message admin" (no more "Michael") |
| `app/track/[id]/page.tsx` | Customer track view. New `SendPaymentCard` — runner's bank name + copyable account number + copyable amount + countdown to deadline |
| `app/admin/settlements/page.tsx` | **NEW.** Settlements management: outstanding debt per runner + history tab |
| `app/admin/dashboard/page.tsx` | Nav: swap Runner Transfers → Runner Settlements |
| `app/admin/runner-funded/page.tsx` | Cleaned up example note text |

## Env vars

Only one new one, and it's optional:

```bash
# Minutes the customer has to send payment before the order auto-cancels
# and the runner is freed. Default: 20.
RUNNER_FUNDED_PAYMENT_DEADLINE_MIN=20
```

Plus a `NEXT_PUBLIC_ADMIN_WHATSAPP` if you want the runner's "Message admin" button to point somewhere specific — otherwise it falls back to the hardcoded number the earlier bundles used.

## Install

1. Run `sql/003_direct_payment.sql` in Supabase SQL editor. Idempotent.
2. Reload the schema cache: `NOTIFY pgrst, 'reload schema';`
3. Overlay all 15 files. Restart. `npx tsc --noEmit` clean.
4. No Paystack config changes needed. No account tier upgrade needed. Runner-funded orders bypass Paystack entirely.

## What each side sees

### Customer, after placing a runner-funded order

`/track/[id]` shows:
- Order details as usual
- A prominent "**Send payment to your runner**" card featuring:
  - The runner's name and photo initials
  - The exact amount (₦ figure, big, with a Copy button)
  - The runner's bank name and account number (big monospace, copy button)
  - The account name
  - A live countdown: "Send within 18:42"
  - A "Call [runner name]" shortcut

### Runner, after accepting

`/order/[id]` shows:
- The direct-pay card:
  - "Waiting for payment · Check your bank alerts" while awaiting
  - Full amount breakdown (customer sending / spent on food / your earnings / you owe CampusRun)
  - A big green "**✓ I received the payment**" button
  - Countdown to the auto-cancel deadline
  - "Call customer" + "Message admin" shortcuts
- After confirming: card flips green, shows "Head to [restaurant]"; normal delivery flow takes over

### Admin, checking on things

`/admin/settlements` shows:
- Total outstanding across all runners at the top
- Per-runner cards with debt amount, expandable to show all outstanding orders
- Multi-select checkboxes, bank ref input, "Mark settled" button
- History tab of past settlements

## Testing

1. Flag one restaurant as `requires_runner_funded` (already done for your restaurants).
2. As customer, place an order to that restaurant.
3. Check DB — order should have `payment_model = 'runner_funded'`, `status = 'confirmed'`, then move to `awaiting_runner` after broadcast.
4. Should NOT see any Paystack redirect. Instead: land on `/track/[orderId]` with runner-finding UI.
5. As allowlisted runner (with bank details on file), accept from `/dashboard`.
6. Runner: order goes to `runner_funded_awaiting_payment`, direct-pay card appears with "waiting for payment" state.
7. Customer: track page shows the runner's bank details + amount + countdown.
8. Manually send yourself money via your bank (or skip this step in test).
9. Runner: tap "I received the payment". Card flips green. Order → `runner_funded_payment_confirmed`.
10. Runner: mark picked up, mark delivered normally.
11. Admin: `/admin/settlements` shows the runner as owing `delivery_fee + plate_fee - runner_earnings`.
12. Runner sends admin the accumulated debt via bank transfer.
13. Admin: expand runner's card, select the settled orders, paste bank ref, tap "Mark settled".
14. Debt clears. Order is now marked `platform_settled_at`.

## Rollback

Everything's additive on the DB. If you need to switch back to restaurant_paid for a specific restaurant:

```sql
UPDATE restaurants SET requires_runner_funded = FALSE WHERE id = '...';
```

New orders to that restaurant will route through the existing Paystack flow again. In-flight runner-funded orders will complete via the new flow.

If you need to disable the direct-pay flow entirely:

```sql
UPDATE restaurants SET requires_runner_funded = FALSE;
```

The code paths for runner-funded stay dormant. Nothing else changes.
