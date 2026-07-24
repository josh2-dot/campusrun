# Runner-Funded Direct-Pay — Escape + Bank Details Hotfix

Two bugs from your screenshot. Both fixed.

## Bug 1: `\u20A6`, `\uD83D\uDCB8` etc. rendering as literal text

**Root cause:** JSX gotcha. Inside JSX text (between tags), `\uXXXX` is not treated as an escape sequence — it's just plain text. Escapes only work inside JS string literals (props, variables, template literals).

**What I wrote (broken):**
```jsx
<span>\u20A6{amount.toLocaleString()}</span>  // ❌ prints "\u20A61,000"
```

**What it should be:**
```jsx
<span>₦{amount.toLocaleString()}</span>       // ✅ prints "₦1,000"
```

Fixed everywhere it appeared as JSX text or template-literal text:
- `app/track/[id]/page.tsx` (SendPaymentCard) — 5 escapes replaced
- `app/order/[id]/page.tsx` (direct-pay card, refund sheet, step icons) — 13 escapes replaced
- `app/api/runner/accept/route.ts` (SMS + push message bodies) — 12 escapes replaced

All replaced with literal ₦, 💸, 📞, 📦, 🛵, 🏪, 🏁, —, ✓, ✅, ✉ etc.

## Bug 2: Bank name + account number showing "—" dashes

**Root cause:** The customer's track page was fetching runner_profiles client-side. RLS correctly blocks a customer from reading another user's bank details from that table. My select returned null silently, the SendPaymentCard fell back to its `—` placeholder.

**Why the accept flow still worked:** the accept route uses `createAdminClient()` (service role, bypasses RLS), so the preflight bank-details check succeeded and the runner was allowed to accept. But the customer-side client can't see them.

**Fix:** new server-side endpoint `GET /api/orders/[id]/runner-bank` that:
- Verifies the caller is the customer on this order
- Verifies the order is in `runner_funded_awaiting_payment` state
- Returns just `full_name, phone, bank_name, account_number` to the caller

The track page now calls this endpoint instead of hitting `runner_profiles` directly.

**Gate is strict:** bank details are only returned while the order is in `awaiting_payment`. After the runner confirms receipt, the endpoint returns 409. This is intentional — no reason to keep exposing bank details after payment is done.

## Files (3)

| Path | Change |
|---|---|
| `app/api/orders/[id]/runner-bank/route.ts` | **NEW.** Server endpoint that gates access to runner bank details |
| `app/track/[id]/page.tsx` | Fetches bank details from the new endpoint + all escape sequences replaced with real characters |
| `app/order/[id]/page.tsx` | All escape sequences replaced |
| `app/api/runner/accept/route.ts` | Escape sequences in push/SMS bodies replaced |

## Install

Overlay all 4 files. Restart. `npx tsc --noEmit` clean.

No migration, no env changes.

## Verify

1. Place a new runner-funded order.
2. Have runner accept.
3. Customer's track page should now show:
   - Big **₦** with the correct amount (not `\u20A61,000`)
   - The runner's actual **bank name** (e.g., "Opay", "Kuda Bank")
   - The runner's actual **account number** in monospace
   - Real emojis for the header + Call button
4. If bank details still show `—`, the runner literally has no bank details on `runner_profiles`. Check:
   ```sql
   SELECT user_id, bank_name, account_number
   FROM runner_profiles
   WHERE user_id = '<runner-id-from-order>';
   ```
   If bank_name and account_number are null, the runner needs to save them via Profile → Payout account. My accept preflight should have blocked them; if it didn't, that's a separate bug.

## Note on Unicode in TypeScript files

The escape-sequence bug is deeply my fault — I habitually write `\u20A6` in strings assuming JS treats it as an escape everywhere. It doesn't inside JSX children. Two ways to avoid this in future:

1. **Use the actual character** — `₦`, `💸`, `—` etc. Modern editors and TypeScript handle Unicode fine.
2. **If you need to escape** (e.g., for terminal-hostile source control), wrap in a JS expression: `<span>{'\u20A6'}{amount}</span>`

I'll stick to (1) going forward.
