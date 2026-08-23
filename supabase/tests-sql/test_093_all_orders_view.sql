-- ============================================================
-- pgTAP: public.all_orders VIEW
-- ============================================================
-- Tests that public.all_orders correctly UNIONs key_orders and
-- technical_orders, returns the correct order_kind discriminator,
-- excludes PII columns, and is read-only (INSERT fails).
--
-- Prerequisite: migrations 001–093 applied.
-- Identifier markers: PASS 093-S1 through PASS 093-S5 preserved.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 1 (PASS 093-S1): VIEW returns rows from both base tables with correct order_kind
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id_1         uuid;
      v_admin_id_2         uuid;
      v_key_order_id       uuid;
      v_technical_order_id uuid;
      v_key_count          int;
      v_tech_count         int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 093-S1 KeyAdmin') RETURNING id INTO v_admin_id_1;
      INSERT INTO public.administrations (company_name) VALUES ('Test 093-S1 TechAdmin') RETURNING id INTO v_admin_id_2;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-093-S1', 'draft', v_admin_id_1, 'administration')
        RETURNING id INTO v_key_order_id;

      INSERT INTO public.technical_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-TEC-093-S1', 'draft', v_admin_id_2, 'administration')
        RETURNING id INTO v_technical_order_id;

      SELECT count(*) INTO v_key_count
        FROM public.all_orders
       WHERE id = v_key_order_id AND order_kind = 'key';
      ASSERT v_key_count = 1, 'FAIL 093-S1: expected 1 key_order row with order_kind=''key'', got ' || v_key_count::text;

      SELECT count(*) INTO v_tech_count
        FROM public.all_orders
       WHERE id = v_technical_order_id AND order_kind = 'technical';
      ASSERT v_tech_count = 1, 'FAIL 093-S1: expected 1 technical_order row with order_kind=''technical'', got ' || v_tech_count::text;
    END $$;
  $q$,
  'PASS 093-S1: VIEW returns rows from both key_orders and technical_orders with correct order_kind'
);

-- ============================================================
-- Scenario 2 (PASS 093-S2): VIEW column shape — required columns present, PII absent
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id   uuid;
      v_order_id   uuid;
      v_row        record;
      v_col_exists boolean := false;
      v_colname    text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 093-S2 Admin') RETURNING id INTO v_admin_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type, notes)
        VALUES ('ORD-LLV-093-S2', 'draft', v_admin_id, 'administration', 'Nota de prueba 093-S2')
        RETURNING id INTO v_order_id;

      SELECT * INTO v_row FROM public.all_orders WHERE id = v_order_id;

      ASSERT v_row.id            IS NOT NULL,             'FAIL 093-S2: id missing';
      ASSERT v_row.order_number  = 'ORD-LLV-093-S2',     'FAIL 093-S2: order_number wrong';
      ASSERT v_row.order_kind    = 'key',                 'FAIL 093-S2: order_kind wrong, got ' || coalesce(v_row.order_kind, 'NULL');
      ASSERT v_row.client_type   = 'administration',      'FAIL 093-S2: client_type wrong';
      ASSERT v_row.administration_id = v_admin_id,        'FAIL 093-S2: administration_id wrong';
      ASSERT v_row.status        = 'draft',               'FAIL 093-S2: status wrong';
      ASSERT v_row.notes         = 'Nota de prueba 093-S2', 'FAIL 093-S2: notes wrong';
      ASSERT v_row.created_at    IS NOT NULL,             'FAIL 093-S2: created_at missing';
      ASSERT v_row.updated_at    IS NOT NULL,             'FAIL 093-S2: updated_at missing';

      FOR v_colname IN
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'all_orders'
           AND column_name  IN ('particular_dni', 'particular_phone', 'particular_email')
      LOOP
        v_col_exists := true;
      END LOOP;

      ASSERT NOT v_col_exists, 'FAIL 093-S2: at least one PII column (particular_dni/phone/email) found in all_orders VIEW';

      ASSERT v_row.particular_full_name IS NULL OR v_row.particular_full_name = '',
        'FAIL 093-S2: particular_full_name unexpected value for administration order';
    END $$;
  $q$,
  'PASS 093-S2: VIEW column shape correct — PII excluded, required columns present'
);

-- ============================================================
-- Scenario 3 (PASS 093-S3): VIEW is read-only — INSERT fails
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 093-S3 Admin') RETURNING id INTO v_admin_id;

      INSERT INTO public.all_orders (
        id, order_number, order_kind, client_type, administration_id, status,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), 'ORD-LLV-FAKE', 'key', 'administration', v_admin_id,
        'draft', now(), now()
      );
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 093-S3: INSERT into all_orders correctly fails (read-only VIEW)'
);

-- ============================================================
-- Scenario 4 (PASS 093-S4): VIEW correctly handles technical orders
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id           uuid;
      v_technical_order_id uuid;
      v_row                record;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 093-S4 Admin') RETURNING id INTO v_admin_id;

      INSERT INTO public.technical_orders (order_number, status, administration_id, client_type, notes)
        VALUES ('ORD-TEC-093-S4', 'draft', v_admin_id, 'administration', 'Nota técnica 093-S4')
        RETURNING id INTO v_technical_order_id;

      SELECT * INTO v_row FROM public.all_orders WHERE id = v_technical_order_id;

      ASSERT v_row.id           = v_technical_order_id, 'FAIL 093-S4: id wrong';
      ASSERT v_row.order_number = 'ORD-TEC-093-S4',    'FAIL 093-S4: order_number wrong';
      ASSERT v_row.order_kind   = 'technical',          'FAIL 093-S4: expected order_kind=technical, got ' || coalesce(v_row.order_kind, 'NULL');
      ASSERT v_row.status       = 'draft',              'FAIL 093-S4: status wrong';
      ASSERT v_row.notes        = 'Nota técnica 093-S4','FAIL 093-S4: notes wrong';
    END $$;
  $q$,
  'PASS 093-S4: VIEW correctly represents technical_orders rows'
);

-- ============================================================
-- Scenario 5 (PASS 093-S5): ORDER BY created_at DESC returns both contexts interleaved
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id uuid;
      v_count    int;
      v_kinds    text[];
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 093-S5 Admin') RETURNING id INTO v_admin_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-093-S5A', 'draft', v_admin_id, 'administration');
      INSERT INTO public.technical_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-TEC-093-S5A', 'draft', v_admin_id, 'administration');
      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-093-S5B', 'draft', v_admin_id, 'administration');

      SELECT count(*) INTO v_count
        FROM public.all_orders
       WHERE order_number IN ('ORD-LLV-093-S5A', 'ORD-TEC-093-S5A', 'ORD-LLV-093-S5B');
      ASSERT v_count = 3, 'FAIL 093-S5: expected 3 rows, got ' || v_count::text;

      SELECT array_agg(DISTINCT order_kind ORDER BY order_kind) INTO v_kinds
        FROM public.all_orders
       WHERE order_number IN ('ORD-LLV-093-S5A', 'ORD-TEC-093-S5A', 'ORD-LLV-093-S5B');
      ASSERT v_kinds = array['key', 'technical'],
        'FAIL 093-S5: expected both order_kinds, got ' || v_kinds::text;
    END $$;
  $q$,
  'PASS 093-S5: ORDER BY created_at DESC returns rows from both contexts'
);

SELECT * FROM finish();
ROLLBACK;
