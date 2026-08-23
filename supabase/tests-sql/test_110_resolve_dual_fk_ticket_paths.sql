-- ============================================================
-- pgTAP: resolve_* RPCs — dual-FK ticket path (technical_order_item_id)
-- ============================================================
-- Spec: tickets-dual-fk / resolve_equipment_installation new path
-- Tests that confirm_technical_order sets technical_order_item_id on tickets,
-- and that resolve_equipment_installation / resolve_equipment_replacement
-- follow the new path (technical_order_item_id) for stock movements.
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 110-S1 through PASS 110-S4 preserved.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Scenario 1 (PASS 110-S1): confirmed technical order sets technical_order_item_id on ticket
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
      v_item_id     uuid;
      v_ticket      record;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 110-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 110-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 110-S1 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.technical_order_items WHERE order_id = v_order_id LIMIT 1;

      SELECT * INTO v_ticket
        FROM support.tickets
       WHERE technical_order_item_id = v_item_id;

      ASSERT v_ticket.technical_order_item_id = v_item_id,
        'FAIL 110-S1: ticket technical_order_item_id should match technical_order_items.id';

      -- key_order_item_id must be NULL (dual-FK schema)
      ASSERT v_ticket.key_order_item_id IS NULL,
        'FAIL 110-S1: key_order_item_id must be NULL for technical order tickets';
    END $$;
  $q$,
  'PASS 110-S1: confirm_technical_order sets technical_order_item_id (new FK path) on ticket'
);

-- ============================================================
-- Scenario 2 (PASS 110-S2): resolve_equipment_installation follows technical_order_item_id path
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_product_id  uuid;
      v_order_id    uuid;
      v_item_id     uuid;
      v_ticket_id   uuid;
      v_eq_id       uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 110-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 110-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 110-S2 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category)
        VALUES ('Test 110-S2 Equipment SKU', 'equipment') RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300,
            'product_id', v_product_id
          )
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.technical_order_items WHERE order_id = v_order_id LIMIT 1;

      SELECT id INTO v_ticket_id
        FROM support.tickets
       WHERE technical_order_item_id = v_item_id;

      -- Move ticket to in_progress first (required by resolve_equipment_installation)
      UPDATE support.tickets SET status = 'in_progress' WHERE id = v_ticket_id;

      -- Resolve via the new dual-FK path
      v_eq_id := public.resolve_equipment_installation(v_ticket_id, 'SERIAL-110-S2', NULL, 'Installed', v_staff_id);

      ASSERT v_eq_id IS NOT NULL, 'FAIL 110-S2: resolve_equipment_installation should return equipment_id';

      ASSERT (SELECT status FROM support.tickets WHERE id = v_ticket_id) = 'resolved',
        'FAIL 110-S2: ticket should be resolved after resolve_equipment_installation';
    END $$;
  $q$,
  'PASS 110-S2: resolve_equipment_installation follows technical_order_item_id path and resolves ticket'
);

-- ============================================================
-- Scenario 3 (PASS 110-S3): resolve_equipment_installation emits stock movements via new path
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_product_id  uuid;
      v_order_id    uuid;
      v_item_id     uuid;
      v_ticket_id   uuid;
      v_egreso_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 110-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 110-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 110-S3 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category)
        VALUES ('Test 110-S3 Equipment SKU', 'equipment') RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300,
            'product_id', v_product_id
          )
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.technical_order_items WHERE order_id = v_order_id LIMIT 1;

      SELECT id INTO v_ticket_id
        FROM support.tickets
       WHERE technical_order_item_id = v_item_id;

      UPDATE support.tickets SET status = 'in_progress' WHERE id = v_ticket_id;
      PERFORM public.resolve_equipment_installation(v_ticket_id, 'SERIAL-110-S3', NULL, 'Installed', v_staff_id);

      SELECT count(*) INTO v_egreso_count
        FROM public.stock_movements
       WHERE order_id = v_order_id
         AND order_kind = 'technical'
         AND type IN ('egreso_instalacion', 'liberacion_reserva');

      ASSERT v_egreso_count >= 1,
        'FAIL 110-S3: expected egreso/liberacion movements for technical_order_item_id path, got ' || v_egreso_count::text;
    END $$;
  $q$,
  'PASS 110-S3: resolve_equipment_installation emits stock movements via technical_order_item_id path'
);

-- ============================================================
-- Scenario 4 (PASS 110-S4): ticket with key_order_item_id has NULL technical_order_item_id
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
      v_ticket_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 110-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 110-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 110-S4 Staff', 'installer') RETURNING id INTO v_staff_id;

      -- Key orders do NOT create tickets — verify no tickets were created
      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'key',
            'building_id', v_building_id,
            'quantity', 1,
            'unit_price', 100
          )
        ]::jsonb[],
        true
      );

      SELECT count(*) INTO v_ticket_count
        FROM support.tickets t
        JOIN public.key_order_items koi ON koi.order_id = v_order_id
       WHERE t.key_order_item_id = koi.id;

      -- key_orders do not create support.tickets (technical-only concern per spec)
      ASSERT v_ticket_count = 0,
        'FAIL 110-S4: key orders must not create support.tickets, found ' || v_ticket_count::text;
    END $$;
  $q$,
  'PASS 110-S4: key orders do not create support.tickets (technical-only concern)'
);

SELECT * FROM finish();
ROLLBACK;
