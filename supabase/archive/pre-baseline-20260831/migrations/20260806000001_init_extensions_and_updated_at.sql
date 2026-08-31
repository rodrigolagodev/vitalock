-- Extensions and shared helpers.
-- pgcrypto provides gen_random_uuid() used as PK default across the schema.

create extension if not exists pgcrypto;

-- Reusable trigger function that refreshes updated_at on every row modification.
-- Attached per-table via BEFORE UPDATE triggers in the following migrations.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
