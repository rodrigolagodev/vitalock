-- ============================================================
-- pgTAP: audit actor is derived server-side, never from the client (P0-4)
-- ============================================================
-- Before migration 20260910110000 every RPC accepted p_actor_staff_id from
-- the caller and wrote it straight into key_events / audit trails, so any
-- client could attribute an action to any staff member. The wrappers now pass
-- identity.current_staff_id() and ignore the client value.
--
-- Scenarios:
--   S1 an admin API session FORGES p_actor_staff_id as the installer -> admin recorded
--   S2 an admin API session omits the parameter                     -> admin recorded
--   S3 a trusted non-API context (postgres, no SET ROLE) passes an
--      explicit actor                                               -> honoured
-- S3 is what keeps fixture-seeded audit rows attributable and existing pgTAP
-- fixtures (e.g. test_resolve_ticket) meaningful.
-- ============================================================

BEGIN;
SELECT plan(3);

DO $$
DECLARE
  v_admin_auth_id uuid := '13211321-1321-1321-1321-132113211321';
  v_inst_auth_id  uuid := '13221322-1322-1322-1322-132213221322';
  v_org_id      uuid;
  v_building_id uuid;
  v_unit_id     uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_admin_auth_id), (v_inst_auth_id);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status) VALUES
    (v_admin_auth_id, 'Test 132 Admin',     'admin',     'active'),
    (v_inst_auth_id,  'Test 132 Installer', 'installer', 'active');

  INSERT INTO public.administrations (company_name) VALUES ('Test 132 Client') RETURNING id INTO v_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 132 Building', 'Calle 132', v_org_id) RETURNING id INTO v_building_id;
  INSERT INTO public.units (number, building_id) VALUES ('132A', v_building_id) RETURNING id INTO v_unit_id;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T132-KEY', v_unit_id, 'active');
END $$;

-- S1: forged actor is ignored; the session's staff id is recorded.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_key_id      uuid;
      v_admin_staff uuid;
      v_inst_staff  uuid;
      v_recorded    uuid;
    BEGIN
      SELECT id INTO v_key_id FROM public.rfid_keys WHERE rfid_code = 'T132-KEY';
      SELECT id INTO v_admin_staff FROM identity.staff WHERE full_name = 'Test 132 Admin';
      SELECT id INTO v_inst_staff  FROM identity.staff WHERE full_name = 'Test 132 Installer';

      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13211321-1321-1321-1321-132113211321"}';
      -- Admin session, but the client claims the installer did it.
      PERFORM public.change_key_status(v_key_id, 'disabled', 'forged actor test', v_inst_staff);
      RESET role;

      -- now() is frozen for the whole transaction, so occurred_at cannot order
      -- events; select by the note this scenario wrote instead.
      SELECT actor_staff_id INTO v_recorded FROM public.key_events
       WHERE key_id = v_key_id AND event_type = 'deactivated' AND note = 'forged actor test';

      ASSERT v_recorded IS NOT NULL, 'FAIL 132-S1: no actor recorded';
      ASSERT v_recorded = v_admin_staff,
        'FAIL 132-S1: expected admin ' || v_admin_staff::text || ' as actor, got ' || v_recorded::text;
      ASSERT v_recorded <> v_inst_staff, 'FAIL 132-S1: forged installer actor was accepted';
    END $$;
  $q$,
  'PASS 132-S1: change_key_status records the session actor and ignores the forged p_actor_staff_id'
);

-- S2: the deprecated parameter is still accepted (signature unchanged) — a
-- client that omits it gets the same server-derived actor.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_key_id      uuid;
      v_admin_staff uuid;
      v_recorded    uuid;
    BEGIN
      SELECT id INTO v_key_id FROM public.rfid_keys WHERE rfid_code = 'T132-KEY';
      SELECT id INTO v_admin_staff FROM identity.staff WHERE full_name = 'Test 132 Admin';

      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13211321-1321-1321-1321-132113211321"}';
      PERFORM public.change_key_status(v_key_id, 'active', 'reactivated by session');
      RESET role;

      SELECT actor_staff_id INTO v_recorded FROM public.key_events
       WHERE key_id = v_key_id AND event_type = 'activated' AND note = 'reactivated by session';
      ASSERT v_recorded = v_admin_staff, 'FAIL 132-S2: omitted actor should resolve to the session staff';
    END $$;
  $q$,
  'PASS 132-S2: omitting p_actor_staff_id yields the same server-derived actor'
);

-- S3: outside the API there is no session; an explicit actor is honoured.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_key_id     uuid;
      v_inst_staff uuid;
      v_recorded   uuid;
    BEGIN
      SELECT id INTO v_key_id FROM public.rfid_keys WHERE rfid_code = 'T132-KEY';
      SELECT id INTO v_inst_staff FROM identity.staff WHERE full_name = 'Test 132 Installer';

      -- No SET ROLE: this is a fixture/seed style call.
      PERFORM public.change_key_status(v_key_id, 'disabled', 'fixture-seeded event', v_inst_staff);

      SELECT actor_staff_id INTO v_recorded FROM public.key_events
       WHERE key_id = v_key_id AND event_type = 'deactivated' AND note = 'fixture-seeded event';
      ASSERT v_recorded = v_inst_staff,
        'FAIL 132-S3: non-API explicit actor should be honoured, got ' || coalesce(v_recorded::text, 'null');
    END $$;
  $q$,
  'PASS 132-S3: a trusted non-API caller''s explicit p_actor_staff_id is honoured'
);

SELECT * FROM finish();
ROLLBACK;
