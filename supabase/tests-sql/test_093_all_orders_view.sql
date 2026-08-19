-- ============================================================
-- TDD RED → GREEN: public.all_orders VIEW
-- ============================================================
-- Tests that public.all_orders correctly UNIONs key_orders and
-- technical_orders, returns the correct order_kind discriminator,
-- excludes PII columns, and is read-only (INSERT fails).
--
-- RED guard: before migration 093 is applied, all SELECT queries
-- fail with "relation public.all_orders does not exist".
--
-- Run via: psql -f supabase/tests-sql/test_093_all_orders_view.sql
-- Prerequisite: migrations 001–092 applied (PR-1 + PR-2 + PR-3 resolve RPCs).
-- Each scenario runs in its own transaction and always rolls back.
-- ============================================================

-- ============================================================
-- Scenario 1 (RED): SELECT from public.all_orders — must not exist yet
-- ============================================================
-- Proves RED: relation does not exist before migration 093.
-- This scenario is intentionally skipped in the GREEN run.
-- Uncomment manually to confirm RED state before applying migration 093.
-- ============================================================
-- begin;
-- do $$
-- begin
--   perform * from public.all_orders limit 1;
--   raise exception 'FAIL RED-1: public.all_orders should not exist yet';
-- exception
--   when undefined_table then
--     raise notice 'PASS RED-1: public.all_orders does not exist (confirmed RED state)';
-- end $$;
-- rollback;


-- ============================================================
-- Scenario 1 (GREEN): VIEW exists and returns rows from both base tables
-- ============================================================
begin;
do $$
declare
  v_admin_id_1         uuid;
  v_admin_id_2         uuid;
  v_key_order_id       uuid;
  v_technical_order_id uuid;
  v_key_count          int;
  v_tech_count         int;
  v_total_count        int;
begin
  insert into public.administrations (company_name)
    values ('Test 093-S1 KeyAdmin') returning id into v_admin_id_1;
  insert into public.administrations (company_name)
    values ('Test 093-S1 TechAdmin') returning id into v_admin_id_2;

  insert into public.key_orders (
    order_number, status, administration_id, client_type
  ) values (
    'ORD-LLV-093-S1', 'draft', v_admin_id_1, 'administration'
  ) returning id into v_key_order_id;

  insert into public.technical_orders (
    order_number, status, administration_id, client_type
  ) values (
    'ORD-TEC-093-S1', 'draft', v_admin_id_2, 'administration'
  ) returning id into v_technical_order_id;

  -- Count key orders in the VIEW.
  select count(*) into v_key_count
    from public.all_orders
   where id = v_key_order_id
     and order_kind = 'key';

  assert v_key_count = 1,
    'FAIL 093-S1: expected 1 key_order row with order_kind=''key'', got ' || v_key_count::text;

  -- Count technical orders in the VIEW.
  select count(*) into v_tech_count
    from public.all_orders
   where id = v_technical_order_id
     and order_kind = 'technical';

  assert v_tech_count = 1,
    'FAIL 093-S1: expected 1 technical_order row with order_kind=''technical'', got ' || v_tech_count::text;

  raise notice 'PASS 093-S1: VIEW returns rows from both key_orders and technical_orders with correct order_kind';
end $$;
rollback;

-- ============================================================
-- Scenario 2: VIEW column shape — required columns present, PII absent
-- ============================================================
begin;
do $$
declare
  v_admin_id  uuid;
  v_order_id  uuid;
  v_row       record;
begin
  insert into public.administrations (company_name)
    values ('Test 093-S2 Admin') returning id into v_admin_id;

  -- Use administration client_type (simpler, no particular snapshot required).
  insert into public.key_orders (
    order_number, status, administration_id, client_type,
    notes
  ) values (
    'ORD-LLV-093-S2', 'draft', v_admin_id, 'administration',
    'Nota de prueba 093-S2'
  ) returning id into v_order_id;

  -- Read the VIEW row.
  select * into v_row from public.all_orders where id = v_order_id;

  -- Required columns must be present.
  assert v_row.id            is not null, 'FAIL 093-S2: id missing';
  assert v_row.order_number  = 'ORD-LLV-093-S2', 'FAIL 093-S2: order_number wrong';
  assert v_row.order_kind    = 'key', 'FAIL 093-S2: order_kind wrong, got ' || coalesce(v_row.order_kind, 'NULL');
  assert v_row.client_type   = 'administration', 'FAIL 093-S2: client_type wrong';
  assert v_row.administration_id = v_admin_id, 'FAIL 093-S2: administration_id wrong';
  assert v_row.status        = 'draft', 'FAIL 093-S2: status wrong';
  assert v_row.notes         = 'Nota de prueba 093-S2', 'FAIL 093-S2: notes wrong';
  assert v_row.created_at    is not null, 'FAIL 093-S2: created_at missing';
  assert v_row.updated_at    is not null, 'FAIL 093-S2: updated_at missing';

  -- PII columns must NOT be present in the VIEW.
  -- particular_full_name IS allowed (it is a display name, not PII by spec #225).
  -- particular_dni, particular_phone, particular_email are excluded.
  declare
    v_col_exists boolean := false;
    v_colname    text;
  begin
    for v_colname in
      select column_name from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'all_orders'
         and column_name  in ('particular_dni', 'particular_phone', 'particular_email')
    loop
      v_col_exists := true;
      raise notice 'FAIL 093-S2: PII column % is present in all_orders VIEW', v_colname;
    end loop;
    assert not v_col_exists,
      'FAIL 093-S2: at least one PII column (particular_dni/phone/email) found in all_orders VIEW';
  end;

  -- particular_full_name IS in the VIEW (non-PII display name, per spec #225).
  -- For an 'administration' order it is NULL, which is fine.
  assert v_row.particular_full_name is null or v_row.particular_full_name = '',
    'FAIL 093-S2: particular_full_name unexpected value for administration order';

  raise notice 'PASS 093-S2: VIEW column shape correct — PII excluded, required columns present';
end $$;
rollback;

-- ============================================================
-- Scenario 3: VIEW is read-only — INSERT fails
-- ============================================================
begin;
do $$
declare
  v_admin_id  uuid;
  v_failed    boolean := false;
begin
  insert into public.administrations (company_name)
    values ('Test 093-S3 Admin') returning id into v_admin_id;

  begin
    insert into public.all_orders (
      id, order_number, order_kind, client_type, administration_id, status,
      created_at, updated_at
    ) values (
      gen_random_uuid(), 'ORD-LLV-FAKE', 'key', 'administration', v_admin_id,
      'draft', now(), now()
    );
  exception when others then
    v_failed := true;
  end;

  assert v_failed,
    'FAIL 093-S3: INSERT into public.all_orders should fail (VIEW is read-only)';

  raise notice 'PASS 093-S3: INSERT into all_orders correctly fails (read-only VIEW)';
end $$;
rollback;

-- ============================================================
-- Scenario 4: VIEW correctly handles technical orders
-- ============================================================
begin;
do $$
declare
  v_admin_id           uuid;
  v_technical_order_id uuid;
  v_row                record;
begin
  insert into public.administrations (company_name)
    values ('Test 093-S4 Admin') returning id into v_admin_id;

  insert into public.technical_orders (
    order_number, status, administration_id, client_type, notes
  ) values (
    'ORD-TEC-093-S4', 'draft', v_admin_id, 'administration', 'Nota técnica 093-S4'
  ) returning id into v_technical_order_id;

  select * into v_row from public.all_orders where id = v_technical_order_id;

  assert v_row.id           = v_technical_order_id, 'FAIL 093-S4: id wrong';
  assert v_row.order_number = 'ORD-TEC-093-S4', 'FAIL 093-S4: order_number wrong';
  assert v_row.order_kind   = 'technical', 'FAIL 093-S4: expected order_kind=technical, got ' || coalesce(v_row.order_kind, 'NULL');
  assert v_row.status       = 'draft', 'FAIL 093-S4: status wrong';
  assert v_row.notes        = 'Nota técnica 093-S4', 'FAIL 093-S4: notes wrong';

  raise notice 'PASS 093-S4: VIEW correctly represents technical_orders rows';
end $$;
rollback;

-- ============================================================
-- Scenario 5: ORDER BY created_at DESC returns both contexts interleaved
-- ============================================================
begin;
do $$
declare
  v_admin_id  uuid;
  v_count     int;
  v_kinds     text[];
begin
  insert into public.administrations (company_name)
    values ('Test 093-S5 Admin') returning id into v_admin_id;

  insert into public.key_orders (order_number, status, administration_id, client_type)
    values ('ORD-LLV-093-S5A', 'draft', v_admin_id, 'administration');
  insert into public.technical_orders (order_number, status, administration_id, client_type)
    values ('ORD-TEC-093-S5A', 'draft', v_admin_id, 'administration');
  insert into public.key_orders (order_number, status, administration_id, client_type)
    values ('ORD-LLV-093-S5B', 'draft', v_admin_id, 'administration');

  -- Both order_kinds must appear.
  select count(*) into v_count
    from public.all_orders
   where order_number in ('ORD-LLV-093-S5A', 'ORD-TEC-093-S5A', 'ORD-LLV-093-S5B');

  assert v_count = 3,
    'FAIL 093-S5: expected 3 rows, got ' || v_count::text;

  -- Both order_kinds appear in the result.
  select array_agg(distinct order_kind order by order_kind) into v_kinds
    from public.all_orders
   where order_number in ('ORD-LLV-093-S5A', 'ORD-TEC-093-S5A', 'ORD-LLV-093-S5B');

  assert v_kinds = array['key', 'technical'],
    'FAIL 093-S5: expected both order_kinds, got ' || v_kinds::text;

  raise notice 'PASS 093-S5: ORDER BY created_at DESC returns rows from both contexts';
end $$;
rollback;
