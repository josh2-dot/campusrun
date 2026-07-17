# Runner-Funded — Bank Details Follow-up

Small addition to the main runner-funded bundle. Discovered while checking the runner profile screen: `runner_profiles.bank_name` and `runner_profiles.account_number` were never being populated by any code path. The existing "Request payout" flow writes bank details only to `payout_requests`, never persists them.

Without this fix, the runner-funded accept gate in the main bundle rejects **every** runner with "Add your bank account first" — the pilot literally cannot start.

## What this bundle contains

**4 files:**

| Path | Change |
|---|---|
| `app/api/runner/bank-details/route.ts` | **NEW** — save/update endpoint that upserts bank_name + account_number to runner_profiles |
| `app/api/runner/request-payout/route.ts` | **MODIFIED** — now also persists bank details to runner_profiles (autofills next payout, unlocks runner-funded) |
| `app/api/runner/accept/route.ts` | **MODIFIED** — error message now points to actual UI location: "Profile → Payout account" |
| `app/runner-profile/page.tsx` | **MODIFIED** — new "Payout account" card above Payout history, plus edit sheet with bank picker and account number input |

## Install order

1. Overlay these 4 files into your repo (they replace the corresponding files from the main runner-funded bundle where they overlap).
2. Restart the app. No migration needed — uses columns that already exist.
3. `npx tsc --noEmit` should be clean.

## What the runner sees

On `/runner-profile`, between the "Performance" stats and "Payout history", there's now a card:

**When bank details are not set:**

```
Payout account                              [Add bank]
Not set. Add a bank to receive payouts and
unlock runner-funded orders.
```

**When bank details are set:**

```
Payout account                              [Edit]
┌─────────────────────────────────────┐
│  ✓  Opay                            │
│     0812345678                      │
└─────────────────────────────────────┘
```

Tapping "Add bank" or "Edit" opens a bottom sheet with:
- Bank picker (18 Nigerian banks, dropdown)
- Account number input (10 digits, numeric-only input mask)
- Cancel + Save buttons

Client-side validation:
- Both fields required
- Account number must be exactly 10 digits

Server-side validation matches the client, plus role check (runner or admin only). Idempotent — safe to save any number of times.

## Backward compatibility

Runners who have already been using the payout flow will have their bank details **retroactively populated** the next time they request a payout, because the modified `request-payout` route now also writes to `runner_profiles`.

But for the pilot, the cleanest approach is:

1. Ship this bundle.
2. Message the allowlisted runners: *"open the app, go to Profile → Payout account, tap Add bank, save your details. This unlocks runner-funded orders for you."*
3. They save once. They're set forever.

## Smoke test

1. As a runner, open `/runner-profile`.
2. You should see the "Payout account" card. If your bank was previously set (via a payout request), it should show. If not, it shows "Not set".
3. Tap "Add bank" (or "Edit"). Sheet opens.
4. Pick a bank, enter 10 digits, tap Save.
5. Sheet closes. Card now shows the bank + masked account number.
6. Check DB: `SELECT bank_name, account_number FROM runner_profiles WHERE user_id = 'your-runner-id';` → should show what you just saved.
7. Now try accepting a runner-funded order. Should work.
8. Try entering fewer than 10 digits, hit Save. Should show "Account number must be 10 digits" without touching the DB.
