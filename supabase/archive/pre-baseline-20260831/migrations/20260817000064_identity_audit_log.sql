-- Staff audit log for security-sensitive lifecycle changes.
--
-- Captures the events post-incident investigators most often ask about:
-- role changes (was someone promoted to admin?) and status changes
-- (was someone deactivated / reactivated?). Login/logout events themselves
-- come from Supabase Auth Hooks (webhook-based) and are out of scope for
-- this migration.
--
-- Anyone reading the log needs admin role; nobody may edit or delete rows
-- (append-only). The insert trigger runs SECURITY DEFINER so it can bypass
-- RLS on the log table regardless of who mutated the staff row.

create table if not exists identity.audit_log (
  id           uuid        primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  actor_id     uuid        references identity.staff(id) on delete set null,
  subject_id   uuid        not null references identity.staff(id) on delete cascade,
  event_type   text        not null check (event_type in (
                             'role_changed', 'status_changed', 'created', 'deleted'
                           )),
  before_value text,
  after_value  text,
  metadata     jsonb       not null default '{}'::jsonb
);

create index if not exists audit_log_subject_idx
  on identity.audit_log (subject_id, occurred_at desc);

create index if not exists audit_log_event_idx
  on identity.audit_log (event_type, occurred_at desc);

alter table identity.audit_log enable row level security;

drop policy if exists admin_read_audit_log on identity.audit_log;
create policy admin_read_audit_log
  on identity.audit_log
  for select to authenticated
  using (identity.is_admin());

-- No INSERT/UPDATE/DELETE policies for user roles: writes only via the
-- SECURITY DEFINER trigger below; the table stays append-only.
revoke insert, update, delete on identity.audit_log from authenticated, anon;

create or replace function identity.record_staff_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := identity.current_staff_id();
begin
  if tg_op = 'INSERT' then
    insert into identity.audit_log (actor_id, subject_id, event_type, after_value)
    values (v_actor, new.id, 'created', new.role || ':' || new.status);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into identity.audit_log (actor_id, subject_id, event_type, before_value)
    values (v_actor, old.id, 'deleted', old.role || ':' || old.status);
    return old;
  end if;

  -- UPDATE
  if new.role is distinct from old.role then
    insert into identity.audit_log (actor_id, subject_id, event_type, before_value, after_value)
    values (v_actor, new.id, 'role_changed', old.role, new.role);
  end if;

  if new.status is distinct from old.status then
    insert into identity.audit_log (actor_id, subject_id, event_type, before_value, after_value)
    values (v_actor, new.id, 'status_changed', old.status, new.status);
  end if;

  return new;
end;
$$;

comment on function identity.record_staff_audit_event is
  'Append-only writer for identity.audit_log. Runs SECURITY DEFINER to bypass '
  'RLS on the log table so audit rows are written regardless of caller role.';

drop trigger if exists staff_audit_insert on identity.staff;
drop trigger if exists staff_audit_update on identity.staff;
drop trigger if exists staff_audit_delete on identity.staff;

create trigger staff_audit_insert
after insert on identity.staff
for each row execute function identity.record_staff_audit_event();

create trigger staff_audit_update
after update on identity.staff
for each row execute function identity.record_staff_audit_event();

create trigger staff_audit_delete
after delete on identity.staff
for each row execute function identity.record_staff_audit_event();
