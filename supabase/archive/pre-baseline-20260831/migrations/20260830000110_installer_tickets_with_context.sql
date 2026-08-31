-- ============================================================
-- Cross-schema view: support.installer_tickets_with_context
-- ============================================================
-- Collapses the 3-query stitching in
--   apps/installer/src/hooks/useAssignedTickets.ts
--   apps/installer/src/hooks/useTicketHistory.ts
-- (support.tickets + public.buildings + public.administrations)
-- into one row per ticket. PostgREST cannot embed cross-schema FKs
-- (support -> public), so a Postgres view is the escape hatch.
--
-- SECURITY INVOKER: the underlying support.tickets RLS policies
-- already scope reads by role (admin sees all; installer sees only
-- their own via assigned_to_staff_id + auth.uid()). No DEFINER
-- escalation is needed because the view exposes only the JOINed
-- columns the installer already had access to indirectly.

create or replace view support.installer_tickets_with_context
with (security_invoker = true) as
select
  t.*,
  b.name               as building_name,
  b.address            as building_address,
  b.city               as building_city,
  b.administration_id  as building_administration_id,
  a.company_name       as administration_company_name,
  a.address            as administration_address
from support.tickets t
left join public.buildings b        on b.id = t.building_id
left join public.administrations a  on a.id = b.administration_id;

grant select on support.installer_tickets_with_context to authenticated;
