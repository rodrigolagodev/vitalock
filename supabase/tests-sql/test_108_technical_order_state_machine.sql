-- ============================================================
-- pgTAP: technical_orders state machine (ticket-driven transitions)
-- ============================================================
-- Spec: technical-orders / Technical Orders State Machine
-- Tests: confirmed → in_progress (ticket progresses), in_progress → completed
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 108-S1 through PASS 108-S3 preserved.
-- ============================================================

BEGIN;
SELECT plan(3);

-- ============================================================
-- Scenario 1 (PASS 108-S1): technical order advances to in_progress when ticket → in_progress
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
      v_ticket_id   uuid;
      v_order_status text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 108-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 108-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 108-S1 Staff', 'installer') RETURNING id INTO v_staff_id;

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

      SELECT t.id INTO v_ticket_id
        FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id
       LIMIT 1;

      -- Advance ticket: open → in_progress (triggers tickets_sync_order_status)
      UPDATE support.tickets SET status = 'in_progress' WHERE id = v_ticket_id;

      SELECT status INTO v_order_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'in_progress',
        'FAIL 108-S1: expected in_progress after ticket → in_progress, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 108-S1: technical order advances to in_progress when linked ticket moves to in_progress'
);

-- ============================================================
-- Scenario 2 (PASS 108-S2): technical order advances to completed when all tickets resolved
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
      v_ticket_id   uuid;
      v_order_status text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 108-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 108-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 108-S2 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Test 108-S2 Equipment SKU', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'equipment',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300,
            'product_id', v_product_id
          )
        ]::jsonb[],
        true
      );

      SELECT t.id INTO v_ticket_id
        FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id
       LIMIT 1;

      -- installation tickets must be resolved through resolve_equipment_installation
      -- so the trigger tickets_require_equipment_on_resolve gets an equipment_id
      -- attached before the resolved transition.
      PERFORM public.resolve_equipment_installation(
        v_ticket_id, 'SN-108-S2', NULL, 'Trabajo completado', v_staff_id
      );

      SELECT status INTO v_order_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'completed',
        'FAIL 108-S2: expected completed after all tickets resolved, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 108-S2: technical order advances to completed when all linked tickets are resolved'
);

-- ============================================================
-- Scenario 3 (PASS 108-S3): direct UPDATE to ready_for_pickup is rejected by CHECK constraint
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 108-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 108-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 108-S3 Staff', 'installer') RETURNING id INTO v_staff_id;

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

      -- ready_for_pickup is outside the technical_orders status domain — CHECK constraint rejects
      UPDATE public.technical_orders SET status = 'ready_for_pickup' WHERE id = v_order_id;
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 108-S3: technical_orders rejects ready_for_pickup (outside status domain)'
);

SELECT * FROM finish();
ROLLBACK;
