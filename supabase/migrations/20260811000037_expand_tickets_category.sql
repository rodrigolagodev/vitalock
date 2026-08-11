-- ============================================================
-- Expand support.tickets.category CHECK with the three new values
-- ============================================================
-- The stock-inventory flow introduces three new ticket categories:
--   key_configuration     (key order_item inserted, admin configures the key)
--   key_installation      (auto-chained after key_configuration is resolved)
--   equipment_installation(equipment order_item inserted)
-- Existing rows only ever hold 'maintenance'/'installation', so the
-- constraint is rebuilt as the union of old + new values (no NOT VALID
-- round-trip needed) and validated immediately.

alter table support.tickets
  drop constraint tickets_category_check;

alter table support.tickets
  add constraint tickets_category_check check (category in (
    'maintenance',
    'installation',
    'key_configuration',
    'key_installation',
    'equipment_installation'
  ));
