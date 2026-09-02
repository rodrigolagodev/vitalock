# Manual Verification Checklist — terminal-state-immutability

## Pre-conditions

- Migration `20260901170000_add_terminal_immutability_triggers.sql` applied to remote (verified: all 3 trigger functions present in `information_schema.routines`).
- Admin app running locally or on staging with current code.

## Checklist

### 1. UI — Resolved ticket → Editar absent

1. Navigate to a ticket with status `resolved` in the Admin UI.
2. Verify the **Editar** button is NOT rendered in the page header.
3. Navigate to a ticket with status `open` or `in_progress`.
4. Verify the **Editar** button IS rendered.

Expected: button hidden for resolved/cancelled, visible for open/in_progress.

---

### 2. DB enforcement — Blocked UPDATE on resolved ticket

Run via Supabase SQL editor or `psql`:

```sql
UPDATE support.tickets
SET description = 'attempt to modify'
WHERE status = 'resolved'
LIMIT 1;
```

Expected: error `P0001 — TICKETS_TERMINAL: cannot modify tickets row (status: resolved)`.

Verify same for `status = 'cancelled'`.

---

### 3. DB enforcement — `mark_technical_order_invoiced` still works on completed order

```sql
-- Pick a completed technical order
SELECT id FROM public.technical_orders WHERE status = 'completed' LIMIT 1;

-- Invoke the RPC (replace 'ORDER-ID' with the actual id)
SELECT mark_technical_order_invoiced('ORDER-ID');
```

Expected: success. `completed → invoiced` must NOT be blocked (completed is not terminal).

---

### 4. `resolve_ticket` still works on in_progress ticket

```sql
-- Pick an in_progress ticket
SELECT id FROM support.tickets WHERE status = 'in_progress' LIMIT 1;

-- Invoke the RPC (replace 'TICKET-ID')
SELECT resolve_ticket('TICKET-ID', 'Resolution notes here', NULL, NULL);
```

Expected: success. `in_progress → resolved` is not blocked (in_progress is not terminal).

---

### 5. UI — Invoiced key order → pickup action absent in items table

1. Navigate to a key order with status `invoiced` in the Admin UI.
2. Open the Ítems section.
3. Verify no "Registrar retiro" action is available for any item.
4. Navigate to a key order with status `ready_for_pickup`.
5. Verify the pickup action IS available.

Expected: `canRegisterPickup=false` for invoiced/cancelled orders, `true` for ready_for_pickup when not terminal.

---

## Result

| Check | Status | Notes |
|-------|--------|-------|
| 1. Resolved ticket Editar absent | | |
| 2. DB rejects UPDATE on resolved | | |
| 3. completed → invoiced succeeds | | |
| 4. in_progress → resolved succeeds | | |
| 5. Invoiced order pickup absent | | |
