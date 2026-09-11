-- ============================================================
-- pgTAP: maintenance items may be free; install/replace stay billable
-- ============================================================
-- Covers migration 20260910120000. Before it, the row-level CHECK
-- (unit_price > 0) contradicted the RPC rule from 20260901150000 and a free
-- maintenance visit could not be created at all.
-- ============================================================

BEGIN;
SELECT plan(4);

DO $$
DECLARE v_org_id uuid; v_building_id uuid;
BEGIN
  INSERT INTO public.administrations (company_name) VALUES ('Test 134 Client') RETURNING id INTO v_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 134 Building', 'Calle 134', v_org_id) RETURNING id INTO v_building_id;
END $$;

-- S1: RPC path — maintenance item with unit_price 0 is accepted.
SELECT lives_ok(
  $q$
    SELECT public.create_technical_order_with_items(
      jsonb_build_object('client_type', 'administration',
        'administration_id', (SELECT id FROM public.administrations WHERE company_name = 'Test 134 Client')),
      ARRAY[jsonb_build_object('item_type', 'maintain_equipment',
        'building_id', (SELECT id FROM public.buildings WHERE name = 'Test 134 Building'),
        'quantity', 1, 'unit_price', 0)]::jsonb[],
      false)
  $q$,
  'PASS 134-S1: a free maintenance item (unit_price 0) is created through the RPC'
);

-- S2: RPC path — maintenance item with NULL price defaults to 0 and is accepted.
SELECT lives_ok(
  $q$
    SELECT public.create_technical_order_with_items(
      jsonb_build_object('client_type', 'administration',
        'administration_id', (SELECT id FROM public.administrations WHERE company_name = 'Test 134 Client')),
      ARRAY[jsonb_build_object('item_type', 'maintain_equipment',
        'building_id', (SELECT id FROM public.buildings WHERE name = 'Test 134 Building'),
        'quantity', 1)]::jsonb[],
      false)
  $q$,
  'PASS 134-S2: a maintenance item with no price defaults to 0 and is created'
);

-- S3: row level — install item at 0 is still rejected by the CHECK.
SELECT throws_ok(
  $q$
    INSERT INTO public.technical_order_items (order_id, item_type, quantity, unit_price, building_id, status)
    SELECT id, 'install_equipment', 1, 0,
           (SELECT id FROM public.buildings WHERE name = 'Test 134 Building'), 'pending'
      FROM public.technical_orders
     WHERE administration_id = (SELECT id FROM public.administrations WHERE company_name = 'Test 134 Client')
     LIMIT 1
  $q$,
  '23514',
  NULL,
  'PASS 134-S3: an install item at unit_price 0 still violates the CHECK'
);

-- S4: row level — negative maintenance price is rejected.
SELECT throws_ok(
  $q$
    INSERT INTO public.technical_order_items (order_id, item_type, quantity, unit_price, building_id, status)
    SELECT id, 'maintain_equipment', 1, -1,
           (SELECT id FROM public.buildings WHERE name = 'Test 134 Building'), 'pending'
      FROM public.technical_orders
     WHERE administration_id = (SELECT id FROM public.administrations WHERE company_name = 'Test 134 Client')
     LIMIT 1
  $q$,
  '23514',
  NULL,
  'PASS 134-S4: a negative maintenance price violates the CHECK'
);

SELECT * FROM finish();
ROLLBACK;
