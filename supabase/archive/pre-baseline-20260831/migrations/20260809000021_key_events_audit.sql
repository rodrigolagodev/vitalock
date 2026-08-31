-- key_events: audit log for rfid_keys status changes.
-- Every activation/deactivation is recorded with a mandatory note and the
-- staff member who performed it. Immutable once inserted.

create table public.key_events (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.rfid_keys(id) on delete cascade,
  event_type text not null check (event_type in ('activated', 'deactivated')),
  note text not null check (length(trim(note)) > 0),
  actor_staff_id uuid references identity.staff(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index key_events_key_id_idx on public.key_events(key_id);
create index key_events_occurred_at_idx on public.key_events(occurred_at desc);

alter table public.key_events enable row level security;

create policy "admin_all_key_events" on public.key_events
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

create policy "installer_read_key_events" on public.key_events
  for select to authenticated
  using (identity.is_installer());
