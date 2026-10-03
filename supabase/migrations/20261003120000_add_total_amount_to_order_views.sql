-- Expose the order total on the order list views.
--
-- total_amount = sum(quantity * unit_price) over the order's items whose
-- status <> 'cancelled'; 0 when there are none. unit_price already includes IVA.
--
-- CREATE OR REPLACE VIEW keeps grants, comments and the all_orders REVOKE, but it
-- only allows appending columns, so every existing column is restated in the same
-- order and total_amount goes last. The security_invoker option is restated because
-- CREATE OR REPLACE resets reloptions to what the statement declares.
-- Covered by supabase/tests-sql/test_140_order_totals_views.sql.

CREATE OR REPLACE VIEW "public"."key_orders_summary" WITH ("security_invoker"='true') AS
 SELECT "ko"."id",
    "ko"."order_number",
    "ko"."client_type",
    "ko"."administration_id",
    "ko"."particular_id",
    "ko"."particular_full_name",
    "ko"."particular_dni",
    "ko"."particular_phone",
    "ko"."particular_email",
    "ko"."pickup_particular_id",
    "ko"."status",
    "ko"."notes",
    "ko"."created_at",
    "ko"."updated_at",
    "a"."company_name",
    (COALESCE(( SELECT "sum"(("i"."quantity" * "i"."unit_price"))
           FROM "public"."key_order_items" "i"
          WHERE (("i"."order_id" = "ko"."id") AND ("i"."status" <> 'cancelled'::"text"))), (0)::numeric))::numeric(12,2) AS "total_amount"
   FROM ("public"."key_orders" "ko"
     LEFT JOIN "public"."administrations" "a" ON (("a"."id" = "ko"."administration_id")));

CREATE OR REPLACE VIEW "public"."technical_orders_summary" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."order_number",
    "t"."client_type",
    "t"."administration_id",
    "t"."particular_id",
    "t"."particular_full_name",
    "t"."particular_dni",
    "t"."particular_phone",
    "t"."particular_email",
    "t"."status",
    "t"."notes",
    "t"."created_at",
    "t"."updated_at",
    "a"."company_name",
    (COALESCE(( SELECT "sum"(("i"."quantity" * "i"."unit_price"))
           FROM "public"."technical_order_items" "i"
          WHERE (("i"."order_id" = "t"."id") AND ("i"."status" <> 'cancelled'::"text"))), (0)::numeric))::numeric(12,2) AS "total_amount"
   FROM ("public"."technical_orders" "t"
     LEFT JOIN "public"."administrations" "a" ON (("a"."id" = "t"."administration_id")));

CREATE OR REPLACE VIEW "public"."all_orders" WITH ("security_invoker"='on') AS
 SELECT "ko"."id",
    "ko"."order_number",
    'key'::"text" AS "order_kind",
    "ko"."client_type",
    "ko"."administration_id",
    "ko"."particular_id",
    "ko"."particular_full_name",
    "ko"."status",
    "ko"."notes",
    "ko"."created_at",
    "ko"."updated_at",
    (COALESCE(( SELECT "sum"(("i"."quantity" * "i"."unit_price"))
           FROM "public"."key_order_items" "i"
          WHERE (("i"."order_id" = "ko"."id") AND ("i"."status" <> 'cancelled'::"text"))), (0)::numeric))::numeric(12,2) AS "total_amount"
   FROM "public"."key_orders" "ko"
UNION ALL
 SELECT "tor"."id",
    "tor"."order_number",
    'technical'::"text" AS "order_kind",
    "tor"."client_type",
    "tor"."administration_id",
    "tor"."particular_id",
    "tor"."particular_full_name",
    "tor"."status",
    "tor"."notes",
    "tor"."created_at",
    "tor"."updated_at",
    (COALESCE(( SELECT "sum"(("i"."quantity" * "i"."unit_price"))
           FROM "public"."technical_order_items" "i"
          WHERE (("i"."order_id" = "tor"."id") AND ("i"."status" <> 'cancelled'::"text"))), (0)::numeric))::numeric(12,2) AS "total_amount"
   FROM "public"."technical_orders" "tor";
