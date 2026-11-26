# Reference relational schema (not used by the app)

These files describe MyFinance's data model as normalised Postgres tables (useful for reporting / BI).
The app **does not** use them: it syncs through `supabase/migrations/20261126000000_sync.sql`
(a document table that preserves IDs, relationships and app schema versions exactly).
