# Testing the sync migration on plain PostgreSQL

`supabase_shim.sql` recreates the bits of Supabase the migration relies on (`auth.uid()` from JWT claims, `anon`/`authenticated` roles, `storage` tables).

```bash
# start a throwaway server (any PostgreSQL 14+), then:
createdb mf
psql -d mf -f supabase/tests/supabase_shim.sql
psql -d mf -f supabase/migrations/20261126000000_sync.sql      # run twice to prove it is re-runnable
psql -d mf -v ON_ERROR_STOP=1 -f supabase/tests/security_test.sql   # 20 security checks (RLS, LWW, tombstones, storage)
PG_SOCKET=/path/to/socket/dir npx vitest run src/__tests__/sync.postgres.test.ts   # app sync engine ↔ this database
```
