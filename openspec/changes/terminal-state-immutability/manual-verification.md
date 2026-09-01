# Manual Verification — terminal-state-immutability

Run these checks after the migration is applied to the target DB and the code changes are deployed.

## 1. Ticket terminal immutability

### 1a. UI: Editar hidden for resolved ticket
- Navigate to a resolved ticket detail page in the admin app.
- **Expect**: the "Editar" button is NOT rendered in the header.

### 1b. UI: Editar hidden for cancelled ticket
- Navigate to a cancelled ticket detail page.
- **Expect**: the "Editar" button is NOT rendered.

### 1c. UI: Editar visible for in_progress ticket
- Navigate to an in_progress ticket detail page.
- **Expect**: the "Editar" button IS rendered.

### 1d. DB: direct UPDATE on resolved ticket rejected
```sql
UPDATE support.tickets
   SET description = 'test'
 WHERE status = 'resolved'
 LIMIT 1;
```
- **Expect**: error `P0001` with message starting `TICKETS_TERMINAL: cannot modify tickets row (status: resolved)`.

### 1e. DB: resolve_ticket on in_progress ticket still works
- Trigger the resolve flow from the installer app (or call `resolve_ticket(<id>)` directly on an in_progress ticket).
- **Expect**: ticket transitions to `resolved` without error.

## 2. Technical order terminal immutability

### 2a. DB: direct UPDATE on invoiced technical order rejected
```sql
UPDATE public.technical_orders
   SET notes = 'test'
 WHERE status = 'invoiced'
 LIMIT 1;
```
- **Expect**: `P0001` with message `TECHNICAL_ORDER_TERMINAL: cannot modify technical_orders row (status: invoiced)`.

### 2b. DB: mark_technical_order_invoiced on completed order still works
- Call `mark_technical_order_invoiced(<completed_order_id>)`.
- **Expect**: order transitions to `invoiced` without error.

## 3. Key order terminal immutability

### 3a. DB: direct UPDATE on invoiced key order rejected
```sql
UPDATE public.key_orders
   SET notes = 'test'
 WHERE status = 'invoiced'
 LIMIT 1;
```
- **Expect**: `P0001` with message `KEY_ORDER_TERMINAL: cannot modify key_orders row (status: invoiced)`.

### 3b. DB: mark_key_order_invoiced on completed order still works
- Call `mark_key_order_invoiced(<completed_key_order_id>)`.
- **Expect**: order transitions to `invoiced` without error.

### 3c. UI: "Registrar retiro" hidden for invoiced key order
- Navigate to an invoiced key order detail page.
- **Expect**: no "Registrar retiro" action in the items table.

### 3d. UI: "Registrar retiro" visible for ready_for_pickup key order
- Navigate to a ready_for_pickup key order detail page.
- **Expect**: "Registrar retiro" action is present for installed items with no pickup timestamp.

## 4. Trigger ordering sanity

### 4a. Terminal trigger fires before state machine
```sql
UPDATE support.tickets
   SET status = 'in_progress'
 WHERE status = 'resolved'
 LIMIT 1;
```
- **Expect**: `P0001` with prefix `TICKETS_TERMINAL:` (from the terminal trigger), NOT the state machine error. This confirms the terminal trigger fires first alphabetically.

## 5. No regressions on happy paths

### 5a. Full technical order flow
- Create a technical order → confirm → resolve ticket → mark invoiced.
- **Expect**: all transitions succeed.

### 5b. Full key order flow
- Create a key order → confirm → configure → install → pickup → complete → mark invoiced.
- **Expect**: all transitions succeed.
