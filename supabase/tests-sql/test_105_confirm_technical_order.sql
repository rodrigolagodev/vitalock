-- ============================================================
-- pgTAP: public.confirm_technical_order
-- ============================================================
-- Spec: technical-orders / Technical Orders State Machine (draft → confirmed)
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 105-S1 through PASS 105-S5 preserved.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 1 (PASS 105-S1): draft → confirmed + ticket created per item
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_order_id    uuid;
      v_status      text;
      v_ticket_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 105-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 105-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 105-S1 Staff', 'installer') RETURNING id INTO v_staff_id;

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
        false
      );

      PERFORM public.confirm_technical_order(v_order_id);

      SELECT status INTO v_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_status = 'confirmed', 'FAIL 105-S1: expected confirmed, got ' || v_status;

      SELECT count(*) INTO v_ticket_count
        FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id;

      ASSERT v_ticket_count = 1, 'FAIL 105-S1: expected 1 ticket created, got ' || v_ticket_count::text;
    END $$;
  $q$,
  'PASS 105-S1: confirm_technical_order advances to confirmed and creates support tickets'
);

-- ============================================================
-- Scenario 2 (PASS 105-S2): ticket has correct technical_order_item_id (dual-FK)
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 105-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 105-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 105-S2 Staff', 'installer') RETURNING id INTO v_staff_id;

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
        'FAIL 105-S2: ticket technical_order_item_id should match item id';

      ASSERT v_ticket.key_order_item_id IS NULL,
        'FAIL 105-S2: key_order_item_id should be NULL on a technical order ticket';

      ASSERT v_ticket.status = 'open',
        'FAIL 105-S2: newly created ticket should have status=open';
    END $$;
  $q$,
  'PASS 105-S2: confirmed technical order ticket has correct dual-FK and status=open'
);

-- ============================================================
-- Scenario 3 (PASS 105-S3): intent fields seeded into ticket (assignee)
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 105-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 105-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 105-S3 Staff', 'installer') RETURNING id INTO v_staff_id;

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

      ASSERT v_ticket.assigned_to_staff_id = v_staff_id,
        'FAIL 105-S3: ticket assigned_to_staff_id should match intended_assignee_staff_id';

      ASSERT v_ticket.building_id = v_building_id,
        'FAIL 105-S3: ticket building_id should match item building_id';
    END $$;
  $q$,
  'PASS 105-S3: intent fields (assignee, building) are seeded into support ticket'
);

-- ============================================================
-- Scenario 4 (PASS 105-S4): double-confirm raises TECHNICAL_ORDER_NOT_DRAFT
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 105-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 105-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 105-S4 Staff', 'installer') RETURNING id INTO v_staff_id;

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

      PERFORM public.confirm_technical_order(v_order_id);
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 105-S4: double-confirm raises TECHNICAL_ORDER_NOT_DRAFT'
);

-- ============================================================
-- Scenario 5 (PASS 105-S5): stock reservation created for item with product_id
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_product_id   uuid;
      v_order_id     uuid;
      v_reserva_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 105-S5 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 105-S5 Building', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 105-S5 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category)
        VALUES ('Test 105-S5 Equipment SKU', 'equipment') RETURNING id INTO v_product_id;

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

      SELECT count(*) INTO v_reserva_count
        FROM public.stock_movements
       WHERE order_id = v_order_id
         AND order_kind = 'technical'
         AND type = 'reserva';

      ASSERT v_reserva_count = 1,
        'FAIL 105-S5: expected 1 reserva for item with product_id, got ' || v_reserva_count::text;
    END $$;
  $q$,
  'PASS 105-S5: confirm_technical_order creates stock reservations for items with product_id'
);

SELECT * FROM finish();
ROLLBACK;
