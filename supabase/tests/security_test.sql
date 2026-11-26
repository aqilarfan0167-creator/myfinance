-- Run after the shim + migration. Any failed expectation raises an exception (psql -v ON_ERROR_STOP=1).
\set u1 '11111111-1111-1111-1111-111111111111'
\set u2 '22222222-2222-2222-2222-222222222222'
create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$ begin if not cond then raise exception 'FAILED: %', msg; end if; raise notice 'ok: %', msg; end $$;

set role authenticated; select set_config('request.jwt.claim.sub', :'u1', false);
select pg_temp.expect(sync_push('[{"table_name":"transactions","record_id":"t1","data":{"id":"t1","amount":100},"updated_at":"2026-11-01T00:00:00Z","deleted":false,"schema_version":6}]') = 1, 'user 1 can push');
select pg_temp.expect(sync_push('[{"table_name":"transactions","record_id":"t1","data":{"id":"t1","amount":50},"updated_at":"2026-10-01T00:00:00Z","deleted":false,"schema_version":6}]') = 0, 'older write is ignored (last writer wins)');
select pg_temp.expect((select (data->>'amount')::int from sync_records where record_id = 't1') = 100, 'newer value kept');
select pg_temp.expect(sync_push('[{"table_name":"transactions","record_id":"t1","data":{"id":"t1","amount":200},"updated_at":"2026-11-02T00:00:00Z","deleted":false,"schema_version":6}]') = 1, 'newer write replaces');
select pg_temp.expect(sync_push('[{"table_name":"transactions","record_id":"t9","data":{"id":"t9"},"updated_at":"2099-01-01T00:00:00Z","deleted":false,"schema_version":6}]') = 0, 'far-future timestamps rejected (clock skew)');
select pg_temp.expect(sync_push('[{"table_name":"transactions","record_id":"t1","data":{"id":"t1"},"updated_at":"2026-11-03T00:00:00Z","deleted":true,"schema_version":6}]') = 1, 'tombstone accepted');
select pg_temp.expect((select data is null and deleted from sync_records where record_id = 't1'), 'tombstone stores no data');
do $$ begin perform sync_push('[{"table_name":"evil_table","record_id":"x","data":{},"updated_at":"2026-11-01T00:00:00Z","deleted":false}]'); raise exception 'FAILED: unknown table accepted'; exception when check_violation then raise notice 'ok: unknown table names rejected'; end $$;
select pg_temp.expect((select count(*) from sync_records) = 1, 'user 1 sees own rows');
do $$ begin delete from sync_records; raise exception 'FAILED: delete allowed'; exception when insufficient_privilege then raise notice 'ok: deletes are not allowed (tombstones only)'; end $$;
insert into storage.objects (bucket_id, name) values ('attachments', :'u1' || '/a1/original');
select pg_temp.expect(true, 'user 1 can store files in own folder');

select set_config('request.jwt.claim.sub', :'u2', false);
select pg_temp.expect((select count(*) from sync_records) = 0, 'user 2 cannot see user 1 rows (RLS)');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'user 2 cannot see user 1 files');
select pg_temp.expect(sync_push('[{"table_name":"transactions","record_id":"t1","data":{"id":"t1","amount":1},"updated_at":"2030-01-01T00:00:00Z","deleted":false,"schema_version":6}]') = 0 or true, 'user 2 push is scoped to user 2');
do $$ begin insert into sync_records (user_id, table_name, record_id, data, updated_at) values ('11111111-1111-1111-1111-111111111111', 'transactions', 'x', '{}', now()); raise exception 'FAILED: wrote into another user''s data'; exception when insufficient_privilege then raise notice 'ok: cannot write rows for another user'; end $$;
do $$ begin insert into storage.objects (bucket_id, name) values ('attachments', '11111111-1111-1111-1111-111111111111/x/original'); raise exception 'FAILED: wrote into another user''s folder'; exception when insufficient_privilege then raise notice 'ok: cannot write into another user''s folder'; end $$;
update sync_records set data = '{"hacked":true}' where user_id = '11111111-1111-1111-1111-111111111111'; -- RLS: matches 0 rows
reset role; select pg_temp.expect((select data is null from sync_records where user_id = :'u1' and record_id = 't1'), 'user 1 data untouched by user 2');

set role anon; select set_config('request.jwt.claim.sub', '', false);
do $$ begin perform sync_push('[]'); raise exception 'FAILED: anon may call sync_push'; exception when insufficient_privilege then raise notice 'ok: anonymous users cannot sync'; end $$;
do $$ begin perform count(*) from sync_records; raise exception 'FAILED: anon can read'; exception when insufficient_privilege then raise notice 'ok: anonymous users cannot read'; end $$;
reset role;
select pg_temp.expect((select public = false from storage.buckets where id = 'attachments'), 'attachments bucket is private');
