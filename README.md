# Runner-Funded — Allowlist API Fix

Bug in the original runner-funded bundle: the allowlist admin page (`/admin/runner-funded`) did **client-side database writes** against `runner_funded_allowlist`. With Supabase Row-Level Security enabled (its default for new tables), those writes silently failed — no error surfaced to the user, no row created in the database.

Every other admin action in your codebase routes through an API endpoint that uses `createAdminClient()` (service role, bypasses RLS). I built the runner-transfers admin correctly this way. Forgot to do the same for the allowlist. My mistake.

## What this bundle contains

**2 files:**

| Path | Change |
|---|---|
| `app/api/admin/runner-funded/route.ts` | **NEW** — GET (list allowlist + candidates) + POST (add/remove via `{ action, runner_id, note? }`). Admin-gated, uses `createAdminClient()` for the writes. |
| `app/admin/runner-funded/page.tsx` | **MODIFIED** — no more client-side `supabase.from(...).insert(...)`. Load + add + remove all route through the API. Errors from the API now surface as alerts instead of silently failing. |

## Install

Overlay these 2 files. No migration needed. Restart. `npx tsc --noEmit` clean.

## Verify the fix

1. Open `/admin/runner-funded`.
2. Tap **+ Add runner to allowlist**.
3. Pick a runner.
4. Tap **Add to allowlist**.
5. Sheet closes, runner appears in the list.
6. Confirm in the DB:

   ```sql
   SELECT runner_id, added_at, note
   FROM runner_funded_allowlist;
   ```

   You should see the row now.

7. That runner can now accept runner-funded orders.

If a runner was already saved (nothing there in the DB from earlier attempts to add), just re-add them through the fixed UI.

## Why this happened

I wrote the runner-transfers admin page correctly (via `/api/admin/runner-transfers`). For the allowlist page I went "it's simpler, I'll just do it client-side" and skipped the API layer. The client-side call would have worked if I'd disabled RLS on the table in the migration, but that's the wrong fix — leaving RLS off on any table with sensitive data is a footgun even if it's admin-facing. The right fix is the API route, which is now here.

Lesson for the codebase: **every admin write goes through an API endpoint**. The `/api/admin/*` pattern isn't a suggestion.
