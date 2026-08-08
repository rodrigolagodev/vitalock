-- ============================================================
-- Remove 'viewer' from identity.staff.role
-- ============================================================
-- Cerramos el drift documental: el CHECK aceptaba 'viewer' pero nunca
-- implementamos policies RLS para ese rol, así que operativamente no existía.
-- El negocio confirmó que solo hay 2 roles internos: admin e installer.
--
-- Si en el futuro se necesita un rol solo-lectura (ej. contador externo con
-- acceso al app), se agrega junto con las policies RLS correspondientes.

-- Safety: convertir cualquier 'viewer' existente a 'admin' (elevación segura;
-- el operador debe revisar y bajar a 'installer' si corresponde). En una DB
-- fresca esto es no-op.
update identity.staff set role = 'admin' where role = 'viewer';

alter table identity.staff drop constraint staff_role_check;
alter table identity.staff
  add constraint staff_role_check check (role in ('admin', 'installer'));
