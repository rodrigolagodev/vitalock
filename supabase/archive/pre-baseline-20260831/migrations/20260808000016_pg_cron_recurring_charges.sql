-- ============================================================
-- pg_cron — job mensual para generar recurring_charges
-- ============================================================
-- pg_cron corre en la base 'postgres' de la cluster; en Supabase local y
-- cloud está disponible. Este bloque es defensivo: si el extension no está
-- disponible (por ejemplo en algún entorno de dev distinto), no falla la
-- migración, solo deja una NOTICE explicando que hay que correr manual.

do $$
begin
  if exists (
    select 1 from pg_available_extensions
    where name = 'pg_cron'
  ) then
    -- El extension solo se puede crear una vez en la cluster. IF NOT EXISTS
    -- lo maneja.
    create extension if not exists pg_cron;

    -- Job: cada 1° de mes a las 08:00 UTC (~5am AR) → generar cargos del mes.
    -- Si ya existe un job con ese nombre, cron.schedule lo reemplaza.
    perform cron.schedule(
      'sales-generate-monthly-charges',
      '0 8 1 * *',
      $job$
        select sales.generate_recurring_charges(
          extract(year from now())::int,
          extract(month from now())::int
        );
      $job$
    );

    raise notice 'pg_cron scheduled: sales-generate-monthly-charges (0 8 1 * *)';
  else
    raise notice 'pg_cron not available in this environment. Recurring charges '
      'must be generated manually via sales.generate_recurring_charges(year, month).';
  end if;
exception
  when others then
    -- Si pg_cron requiere setup adicional (por ejemplo shared_preload_libraries),
    -- no bloqueamos la migración; solo avisamos.
    raise notice 'pg_cron setup failed (%). Run sales.generate_recurring_charges manually.', sqlerrm;
end $$;
