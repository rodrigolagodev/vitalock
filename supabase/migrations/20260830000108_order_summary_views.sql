-- ============================================================
-- Order summary views + trigram index for company_name search
-- ============================================================
-- Replaces the two-query N+1 pattern in
--   apps/admin/src/hooks/useKeyOrders.ts
--   apps/admin/src/hooks/useTechnicalOrders.ts
-- (the buildingId path pre-queried *_order_items, then filtered the
-- main list by the resulting order ids) and the client-side
-- Array.prototype.filter over the embedded administrations.company_name
-- (which discarded rows outside the current page window).
--
-- The views JOIN the administration company_name so the client can
-- filter server-side with ILIKE; the trigram GIN index makes that ILIKE
-- efficient for prefix + substring searches.
--
-- SECURITY INVOKER: RLS on the underlying tables is enforced by the
-- caller's session, mirroring current admin behavior.

create extension if not exists pg_trgm with schema extensions;

create index if not exists administrations_company_name_trgm_idx
  on public.administrations
  using gin (company_name extensions.gin_trgm_ops);

-- ------------------------------------------------------------
-- Key orders: id + all base columns + flat administration
--             company_name. Consumers still request the
--             administrations(company_name) embed against the base
--             administration_id FK for backward compat with the
--             existing consumer types.
-- ------------------------------------------------------------
create or replace view public.key_orders_summary
with (security_invoker = true) as
select
  ko.*,
  a.company_name
from public.key_orders ko
left join public.administrations a on a.id = ko.administration_id;

-- ------------------------------------------------------------
-- Technical orders: same shape as the key_orders view.
-- ------------------------------------------------------------
create or replace view public.technical_orders_summary
with (security_invoker = true) as
select
  t.*,
  a.company_name
from public.technical_orders t
left join public.administrations a on a.id = t.administration_id;

grant select on public.key_orders_summary        to authenticated;
grant select on public.technical_orders_summary  to authenticated;
