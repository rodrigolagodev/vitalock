-- ============================================================
-- SALES schema — presupuestos, facturación interna (bills), pagos
-- ============================================================
-- Modelo "cargos y cobros" liviano. NO emite facturas AFIP-compliant: eso lo
-- hace la contadora externamente, consumiendo la vista sales.pending_to_invoice.
-- Nosotros trackeamos:
--   * Qué se le cobró a cada administración (bills + bill_items)
--   * Qué pagó (payments)
--   * Saldo por administración (view administration_balance)
--   * Presupuestos formales cuando corresponde (quotes)
--   * Abonos mensuales recurrentes (recurring_charges + función helper)

------------------------------------------------------------
-- 1) Catálogo de productos
------------------------------------------------------------
-- El catálogo es solo tipología: "qué cosas puede vender Vitalock". El precio
-- SIEMPRE se ingresa por venta porque cambia por cliente y por contexto
-- (inflación, negociación, cantidad, etc).
create table sales.products (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  product_type  text        not null
                            check (product_type in (
                              'rfid_key',
                              'equipment',
                              'installation',
                              'maintenance_recurring',
                              'maintenance_one_time',
                              'equipment_replacement',
                              'cctv_wifi_installation',
                              'other'
                            )),
  description   text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index products_product_type_idx on sales.products (product_type);
create index products_is_active_idx    on sales.products (is_active) where is_active;

create trigger products_set_updated_at
before update on sales.products
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 2) Sequences + helpers para numeración humana
------------------------------------------------------------
create sequence sales.quote_number_seq;
create sequence sales.bill_number_seq;

create or replace function sales.gen_quote_number()
returns text language plpgsql as $$
begin
  return format('PRE-%s-%s',
                extract(year from now())::int,
                lpad(nextval('sales.quote_number_seq')::text, 6, '0'));
end;
$$;

create or replace function sales.gen_bill_number()
returns text language plpgsql as $$
begin
  return format('VNT-%s-%s',
                extract(year from now())::int,
                lpad(nextval('sales.bill_number_seq')::text, 6, '0'));
end;
$$;

------------------------------------------------------------
-- 3) Quotes (presupuestos) + items
------------------------------------------------------------
create table sales.quotes (
  id                uuid        primary key default gen_random_uuid(),
  quote_number      text        not null unique default sales.gen_quote_number(),
  administration_id uuid        not null references public.administrations(id) on delete restrict,
  status            text        not null default 'draft'
                                check (status in ('draft','sent','accepted','rejected','expired','cancelled')),
  valid_until       date,
  total_amount      numeric(14,2) not null default 0
                                  check (total_amount >= 0),
  currency          text        not null default 'ARS' check (currency = 'ARS'),
  sent_at           timestamptz,
  accepted_at       timestamptz,
  rejected_at       timestamptz,
  rejection_reason  text,
  created_by_staff_id uuid      references identity.staff(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index quotes_administration_id_idx on sales.quotes (administration_id);
create index quotes_status_idx             on sales.quotes (status);

create trigger quotes_set_updated_at
before update on sales.quotes
for each row execute function public.set_updated_at();

create table sales.quote_items (
  id           uuid        primary key default gen_random_uuid(),
  quote_id     uuid        not null references sales.quotes(id) on delete cascade,
  product_id   uuid        references sales.products(id) on delete restrict,
  description  text        not null,
  quantity     numeric(10,2) not null check (quantity > 0),
  unit_price   numeric(14,2) not null check (unit_price >= 0),
  subtotal     numeric(14,2) not null default 0
                             check (subtotal >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index quote_items_quote_id_idx on sales.quote_items (quote_id);

create trigger quote_items_set_updated_at
before update on sales.quote_items
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 4) Recurring charges (abonos mensuales)
------------------------------------------------------------
-- Se declara una vez por administración (típicamente el mantenimiento
-- mensual). La función generate_recurring_charges(year, month) crea las
-- bills correspondientes.
create table sales.recurring_charges (
  id                uuid        primary key default gen_random_uuid(),
  administration_id uuid        not null references public.administrations(id) on delete restrict,
  product_id        uuid        references sales.products(id) on delete restrict,
  description       text        not null,
  monthly_amount    numeric(14,2) not null check (monthly_amount > 0),
  start_date        date        not null,
  end_date          date,
  is_active         boolean     not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint recurring_charges_valid_period check (end_date is null or end_date >= start_date)
);

create index recurring_charges_administration_id_idx on sales.recurring_charges (administration_id);
create index recurring_charges_is_active_idx         on sales.recurring_charges (is_active) where is_active;

create trigger recurring_charges_set_updated_at
before update on sales.recurring_charges
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 5) Bills (cargos) + items
------------------------------------------------------------
create table sales.bills (
  id                uuid        primary key default gen_random_uuid(),
  bill_number       text        not null unique default sales.gen_bill_number(),
  administration_id uuid        not null references public.administrations(id) on delete restrict,
  charge_date       date        not null default current_date,
  due_date          date,
  status            text        not null default 'draft'
                                check (status in ('draft','confirmed','cancelled')),
  total_amount      numeric(14,2) not null default 0
                                  check (total_amount >= 0),
  currency          text        not null default 'ARS' check (currency = 'ARS'),
  from_quote_id     uuid        references sales.quotes(id) on delete set null,
  cancellation_reason text,
  notes             text,
  created_by_staff_id uuid      references identity.staff(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index bills_administration_id_idx on sales.bills (administration_id);
create index bills_status_idx             on sales.bills (status);
create index bills_charge_date_idx        on sales.bills (charge_date);

create trigger bills_set_updated_at
before update on sales.bills
for each row execute function public.set_updated_at();

create table sales.bill_items (
  id                          uuid        primary key default gen_random_uuid(),
  bill_id                     uuid        not null references sales.bills(id) on delete cascade,
  product_id                  uuid        references sales.products(id) on delete restrict,
  description                 text        not null,
  quantity                    numeric(10,2) not null check (quantity > 0),
  unit_price                  numeric(14,2) not null check (unit_price >= 0),
  subtotal                    numeric(14,2) not null default 0
                                            check (subtotal >= 0),
  -- Trazabilidad opcional hacia lo que generó el cargo:
  related_key_request_item_id uuid        references sales.key_request_items(id) on delete set null,
  related_equipment_id        uuid        references operations.equipment(id)     on delete set null,
  related_recurring_charge_id uuid        references sales.recurring_charges(id)  on delete set null,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index bill_items_bill_id_idx                   on sales.bill_items (bill_id);
create index bill_items_related_key_request_item_idx  on sales.bill_items (related_key_request_item_id) where related_key_request_item_id is not null;
create index bill_items_related_equipment_idx         on sales.bill_items (related_equipment_id) where related_equipment_id is not null;
create index bill_items_related_recurring_charge_idx  on sales.bill_items (related_recurring_charge_id) where related_recurring_charge_id is not null;

create trigger bill_items_set_updated_at
before update on sales.bill_items
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 6) Payments (cobros)
------------------------------------------------------------
create table sales.payments (
  id                uuid        primary key default gen_random_uuid(),
  administration_id uuid        not null references public.administrations(id) on delete restrict,
  -- unique: un solo pago por bill (no aceptamos parciales por ahora).
  bill_id           uuid        not null unique references sales.bills(id) on delete restrict,
  payment_date      date        not null default current_date,
  amount            numeric(14,2) not null check (amount > 0),
  currency          text        not null default 'ARS' check (currency = 'ARS'),
  payment_method    text        not null
                                check (payment_method in ('cash','transfer','deposit','mercado_pago','check','other')),
  reference         text,       -- número de comprobante, transferencia, etc.
  -- Auto-completado por trigger: false solo si payment_method='cash'.
  requires_invoice  boolean     not null,
  invoiced_at       timestamptz,  -- la contadora la completa cuando emite la factura formal
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index payments_administration_id_idx on sales.payments (administration_id);
create index payments_payment_date_idx      on sales.payments (payment_date);
-- Índice parcial para "pendientes de facturar" — la consulta más frecuente de la contadora.
create index payments_pending_invoice_idx
  on sales.payments (administration_id, payment_date)
  where requires_invoice = true and invoiced_at is null;

create trigger payments_set_updated_at
before update on sales.payments
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 7) Trigger: auto-calcular subtotal en items
------------------------------------------------------------
create or replace function sales.compute_item_subtotal()
returns trigger language plpgsql as $$
begin
  new.subtotal := round(new.quantity * new.unit_price, 2);
  return new;
end;
$$;

create trigger quote_items_compute_subtotal
before insert or update of quantity, unit_price on sales.quote_items
for each row execute function sales.compute_item_subtotal();

create trigger bill_items_compute_subtotal
before insert or update of quantity, unit_price on sales.bill_items
for each row execute function sales.compute_item_subtotal();

------------------------------------------------------------
-- 8) Trigger: recomputar total_amount en el parent cuando cambian items
------------------------------------------------------------
create or replace function sales.recompute_quote_total()
returns trigger language plpgsql as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
begin
  update sales.quotes
     set total_amount = coalesce((
       select sum(subtotal) from sales.quote_items where quote_id = v_quote_id
     ), 0)
   where id = v_quote_id;
  return null;
end;
$$;

create trigger quote_items_recompute_total
after insert or update or delete on sales.quote_items
for each row execute function sales.recompute_quote_total();

create or replace function sales.recompute_bill_total()
returns trigger language plpgsql as $$
declare
  v_bill_id uuid := coalesce(new.bill_id, old.bill_id);
begin
  update sales.bills
     set total_amount = coalesce((
       select sum(subtotal) from sales.bill_items where bill_id = v_bill_id
     ), 0)
   where id = v_bill_id;
  return null;
end;
$$;

create trigger bill_items_recompute_total
after insert or update or delete on sales.bill_items
for each row execute function sales.recompute_bill_total();

------------------------------------------------------------
-- 9) Trigger: bills validation + state machine
------------------------------------------------------------
-- Reglas:
--   * administration_id, from_quote_id inmutables tras crear.
--   * Estados: draft ↔ confirmed → cancelled. cancelled es terminal.
--     Se permite draft → cancelled y confirmed → cancelled.
--     Cancellation requiere cancellation_reason.
--   * total_amount lo maneja el trigger de items; no se puede setear manualmente
--     a un valor distinto (lo pisa el trigger de recompute cuando hay items).
create or replace function sales.bills_validate()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.administration_id is distinct from old.administration_id then
      raise exception 'bills.administration_id is immutable' using errcode = 'check_violation';
    end if;
    if new.from_quote_id is distinct from old.from_quote_id then
      raise exception 'bills.from_quote_id is immutable' using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'draft'     and new.status in ('confirmed','cancelled'))
        or (old.status = 'confirmed' and new.status = 'cancelled')
      ) then
        raise exception 'invalid bills.status transition: % -> %', old.status, new.status
          using errcode = 'check_violation';
      end if;

      if new.status = 'cancelled' and (new.cancellation_reason is null or length(trim(new.cancellation_reason)) = 0) then
        raise exception 'cancellation_reason is required when status=cancelled'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger bills_validate
before update on sales.bills
for each row execute function sales.bills_validate();

------------------------------------------------------------
-- 10) Trigger: quotes validation + state machine
------------------------------------------------------------
create or replace function sales.quotes_validate()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.administration_id is distinct from old.administration_id then
      raise exception 'quotes.administration_id is immutable' using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'draft' and new.status in ('sent','cancelled'))
        or (old.status = 'sent'  and new.status in ('accepted','rejected','expired','cancelled'))
      ) then
        raise exception 'invalid quotes.status transition: % -> %', old.status, new.status
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger quotes_validate
before update on sales.quotes
for each row execute function sales.quotes_validate();

------------------------------------------------------------
-- 11) Trigger: bloquear modificación de items cuando el parent no es draft
------------------------------------------------------------
create or replace function sales.bill_items_check_parent_editable()
returns trigger language plpgsql as $$
declare
  v_status text;
  v_bill_id uuid := coalesce(new.bill_id, old.bill_id);
begin
  select status into v_status from sales.bills where id = v_bill_id;
  if v_status is null then
    return coalesce(new, old);  -- parent fue borrado en cascade
  end if;
  if v_status <> 'draft' then
    raise exception 'cannot modify items of a bill in status % (only draft allows modifications)', v_status
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger bill_items_check_parent_editable
before insert or update or delete on sales.bill_items
for each row execute function sales.bill_items_check_parent_editable();

create or replace function sales.quote_items_check_parent_editable()
returns trigger language plpgsql as $$
declare
  v_status text;
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
begin
  select status into v_status from sales.quotes where id = v_quote_id;
  if v_status is null then
    return coalesce(new, old);
  end if;
  if v_status <> 'draft' then
    raise exception 'cannot modify items of a quote in status % (only draft allows modifications)', v_status
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quote_items_check_parent_editable
before insert or update or delete on sales.quote_items
for each row execute function sales.quote_items_check_parent_editable();

------------------------------------------------------------
-- 12) Trigger: payments validation
------------------------------------------------------------
-- Reglas:
--   * requires_invoice se calcula solo: true si method != 'cash'.
--   * amount debe ser == bill.total_amount (sin pagos parciales por ahora).
--   * bill debe estar en status='confirmed'.
--   * administration_id debe coincidir con bill.administration_id.
--   * bill_id y amount inmutables una vez creado el pago.
create or replace function sales.payments_validate()
returns trigger language plpgsql as $$
declare
  v_bill_status text;
  v_bill_total  numeric(14,2);
  v_bill_admin  uuid;
begin
  if tg_op = 'INSERT' then
    new.requires_invoice := (new.payment_method <> 'cash');

    select status, total_amount, administration_id
      into v_bill_status, v_bill_total, v_bill_admin
      from sales.bills where id = new.bill_id;

    if v_bill_status is null then
      raise exception 'bill % not found', new.bill_id;
    end if;
    if v_bill_status <> 'confirmed' then
      raise exception 'cannot register payment for bill in status % (must be confirmed)', v_bill_status
        using errcode = 'check_violation';
    end if;
    if new.administration_id <> v_bill_admin then
      raise exception 'payment administration (%) does not match bill administration (%)',
        new.administration_id, v_bill_admin
        using errcode = 'check_violation';
    end if;
    if new.amount <> v_bill_total then
      raise exception 'payment amount (%) must equal bill total (%). Partial payments not supported.',
        new.amount, v_bill_total
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.bill_id is distinct from old.bill_id then
    raise exception 'payments.bill_id is immutable' using errcode = 'check_violation';
  end if;
  if new.amount is distinct from old.amount then
    raise exception 'payments.amount is immutable' using errcode = 'check_violation';
  end if;
  if new.payment_method is distinct from old.payment_method then
    raise exception 'payments.payment_method is immutable' using errcode = 'check_violation';
  end if;
  -- requires_invoice se recalcula si (por alguna razón) el method cambiara,
  -- pero como es inmutable, este bloque no aplica. Preservamos igual.
  new.requires_invoice := (new.payment_method <> 'cash');
  return new;
end;
$$;

create trigger payments_validate
before insert or update on sales.payments
for each row execute function sales.payments_validate();

------------------------------------------------------------
-- 13) Función helper: generar los cargos recurrentes de un mes
------------------------------------------------------------
-- Crea un bill 'confirmed' por cada recurring_charge activo, sin duplicar
-- si ya se generó para ese mes. Retorna la cantidad de bills creadas.
create or replace function sales.generate_recurring_charges(p_year int, p_month int)
returns int
language plpgsql
as $$
declare
  v_charge_date date := make_date(p_year, p_month, 1);
  v_count       int := 0;
  r             record;
  v_bill_id     uuid;
begin
  if p_year < 2020 or p_year > 2100 then
    raise exception 'p_year out of range: %', p_year;
  end if;
  if p_month < 1 or p_month > 12 then
    raise exception 'p_month out of range: %', p_month;
  end if;

  for r in
    select rc.*
    from sales.recurring_charges rc
    where rc.is_active
      and rc.start_date <= v_charge_date
      and (rc.end_date is null or rc.end_date >= v_charge_date)
      and not exists (
        select 1
        from sales.bill_items bi
        join sales.bills b on b.id = bi.bill_id
        where b.administration_id = rc.administration_id
          and date_trunc('month', b.charge_date) = date_trunc('month', v_charge_date)
          and bi.related_recurring_charge_id = rc.id
      )
  loop
    insert into sales.bills (administration_id, charge_date, status, notes)
    values (r.administration_id, v_charge_date, 'draft',
            format('Auto-generado por generate_recurring_charges(%s, %s)', p_year, p_month))
    returning id into v_bill_id;

    insert into sales.bill_items
      (bill_id, product_id, description, quantity, unit_price, related_recurring_charge_id)
    values
      (v_bill_id, r.product_id, r.description, 1, r.monthly_amount, r.id);

    -- Confirmamos después de meter el item (draft porque el trigger de
    -- editabilidad de items solo permite modificar drafts).
    update sales.bills set status = 'confirmed' where id = v_bill_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function sales.generate_recurring_charges is
  'Genera bills confirmed para todos los recurring_charges activos del mes '
  'indicado, evitando duplicados. Retorna la cantidad de bills creadas.';

------------------------------------------------------------
-- 14) Vistas útiles
------------------------------------------------------------
-- Pendientes de facturar: lo que la contadora consume.
create view sales.pending_to_invoice as
select p.id            as payment_id,
       p.payment_date,
       p.amount,
       p.payment_method,
       p.reference,
       b.bill_number,
       b.charge_date,
       a.id            as administration_id,
       a.company_name,
       a.tax_id
from sales.payments p
join sales.bills b            on b.id = p.bill_id
join public.administrations a on a.id = p.administration_id
where p.requires_invoice = true
  and p.invoiced_at is null;

comment on view sales.pending_to_invoice is
  'Pagos por transferencia/depósito/MP/cheque que aún no fueron facturados '
  'por la contadora. Se marca como facturado seteando payments.invoiced_at.';

-- Cuenta corriente por administración.
create view sales.administration_balance as
select a.id                                        as administration_id,
       a.company_name,
       a.tax_id,
       coalesce(charges.total, 0)                  as total_billed,
       coalesce(payments.total, 0)                 as total_paid,
       coalesce(charges.total, 0) - coalesce(payments.total, 0) as balance
from public.administrations a
left join (
  select administration_id, sum(total_amount) as total
  from sales.bills
  where status = 'confirmed'
  group by administration_id
) charges on charges.administration_id = a.id
left join (
  select administration_id, sum(amount) as total
  from sales.payments
  group by administration_id
) payments on payments.administration_id = a.id;

comment on view sales.administration_balance is
  'Saldo por administración: total facturado (bills confirmed) menos total '
  'cobrado (payments). balance > 0 = la admin debe.';

------------------------------------------------------------
-- 15) RLS placeholders + grants (mismo criterio que el resto de sales)
------------------------------------------------------------
alter table sales.products           enable row level security;
alter table sales.quotes             enable row level security;
alter table sales.quote_items        enable row level security;
alter table sales.bills              enable row level security;
alter table sales.bill_items         enable row level security;
alter table sales.payments           enable row level security;
alter table sales.recurring_charges  enable row level security;

create policy "authenticated_all_products"          on sales.products          for all to authenticated using (true) with check (true);
create policy "authenticated_all_quotes"            on sales.quotes            for all to authenticated using (true) with check (true);
create policy "authenticated_all_quote_items"       on sales.quote_items       for all to authenticated using (true) with check (true);
create policy "authenticated_all_bills"             on sales.bills             for all to authenticated using (true) with check (true);
create policy "authenticated_all_bill_items"        on sales.bill_items        for all to authenticated using (true) with check (true);
create policy "authenticated_all_payments"          on sales.payments          for all to authenticated using (true) with check (true);
create policy "authenticated_all_recurring_charges" on sales.recurring_charges for all to authenticated using (true) with check (true);

-- Grants para las tablas nuevas (los defaults del schema ya excluyen anon
-- desde la migración anterior).
grant all on sales.products,
             sales.quotes,
             sales.quote_items,
             sales.bills,
             sales.bill_items,
             sales.payments,
             sales.recurring_charges,
             sales.pending_to_invoice,
             sales.administration_balance
  to authenticated, service_role;
