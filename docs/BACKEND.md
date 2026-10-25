# Backend runbook

The game runs on one free Supabase project. Google is the only way to sign in.

## What lives where

- Schema, rules and match functions: `supabase/migrations/20261025000000_init.sql`.
- Client settings: `config.js` holds the project URL and the publishable key. Both are public by design.
- Never in the repo: the database password, the `service_role` / secret key, the Google client secret.

## Free plan limits that matter here

- 500 MB database. A round is one small row per player, so this holds millions of rounds.
- The project pauses after about a week with no traffic. Restore it from the Supabase dashboard
  (project, then Restore). Data is kept.
- No automatic backups. For a backup: `npx supabase db dump --db-url "<connection string>" -f backup.sql`,
  and keep the file somewhere safe, never in this repo.

## Changing the schema

1. Add a new migration file in `supabase/migrations/`.
2. Every new table: RLS on, policies, and explicit grants to `authenticated` only.
3. Run `tests/rls-test.sql` (it rolls back) and the security and performance advisors.

## Known limits

- Chat has no rate limit beyond the 500 character cap per message.
- The profile summary that other players see (`profiles.fingerprint`) is written by the player's own
  browser, so a determined player could fake it. It is cosmetic and never used for scoring.
- A player who leaves the queue page without pressing "Stop looking" leaves a waiting seat. Nobody is
  paired with it, because seats silent for 25 seconds are skipped.
