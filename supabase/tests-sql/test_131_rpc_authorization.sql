-- ============================================================
-- pgTAP: authorization guards on SECURITY DEFINER RPCs (P0-2 / P0-5)
-- ============================================================
-- Migration 20260910110000 wrapped 22 business RPCs so that:
--   - anon (no staff row)            -> 42501 insufficient_privilege
--   - installer on admin-only RPCs   -> 42501
--   - installer on staff RPCs        -> passes the guard
--   - inactive admin                 -> 42501 (is_admin requires status=active)
--   - admin                          -> passes the guard
--   - no client API role (postgres)  -> guard is bypassed (fixtures, migrations,
--                                       seeds, pg_cron keep working)
--
-- "Passes the guard" is proven by calling with a nonexistent id and asserting
-- the failure is a business error (P0001 etc.), NOT 42501 — the guard runs
-- first, so any other error means the caller got through it.
-- ============================================================

BEGIN;
SELECT plan(7);

DO $$
DECLARE
  v_admin_auth_id    uuid := '13111311-1311-1311-1311-131113111311';
  v_inactive_auth_id uuid := '13121312-1312-1312-1312-131213121312';
  v_inst_auth_id     uuid := '13131313-1313-1313-1313-131313131313';
  v_org_id      uuid;
  v_building_id uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_admin_auth_id), (v_inactive_auth_id), (v_inst_auth_id);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status) VALUES
    (v_admin_auth_id,    'Test 131 Admin',          'admin',     'active'),
    (v_inactive_auth_id, 'Test 131 Inactive Admin', 'admin',     'inactive'),
    (v_inst_auth_id,     'Test 131 Installer',      'installer', 'active');

  INSERT INTO public.administrations (company_name) VALUES ('Test 131 Client') RETURNING id INTO v_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 131 Building', 'Calle 131', v_org_id) RETURNING id INTO v_building_id;

  -- Seeded as postgres (no client API role) — this call itself proves the
  -- guard bypass for non-API contexts; if it raised, the DO block would fail.
  PERFORM public.create_key_order_with_items(
    jsonb_build_object('client_type', 'administration', 'administration_id', v_org_id),
    ARRAY[jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)]::jsonb[],
    false
  );
END $$;

-- S1: postgres (no SET ROLE) bypassed the guard in the fixture above.
SELECT ok(
  (SELECT count(*) FROM public.key_orders ko JOIN public.administrations a ON a.id = ko.administration_id
     WHERE a.company_name = 'Test 131 Client') = 1,
  'PASS 131-S1: non-API context (postgres) bypasses the guard and can seed via RPC'
);

-- S2: anon calling an admin-only RPC -> 42501.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE v_state text := 'none';
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{}';
      BEGIN
        PERFORM public.cancel_key_order('00000000-0000-0000-0000-000000000001');
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      ASSERT v_state = '42501', 'FAIL 131-S2: anon on cancel_key_order should be 42501, got ' || v_state;
    END $$;
  $q$,
  'PASS 131-S2: anon is rejected on an admin-only RPC with insufficient_privilege'
);

-- S3: anon calling a staff RPC -> 42501 (no staff row at all).
SELECT lives_ok(
  $q$
    DO $$
    DECLARE v_state text := 'none';
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{}';
      BEGIN
        PERFORM public.resolve_ticket('00000000-0000-0000-0000-000000000001');
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      ASSERT v_state = '42501', 'FAIL 131-S3: anon on resolve_ticket should be 42501, got ' || v_state;
    END $$;
  $q$,
  'PASS 131-S3: anon is rejected on a staff RPC with insufficient_privilege'
);

-- S4: installer on an admin-only RPC -> 42501.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE v_state text := 'none';
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13131313-1313-1313-1313-131313131313"}';
      BEGIN
        PERFORM public.confirm_key_order('00000000-0000-0000-0000-000000000001');
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      ASSERT v_state = '42501', 'FAIL 131-S4: installer on confirm_key_order should be 42501, got ' || v_state;
    END $$;
  $q$,
  'PASS 131-S4: installer is rejected on an admin-only RPC'
);

-- S5: installer on a staff RPC passes the guard (fails later on business rules).
SELECT lives_ok(
  $q$
    DO $$
    DECLARE v_state text := 'none';
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13131313-1313-1313-1313-131313131313"}';
      BEGIN
        PERFORM public.resolve_ticket('00000000-0000-0000-0000-000000000001');
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      ASSERT v_state <> '42501', 'FAIL 131-S5: installer on resolve_ticket must pass the guard, got 42501';
      ASSERT v_state <> 'none',  'FAIL 131-S5: expected a business error for a nonexistent ticket';
    END $$;
  $q$,
  'PASS 131-S5: installer passes the guard on a staff RPC (rejected only by business rules)'
);

-- S6: inactive admin -> 42501.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE v_state text := 'none';
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13121312-1312-1312-1312-131213121312"}';
      BEGIN
        PERFORM public.cancel_key_order('00000000-0000-0000-0000-000000000001');
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      ASSERT v_state = '42501', 'FAIL 131-S6: inactive admin should be 42501, got ' || v_state;
    END $$;
  $q$,
  'PASS 131-S6: an inactive admin is rejected'
);

-- S7: active admin passes the guard and actually cancels the seeded draft order.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_order_id uuid;
      v_status   text;
    BEGIN
      SELECT ko.id INTO v_order_id FROM public.key_orders ko
        JOIN public.administrations a ON a.id = ko.administration_id
       WHERE a.company_name = 'Test 131 Client';
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13111311-1311-1311-1311-131113111311"}';
      PERFORM public.cancel_key_order(v_order_id);
      SELECT status INTO v_status FROM public.key_orders WHERE id = v_order_id;
      RESET role;
      ASSERT v_status = 'cancelled', 'FAIL 131-S7: admin cancel should leave status=cancelled, got ' || coalesce(v_status, 'null');
    END $$;
  $q$,
  'PASS 131-S7: active admin passes the guard and cancels the order'
);

SELECT * FROM finish();
ROLLBACK;
