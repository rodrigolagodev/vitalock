-- ============================================================
-- Migration: key/technical order sequences and number-gen helpers
-- ============================================================
-- Creates independent sequences and generator functions for each
-- bounded context so order numbers are unambiguous and context-specific.
--
--   Key orders:       ORD-LLV-000001 …
--   Technical orders: ORD-TEC-000001 …
--
-- The sequences are intentionally independent: gaps in one context do
-- not bleed into the other. The prefix makes the origin readable without
-- a JOIN.

-- -------------------------------------------------------
-- Key orders sequence + generator
-- -------------------------------------------------------
create sequence public.key_order_number_seq;

create or replace function public.gen_key_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'ORD-LLV-' || lpad(nextval('public.key_order_number_seq')::text, 6, '0');
end;
$$;

comment on function public.gen_key_order_number is
  'Returns the next human-readable key-order number (ORD-LLV-XXXXXX).';

-- -------------------------------------------------------
-- Technical orders sequence + generator
-- -------------------------------------------------------
create sequence public.technical_order_number_seq;

create or replace function public.gen_technical_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'ORD-TEC-' || lpad(nextval('public.technical_order_number_seq')::text, 6, '0');
end;
$$;

comment on function public.gen_technical_order_number is
  'Returns the next human-readable technical-order number (ORD-TEC-XXXXXX).';

grant execute on function public.gen_key_order_number      to authenticated, service_role;
grant execute on function public.gen_technical_order_number to authenticated, service_role;
