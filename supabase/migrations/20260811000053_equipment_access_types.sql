-- ============================================================
-- Equipment access_type: rename to building-door taxonomy
-- ============================================================
-- Replaces the previous coarse taxonomy (peatonal/cochera/service/
-- terraza/amenities/other) with the operations vocabulary the admin UI
-- actually uses: Principal, Servicio, Cochera, Puerta 2, Puerta 3,
-- Puerta 4, Otro.
--
-- The column is nullable and there is no persisted data on this side
-- of the seed (tables were truncated before the change), so this is a
-- straight CHECK swap.

alter table operations.equipment drop constraint equipment_access_type_check;
alter table operations.equipment add constraint equipment_access_type_check
  check (access_type in (
    'principal',
    'servicio',
    'cochera',
    'puerta_2',
    'puerta_3',
    'puerta_4',
    'otro'
  ));
