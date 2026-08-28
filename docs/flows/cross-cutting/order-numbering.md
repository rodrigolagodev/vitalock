---
name: order-numbering
title: Order & Ticket Number Generation
kind: cross-cutting
actors: [system]
covers_requirements:
  - ordenes-admin#order-number-format
  - tickets#ticket-number-format
related_rpcs:
  - public.gen_key_order_number
  - public.gen_technical_order_number
  - support.gen_ticket_number
related_tables:
  - public.key_orders
  - public.technical_orders
  - support.tickets
covering_tests:
  pgtap: []
  vitest: []
last_verified: 2026-08-27
---

# Order & Ticket Number Generation

## Purpose

Every order and ticket has a human-readable identifier separate from
its UUID primary key. The identifier is used in URLs, invoices,
emails, and support conversations. It must be:

- **Globally unique** within its family.
- **Monotonic** — sortable by creation order.
- **Sequential without gaps** in normal flow (gaps allowed on aborted
  transactions).
- **Auto-generated at INSERT** — never supplied by clients.

## Format catalog

| Entity | Format | Sequence | Example |
|---|---|---|---|
| `public.key_orders.order_number` | `ORD-LLV-000000` | `public.key_order_number_seq` | `ORD-LLV-000042` |
| `public.technical_orders.order_number` | `ORD-TEC-000000` | `public.technical_order_number_seq` | `ORD-TEC-000042` |
| `support.tickets.ticket_number` | `SOP-YYYY-000000` | `support.ticket_number_seq` (**no annual reset**) | `SOP-2026-000123` |

- Padding: 6 digits, zero-padded.
- The `YYYY` in ticket numbers is captured at generation time but the
  underlying sequence does NOT reset annually — the year is
  informational only.

## Generation mechanism

### Order numbers

Defined in
`supabase/migrations/20260818000080_orders_sequences.sql:19-45`:

```sql
create sequence public.key_order_number_seq;
create or replace function public.gen_key_order_number()
returns text language plpgsql
as $$ begin
  return 'ORD-LLV-' || lpad(nextval('public.key_order_number_seq')::text, 6, '0');
end $$;

create sequence public.technical_order_number_seq;
create or replace function public.gen_technical_order_number()
returns text language plpgsql
as $$ begin
  return 'ORD-TEC-' || lpad(nextval('public.technical_order_number_seq')::text, 6, '0');
end $$;
```

Bound at column-default level:

- `public.key_orders.order_number`
  (`supabase/migrations/20260818000081_key_orders_tables.sql:23`) —
  `text not null unique default public.gen_key_order_number()`.
- `public.technical_orders.order_number` — analogous default.

### Ticket numbers

Defined in
`supabase/migrations/20260808000014_support_tickets.sql:21-35`:

```sql
create sequence support.ticket_number_seq;
create or replace function support.gen_ticket_number()
returns text language plpgsql
as $$ begin
  return format('SOP-%s-%s',
                to_char(now(), 'YYYY'),
                lpad(nextval('support.ticket_number_seq')::text, 6, '0'));
end $$;

create table support.tickets (
  ticket_number  text not null unique default support.gen_ticket_number(),
  ...
);
```

## Uniqueness guarantees

- Sequences are safe under concurrency — `nextval` is atomic and
  never returns duplicates.
- `text not null unique` at column level provides a belt+suspenders
  guarantee against manual insertion accidents.

## Gaps

Gaps are **expected**:

- Rolled-back transactions consume `nextval` but do not commit the
  row.
- The sequence is monotonic, not "gap-free". Do not rely on
  `count(*)` matching `max(order_number)`.

## Permissions

- `gen_key_order_number` and `gen_technical_order_number` are
  `grant execute ... to authenticated, service_role`
  (`orders_sequences.sql:52-53`).
- Sequences: `grant usage, select on sequence
  public.key_order_number_seq to authenticated, service_role`
  (`key_orders_tables.sql:161`).

## Cross-cutting effects

- **URL routing** — `/llaves/:keyOrderId` uses the UUID, not the
  order_number. But UI tables display `order_number` as the primary
  identifier column (see
  `ServicioTecnicoTable.tsx:36`).
- **Search** — `useAllOrders` filters by
  `order_number.ilike('%<term>%')` in
  `apps/admin/src/hooks/useAllOrders.ts`.
- **Historial hub** — the shared `/ordenes` view UNIONs both order
  types by `order_number` order (`all_orders_view.sql`).

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| Client-supplied `order_number` colliding | UNIQUE constraint | Rejected |
| Sequence exhausted (highly unlikely) | postgres wraps | Would fail INSERT with unique violation |
| Manual `nextval` calls in ad-hoc scripts | No guard | Would create a gap; harmless |

## Known gaps

1. **The `YYYY` component of `ticket_number` uses `now()` at
   generation time**, but the sequence does not reset annually.
   Effect: an odd-looking ticket like `SOP-2026-000999` might be
   followed by `SOP-2027-001000`. This is intentional per the
   comment on `gen_ticket_number` but may confuse operators who
   expect annual reset.
2. **No pgTAP coverage listed for the generators**. The default
   binding is safe by construction but a test that asserts the
   format regex and monotonicity would be worth adding.

## QA checklist

- [ ] Create 3 key orders in a row → verify `order_number` runs
      `ORD-LLV-00000N`, `N+1`, `N+2`.
- [ ] Create 3 technical orders → verify `ORD-TEC-*` counterpart.
- [ ] Create 3 tickets → verify
      `SOP-<current_year>-00000N`, `N+1`, `N+2`.
- [ ] Roll back a create attempt → verify the next successful
      create skips one number (gap expected).
- [ ] Search `/ordenes` by partial number (e.g. `ORD-TEC-0000`) →
      verify matches paginate correctly.

## Related flows

- [[key-order-lifecycle]] — consumer.
- [[technical-order-lifecycle]] — consumer.
- [[realtime-channels]] — orthogonal.
