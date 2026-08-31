-- ============================================================
-- pgTAP: support.technical_order_tickets
-- ============================================================
-- Covers migration 20260830000111_technical_order_tickets_view.sql
-- (REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1.1..1.3 and
--  REQ-DB-TECHNICAL-ORDER-TICKETS-RLS-1.1..1.2).
--
--   S1  Admin sees exactly the linked tickets for a seeded order
--       (fail-loud on missing GRANTs per Risk 1 — non-empty assertion).
--   S2  Non-existent order_id returns empty set.
--   S3  Orphan ticket (NULL technical_order_item_id) appears with
--       technical_order_id = NULL (LEFT JOIN semantics preserved).
--   S4  Cross-order isolation: order1 filter returns only order1 tickets.
--
-- RLS scope documentation:
--   Admin role (authenticated + admin JWT claims) sees all tickets.
--   SECURITY INVOKER: no DEFINER escalation. Admin's SELECT grant on
--   public.technical_order_items + support.tickets governs the JOIN.
--   Installer callers are excluded by support.tickets RLS (assigned_to_staff_id
--   filter) — no separate RLS policy is added for this view.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Fixtures
-- ============================================================
DO $$
DECLARE
  v_admin_auth  uuid := '99999999-9999-9999-9999-999999999901';
  v_adm_id      uuid;   -- administrations.id
  v_bld_id      uuid;
  v_staff_id    uuid;
  v_order_1     uuid;
  v_order_2     uuid;
  v_item_1a     uuid;
  v_item_1b     uuid;
  v_item_2a     uuid;
  v_tk_1a       uuid;
  v_tk_1b       uuid;
  v_tk_2a       uuid;
  v_tk_orphan   uuid;
BEGIN
  -- auth user (admin role)
  INSERT INTO auth.users (id) VALUES (v_admin_auth);

  INSERT INTO public.administrations (company_name, address)
    VALUES ('Test 126 Admin Corp', 'Av. Test 200')
    RETURNING id INTO v_adm_id;

  INSERT INTO public.buildings (name, address, city, administration_id)
    VALUES ('Test 126 Building', 'Calle 10', 'CABA', v_adm_id)
    RETURNING id INTO v_bld_id;

  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_admin_auth, 'Test 126 Staff Member', 'admin', 'active')
    RETURNING id INTO v_staff_id;

  -- Order 1 with two items and two tickets
  INSERT INTO public.technical_orders (order_number, status, administration_id, client_type)
    VALUES ('ORD-TEC-126-1', 'confirmed', v_adm_id, 'administration')
    RETURNING id INTO v_order_1;

  INSERT INTO public.technical_order_items (order_id, item_type, description, unit_price, status, quantity, building_id)
    VALUES (v_order_1, 'installation', 'Item 126-1A', 100.00, 'pending', 1, v_bld_id)
    RETURNING id INTO v_item_1a;

  INSERT INTO public.technical_order_items (order_id, item_type, description, unit_price, status, quantity, building_id)
    VALUES (v_order_1, 'maintenance', 'Item 126-1B', 50.00, 'pending', 1, v_bld_id)
    RETURNING id INTO v_item_1b;

  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id, technical_order_item_id)
    VALUES (v_adm_id, v_bld_id, 'maintenance', 'Ticket 126-1A', 'open', v_staff_id, v_item_1a)
    RETURNING id INTO v_tk_1a;

  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id, technical_order_item_id)
    VALUES (v_adm_id, v_bld_id, 'maintenance', 'Ticket 126-1B', 'in_progress', v_staff_id, v_item_1b)
    RETURNING id INTO v_tk_1b;

  -- Order 2 with one item and one ticket (isolation check)
  INSERT INTO public.technical_orders (order_number, status, administration_id, client_type)
    VALUES ('ORD-TEC-126-2', 'confirmed', v_adm_id, 'administration')
    RETURNING id INTO v_order_2;

  INSERT INTO public.technical_order_items (order_id, item_type, description, unit_price, status, quantity, building_id)
    VALUES (v_order_2, 'installation', 'Item 126-2A', 75.00, 'pending', 1, v_bld_id)
    RETURNING id INTO v_item_2a;

  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id, technical_order_item_id)
    VALUES (v_adm_id, v_bld_id, 'maintenance', 'Ticket 126-2A', 'open', v_staff_id, v_item_2a)
    RETURNING id INTO v_tk_2a;

  -- Orphan ticket (no technical_order_item_id)
  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id)
    VALUES (v_adm_id, v_bld_id, 'maintenance', 'Orphan Ticket 126', 'open', v_staff_id)
    RETURNING id INTO v_tk_orphan;

  -- Temp table readable by authenticated role
  CREATE TEMP TABLE _t126 (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
  INSERT INTO _t126 VALUES
    ('admin_auth',  v_admin_auth),
    ('order_1',     v_order_1),
    ('order_2',     v_order_2),
    ('tk_1a',       v_tk_1a),
    ('tk_1b',       v_tk_1b),
    ('tk_2a',       v_tk_2a),
    ('tk_orphan',   v_tk_orphan);
  GRANT SELECT ON _t126 TO authenticated;
END $$;

-- ============================================================
-- S1: Admin sees exactly the linked tickets for a seeded order
--     (fail-loud, non-empty assertion per Risk 1 — guards against
--      silent empty-set from missing GRANTs on public.technical_order_items)
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_auth uuid := (SELECT v FROM _t126 WHERE k = 'admin_auth');
      v_order_1    uuid := (SELECT v FROM _t126 WHERE k = 'order_1');
      v_tk_1a      uuid := (SELECT v FROM _t126 WHERE k = 'tk_1a');
      v_tk_1b      uuid := (SELECT v FROM _t126 WHERE k = 'tk_1b');
      v_count      int;
      v_toid_count int;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_auth::text, 'role', 'admin')::text, true);

      SELECT count(*) INTO v_count
        FROM support.technical_order_tickets
       WHERE technical_order_id = v_order_1
         AND id IN (v_tk_1a, v_tk_1b);

      -- Fail-loud: must be non-empty (Risk 1 guard — missing GRANT returns 0, not error)
      ASSERT v_count = 2,
        'FAIL 126-S1: expected 2 rows for order_1, got ' || v_count ||
        '. Check GRANT SELECT on public.technical_order_items TO authenticated.';

      -- technical_order_id column must equal order_1 for both rows
      SELECT count(*) INTO v_toid_count
        FROM support.technical_order_tickets
       WHERE technical_order_id = v_order_1
         AND id IN (v_tk_1a, v_tk_1b)
         AND technical_order_id IS NOT NULL;

      ASSERT v_toid_count = 2,
        'FAIL 126-S1: technical_order_id column not populated correctly, got ' || v_toid_count;
    END $$;
  $q$,
  'PASS 126-S1: admin sees exactly the linked tickets for a seeded order (non-empty, GRANT guard)'
);

-- ============================================================
-- S2: Non-existent order_id returns empty set
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_auth uuid := (SELECT v FROM _t126 WHERE k = 'admin_auth');
      v_count      int;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_auth::text, 'role', 'admin')::text, true);

      SELECT count(*) INTO v_count
        FROM support.technical_order_tickets
       WHERE technical_order_id = '00000000-0000-0000-0000-000000000000'::uuid;

      ASSERT v_count = 0,
        'FAIL 126-S2: expected 0 rows for non-existent order, got ' || v_count;
    END $$;
  $q$,
  'PASS 126-S2: non-existent order_id returns empty set without error'
);

-- ============================================================
-- S3: Orphan ticket (NULL technical_order_item_id) appears in
--     an unfiltered query with technical_order_id = NULL
--     (LEFT JOIN semantics preserved)
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_auth uuid := (SELECT v FROM _t126 WHERE k = 'admin_auth');
      v_tk_orphan  uuid := (SELECT v FROM _t126 WHERE k = 'tk_orphan');
      v_toid       uuid;
      v_found      int;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_auth::text, 'role', 'admin')::text, true);

      SELECT count(*) INTO v_found
        FROM support.technical_order_tickets
       WHERE id = v_tk_orphan;

      ASSERT v_found = 1,
        'FAIL 126-S3: orphan ticket not present in view, got ' || v_found;

      SELECT technical_order_id INTO v_toid
        FROM support.technical_order_tickets
       WHERE id = v_tk_orphan;

      ASSERT v_toid IS NULL,
        'FAIL 126-S3: orphan ticket technical_order_id should be NULL, got ' || v_toid::text;
    END $$;
  $q$,
  'PASS 126-S3: orphan ticket appears with technical_order_id = NULL (LEFT JOIN preserved)'
);

-- ============================================================
-- S4: Cross-order isolation — filtering on order_1 returns only
--     order_1 tickets; order_2 tickets are excluded
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_auth uuid := (SELECT v FROM _t126 WHERE k = 'admin_auth');
      v_order_1    uuid := (SELECT v FROM _t126 WHERE k = 'order_1');
      v_tk_2a      uuid := (SELECT v FROM _t126 WHERE k = 'tk_2a');
      v_order1_count   int;
      v_order2_leaked  int;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_auth::text, 'role', 'admin')::text, true);

      SELECT count(*) INTO v_order1_count
        FROM support.technical_order_tickets
       WHERE technical_order_id = v_order_1;

      ASSERT v_order1_count = 2,
        'FAIL 126-S4: expected 2 rows for order_1, got ' || v_order1_count;

      -- order_2 ticket must not appear in an order_1 filter
      SELECT count(*) INTO v_order2_leaked
        FROM support.technical_order_tickets
       WHERE technical_order_id = v_order_1
         AND id = v_tk_2a;

      ASSERT v_order2_leaked = 0,
        'FAIL 126-S4: order_2 ticket leaked into order_1 result set';
    END $$;
  $q$,
  'PASS 126-S4: cross-order isolation — order_1 filter returns only order_1 tickets'
);

SELECT * FROM finish();
ROLLBACK;
