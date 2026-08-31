# SDD Design: logic-consolidation-shared-hooks-and-postgres

## Chosen approach

Ship six independently reviewable slices (A–F) that split cleanly along two axes: (1) pure TypeScript extractions into `packages/shared` for cross-app duplication with zero migration risk (A, B); and (2) atomic per-slice bundles that pair one migration + `database.types.ts` regen + hook rewrite + tests in a single commit for each Postgres-first anti-pattern (C, D, E, F). Shared code lives under the existing `packages/shared/src/errors/` and a new `packages/shared/src/hooks/` module; new server surfaces are added exclusively via additive migrations (RPCs and views) and consumed through thin wrappers in `packages/supabase/src/rpc/tickets.ts`. Cross-schema views default to `SECURITY INVOKER` and only escalate on documented RLS evidence. This keeps every slice under the 800 LOC review budget, contains typegen drift to one slice, and lets AP-1 (the data-integrity defect) ship as soon as A/B unblock a future third app.

---

## Key ADRs

### ADR-1: Cross-schema view name and location

**Context.** Slice F needs a view joining `support.tickets`, `public.buildings`, and `public.administrations`. PostgREST exposes views in the schema where they are defined; the current `support` schema is exposed by PostgREST (installer already queries `support.tickets`). Placing the view in `support` co-locates it with the primary driving table (`support.tickets`) and its RLS policies. Placing it in `public` would require an extra schema-qualification hop on the installer client and mix cross-schema view artifacts into the public namespace.

**Decision.** Create the view as **`support.installer_tickets_with_context`**. It stays adjacent to `support.tickets`, is exposed automatically by PostgREST since `support` is already in the exposed-schemas list, and inherits the mental model that installer-scoped read surfaces belong under `support`.

**Consequences.** Installer hooks call `supabase.schema('support').from('installer_tickets_with_context')`. RLS from `support.tickets` propagates through the view under `SECURITY INVOKER` (see ADR-2). Any future admin consumer that wants the same denormalized shape queries the same view; there is no `public` duplicate.

---

### ADR-2: `SECURITY DEFINER` vs `SECURITY INVOKER` for cross-schema view

**Context.** Postgres 15 introduced `security_invoker` view option (default remains `SECURITY DEFINER` for backward compat unless explicitly set). RLS on `support.tickets` filters by `assigned_staff_id = auth.uid()`; RLS on `public.buildings` and `public.administrations` grants SELECT to authenticated roles for rows the installer's tickets reference. INVOKER runs the underlying SELECTs as the caller and enforces each table's RLS separately. DEFINER runs as the view owner and bypasses caller RLS on the joined tables.

**Decision.** Default **`WITH (security_invoker = true)`**. Only escalate to `SECURITY DEFINER` if a pgTAP INVOKER test as installer role returns zero rows for a ticket the installer legitimately owns because RLS on `public.buildings` or `public.administrations` denies the join row. If escalation is required, restrict the view SELECT list to a hardcoded safe column set (ticket columns + `buildings.name` + `buildings.address` + `administrations.company_name`) and add a `WHERE assigned_staff_id = (SELECT auth.uid())` filter inside the view body so the DEFINER-owned SELECT cannot leak tickets across installers.

**Consequences.** Under INVOKER, the view is transparent to RLS and no trust boundary widens. Under DEFINER (only if forced), the view becomes the trust boundary and needs its own audit — the hardcoded SELECT list and internal `auth.uid()` filter are the compensating controls. The decision is verified by the pgTAP scenarios in REQ-DB-TICKETS-VIEW-1 (installer sees own tickets; other staff sees zero) before the hook migration lands.

---

### ADR-3: Building linkage in order summary views

**Context.** REQ-DB-ORDERS-VIEW-1 allows either (a) a `building_ids uuid[]` aggregated column or (b) a PostgREST-embed-friendly items relationship. Option (a) requires PostgREST array operators (`.cs.` / `.ov.`) which the current admin hooks do not use elsewhere; the array is a single value per order row but forces the client to switch filter grammar. Option (b) relies on PostgREST embed filtering (`items.building_id=eq.<uuid>`) working through a view, which requires a resource relationship on the items table pointing at the view. PostgREST does not auto-detect FKs from views to tables, but does honor an explicit computed relationship or a base-table-derived embed if the view exposes the join key.

**Decision.** Ship option **(b) via embed-friendly items relationship**: `key_orders_summary` and `technical_orders_summary` expose `id, order_number, company_name, created_at, status, administration_id` and PostgREST embeds `key_order_items` / `technical_order_items` off `order_id`. Filtering by building becomes `.select('*, items:key_order_items(*)').eq('items.building_id', buildingId)` (or `.filter('items.building_id', 'eq', <uuid>)`). Company_name filter uses `.ilike('company_name', ...)` directly on the view column. **Fallback**: if PostgREST embed filtering on a view resource does not honor the FK relationship, ship option (a) — add `building_ids uuid[]` as a scalar column computed via `array_agg(distinct building_id)` in the view body and filter with `.contains('building_ids', [buildingId])`. The tasks phase confirms embed filterability with a smoke test before writing the migration; if it fails, tasks pivot to (a) without new spec work.

**Consequences.** Approach (b) keeps the client's filter grammar identical to existing embed patterns and PostgREST is authoritative for the join. Approach (a) is simpler SQL but changes admin's client-side filter grammar for orders. The `pg_trgm` GIN index on `administrations.company_name` (REQ-DB-ORDERS-VIEW-1 req 5) is required under both options.

---

### ADR-4: Authorization table name and schema

**Context.** REQ-DB-COMPLETE-AUTH-1 references "the authorizations table" generically. Live code at `apps/installer/src/hooks/useCompleteAuthorizations.ts` lines 29–37 and 41–50 calls `supabase.schema('operations').from('key_authorizations').update({...})` for both branches.

**Decision.** The target table is **`operations.key_authorizations`**. `complete_authorizations` RPC UPDATE targets that exact table. Columns touched: `sync_state` (values `'installed'` / `'removed'`), `installed_by_staff_id`, `installed_at`, `removed_by_staff_id`, `removed_at`. Both branches share the `p_staff_id` and `p_timestamp` arguments.

**Consequences.** The pgTAP file `supabase/tests/rpc/complete_authorizations.sql` seeds `operations.key_authorizations` rows with `sync_state IN ('pending_install', 'pending_removal')` for happy-path and asserts terminal state after the RPC call. RLS test uses the installer role that already has UPDATE on `operations.key_authorizations` (proven by the fact that the current two-step pattern works). Terminal-state guard (req 8) is implemented as a `WHERE sync_state IN ('pending_install', 'pending_removal')` clause with a post-UPDATE `GET DIAGNOSTICS row_count` check that raises when the count differs from the array length.

---

### ADR-5: P0001 substrings enumerated

**Context.** REQ-SHARED-ERROR-1.7 needs a deterministic list of P0001 message substrings the shared handler recognizes. Live code at `apps/admin/src/hooks/mapMutationError.ts` lines 73–96 matches P0001 on lowercased `err.message` against exactly four substrings, in order, with a generic fallback.

**Decision.** The shared handler recognizes **exactly these four P0001 substrings** (case-insensitive `err.message.toLowerCase().includes(...)`), in this fixed order:

1. `configure_key` → "Error al configurar la llave. Revisá los datos."
2. `create_order` → "Error al crear la orden. Revisá los datos."
3. `replace` → "No se pudo completar el reemplazo. Revisá los datos."
4. `record_order_key_pickup` → "Error al registrar el retiro. La orden debe estar lista para retiro."

Fallback for any other P0001 message: "Error del servidor. Intentá de nuevo." Two new substrings that ship with slices C and E are added to the shared built-in list at that time, not in slice A:

- Slice C (`create_and_assign_equipment`): substring `create_and_assign_equipment` → "Error al crear y asignar el equipo. Revisá los datos."
- Slice E (`complete_authorizations`): substring `complete_authorizations` → "Error al completar las autorizaciones. Revisá los datos."

Callers that need additional P0001 messages inject via `extraHandlers['P0001']` (a function receiving the PostgrestError) which takes precedence over the built-in ordered list (REQ-SHARED-ERROR-1 req 4).

**Consequences.** The vitest scenario `REQ-SHARED-ERROR-1.7` uses `"configure_key"` as the deterministic substring. Slice C and E each add one shared built-in P0001 entry in the same commit as their RPC migration — this is inside the same slice, not a slice-A retroactive change.

---

### ADR-6: Extraction location and module shape for shared error mapping

**Context.** Spec assumes `packages/shared/src/errors/toastMutationError.ts`. `packages/shared/src/errors/` already contains `parseSupabaseError.ts` (with `isNetworkError`, `isPostgrestError`) and `index.ts`. Toast facade (`sonner`) is currently imported directly in each app's `mapMutationError.ts`. Coupling `sonner` inside `packages/shared` would force every future consumer to depend on `sonner`; keeping the shared function pure and letting each app inject its toast facade is more portable.

**Decision.** Confirmed location: **`packages/shared/src/errors/toastMutationError.ts`**. Module shape:

```ts
// packages/shared/src/errors/toastMutationError.ts
import type { PostgrestError } from '@supabase/supabase-js';
import { isNetworkError, isPostgrestError } from './parseSupabaseError';

export type ExtraHandler = (err: PostgrestError) => string | undefined;
export type ExtraHandlersMap = Partial<Record<string, ExtraHandler>>;

export interface ToastMutationErrorOptions {
  extraHandlers?: ExtraHandlersMap;
  toast?: (message: string) => void; // injected sonner facade
}

// Returns the resolved message string; also invokes toast if provided.
export function toastMutationError(err: unknown, opts?: ToastMutationErrorOptions): string;
```

Behavior: network-error branch first, then SQLSTATE switch (`23505`, `23514`, `23503`, `42501`, `P0001`), then unknown-SQLSTATE fallback. For each SQLSTATE the `extraHandlers[code]` is called first; if it returns a non-empty string that string wins, otherwise the built-in ordered substring list runs. The optional `toast` callback fires with the resolved string; when omitted the caller can wire its own toast.

Each app then keeps a thin wrapper (`apps/{admin,installer}/src/hooks/mapMutationError.ts` is deleted per REQ-SHARED-ERROR-1 req 6; a new one-liner adapter lives at `apps/{admin,installer}/src/lib/errors/toast.ts` if needed, or callers import from `@vitalock/shared` directly with an inline `extraHandlers` const). Admin's `extraHandlers['23505']` covers `units_one_admin_per_building`, `administrations_tax_id_key`, `orders_order_number`, and `particulares` — the four admin-only branches from current live code (lines 23–41).

**Consequences.** `packages/shared` gains no runtime dependency on `sonner`. Test file `packages/shared/src/errors/__tests__/toastMutationError.test.ts` mocks the injected `toast` callback and asserts return strings. Admin's `packages/shared` re-export is added to `packages/shared/src/errors/index.ts`.

---

### ADR-7: Factory shape for `useConfigureTechnicalTicketEquipment`

**Context.** Exploration shows the two apps share a byte-identical `mutationFn` calling `configureTechnicalTicketEquipment` RPC and diverge only in `onSuccess` (invalidation set + toast copy) and `staffId` source. REQ-SHARED-CONFIG-EQUIP-1 mandates a factory with `onSuccess` and `mapMutationError` options and forbids hardcoded query keys inside the factory. Two shapes exist: (i) a top-level React hook factory `createUseConfigureTechnicalTicketEquipment(options)` returning `() => useMutation({...})`; or (ii) a lower-level util `configureTechnicalTicketEquipment(supabase, input)` where each app writes its own thin `useMutation` wrapper.

**Decision.** Ship the **top-level factory** `createUseConfigureTechnicalTicketEquipment(options)`. Rationale: (a) it directly satisfies REQ-SHARED-CONFIG-EQUIP-1 which prescribes factory options `onSuccess` and `mapMutationError`; (b) it removes the byte-identical `useMutation` boilerplate from both apps (net LOC win); (c) the lower-level util is redundant because `@vitalock/supabase/rpc/tickets` already exports `configureTechnicalTicketEquipment` as the RPC wrapper — that IS the lower-level util. Signature:

```ts
// packages/shared/src/hooks/useConfigureTechnicalTicketEquipment.ts
export interface CreateUseConfigureTechnicalTicketEquipmentOptions {
  onSuccess: (vars: ConfigureTechnicalTicketEquipmentInput) => void | Promise<void>;
  mapMutationError: (error: unknown) => void;
}
export function createUseConfigureTechnicalTicketEquipment(
  opts: CreateUseConfigureTechnicalTicketEquipmentOptions,
): () => UseMutationResult<void, unknown, ConfigureTechnicalTicketEquipmentInput>;
```

Neither `useAuthContext` nor `useQueryClient` runs inside the factory — the app-side `onSuccess` closes over its own `queryClient` and `staffId`.

**Consequences.** A new subpath `packages/shared/src/hooks/` is created with an `index.ts` re-exporting the factory. `packages/shared/src/index.ts` re-exports from `./hooks` alongside existing barrels. The factory has one narrow test in `packages/shared/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` covering scenarios REQ-SHARED-CONFIG-EQUIP-1.1 and 1.2; app-side tests keep their invalidation-set assertions (REQ-SHARED-CONFIG-EQUIP-1.3 / 1.4).

---

### ADR-8: Migration ordering per slice

**Context.** Slices C, D, E, F each ship one migration + one `database.types.ts` regen + one or more hook rewrites + tests. If the migration lands before the typegen, downstream apps stop compiling; if the hook rewrite lands before the typegen, the same. If tests land after the hook rewrite in a separate commit, the intermediate commit is untested.

**Decision.** Every migration-bearing slice ships in **one atomic commit** in this exact order inside the commit's file list: (1) `supabase/migrations/<timestamp>_<slice>.sql` (forward + paired rollback file `<timestamp>_<slice>_rollback.sql` per ADR-9); (2) `packages/supabase/src/database.types.ts` regenerated via `pnpm --filter @vitalock/supabase typegen`; (3) `packages/supabase/src/rpc/tickets.ts` wrapper additions (slices C, E) or view-consuming query changes (slices D, F); (4) hook rewrite in `apps/*/src/hooks/`; (5) test file adds/updates (vitest + pgTAP). Reviewer sees migration + types + code + tests together and can run the whole suite from that single commit's tree.

**Consequences.** No intermediate commit exists where the migration disagrees with `database.types.ts`. Bisect against a hook regression lands on the commit that introduced the new server surface, not a stale-types intermediate. Slice A and B have no migration and no typegen so this policy is a no-op for them.

---

### ADR-9: Rollback strategy

**Context.** RPCs and views are additive; the only rollback failure surface is if a downstream consumer starts calling the new server surface, then the migration is reverted, and the consumer breaks. Because slice commits pair migration + hook rewrite, reverting the commit reverts both.

**Decision.** Every migration ships with a **paired rollback migration file** in the same commit at `supabase/migrations/<timestamp>_<slice>_rollback.sql` containing the reverse operations:

- Slice C: `DROP FUNCTION IF EXISTS public.create_and_assign_equipment(uuid, uuid, text, text, text, text);`
- Slice D: `DROP INDEX IF EXISTS public.administrations_company_name_trgm_idx; DROP VIEW IF EXISTS public.technical_orders_summary; DROP VIEW IF EXISTS public.key_orders_summary;`
- Slice E: `DROP FUNCTION IF EXISTS public.complete_authorizations(uuid[], uuid[], uuid, timestamptz);`
- Slice F: `DROP VIEW IF EXISTS support.installer_tickets_with_context;`

The rollback file is NOT applied by `supabase db push` (naming convention keeps it out of the main migration stream); it is a documented recovery script. **Hook and TypeScript rewrites are rolled back by reverting the slice commit** — `git revert <commit>` restores the previous hook file, typegen, and RPC wrapper simultaneously. Combined recovery for a live-production issue: revert the commit, apply the rollback SQL script, redeploy.

**Consequences.** Every slice PR review includes reading the rollback SQL. `DROP ... IF EXISTS` is safe to run on an environment where the migration was already reverted or never applied. No data loss risk because every dropped object is either newly added (RPCs, views) or non-persistent metadata (indexes).

---

### ADR-10: Test scaffolding for hooks without coverage

**Context.** `useMutateTicketEquipment` and `useCompleteAuthorizations` currently have no vitest coverage. REQ-CLIENT-EQUIP-1 req 4 and REQ-CLIENT-AUTH-1 req 3 require coverage. Full coverage is out of scope per proposal.

**Decision.** Each of slices C and E ships **minimal happy-path + one error-path test** for its target hook, written **before** the refactor (test-first inside the slice). Concrete files:

- Slice C: `apps/admin/src/hooks/__tests__/useMutateTicketEquipment.test.ts` — cases: (1) successful `createAndAssignEquipment` returns UUID (mock RPC resolves); (2) failed `createAndAssignEquipment` surfaces PostgrestError (mock RPC rejects with `code: '23505'`).
- Slice E: `apps/installer/src/hooks/__tests__/useCompleteAuthorizations.test.ts` — cases: (1) install-only batch success (mock RPC resolves); (2) remove-only batch success (mock RPC resolves); (3) mixed batch success (mock RPC resolves); (4) RPC failure with `mapMutationError` called (mock RPC rejects with `code: '42501'`).

Both test files mock `@vitalock/supabase/rpc/tickets` at the module level and use `@testing-library/react`'s `renderHook` with a `QueryClientProvider`. Coverage beyond these scenarios is explicitly out of scope for this change.

**Consequences.** Tests land in the same atomic commit as the hook rewrite (per ADR-8). Any behavioral regression in the two currently-uncovered hooks now has a lower-bound guard. Future changes can extend these test files, but this change does not backfill coverage on unrelated branches of those hooks.

---

## Component diagram

```
                              packages/shared
                              +---------------+
                              | errors/       |
                              |   toastMutationError.ts   <── Slice A
                              |   parseSupabaseError.ts   (unchanged)
                              | hooks/        |
                              |   useConfigureTechnicalTicketEquipment.ts  <── Slice B
                              +-------+-------+
                                      |
                       +--------------+---------------+
                       |                              |
                 apps/admin/src/hooks           apps/installer/src/hooks
                       |                              |
                       |    packages/supabase/src/rpc/tickets.ts
                       |    +--------------------------+
                       |    | configureTechnicalTicketEquipment (existing)
                       |    | create_and_assign_equipment       <── Slice C
                       |    | complete_authorizations           <── Slice E
                       |    +-----------+--------------+
                       |                |
                       |         packages/supabase/src/database.types.ts
                       |         (regen in C, D, E, F)
                       |
                 Postgres
                 +---------------------------------------------------+
                 | public.create_and_assign_equipment      <── C     |
                 | public.key_orders_summary               <── D     |
                 | public.technical_orders_summary         <── D     |
                 | idx administrations_company_name_trgm   <── D     |
                 | public.complete_authorizations          <── E     |
                 | support.installer_tickets_with_context  <── F     |
                 +---------------------------------------------------+

Dependency order:  A ──┐
                       ├── C ──┐
                   B ──┤       ├── (merge-ready in any order)
                       ├── E ──┤
                       ├── D ──┤
                       └── F ──┘
```

Slices A and B are pure TypeScript and unblock all Postgres slices (C–F) by centralizing the error mapper and the mutation factory that C and E consume. Slices C, D, E, F are mutually independent once A and B land.

---

## Data model changes

### Slice C — RPC `public.create_and_assign_equipment`

```sql
CREATE OR REPLACE FUNCTION public.create_and_assign_equipment(
  p_ticket_id       uuid,
  p_building_id     uuid,
  p_serial          text,
  p_model           text,
  p_description     text,
  p_access_type     text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_equipment_id uuid;
  v_updated int;
BEGIN
  INSERT INTO operations.equipment (building_id, serial, model, description, access_type)
  VALUES (p_building_id, p_serial, p_model, p_description, p_access_type)
  RETURNING id INTO v_equipment_id;

  UPDATE support.tickets SET equipment_id = v_equipment_id WHERE id = p_ticket_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'ticket not found: %', p_ticket_id USING ERRCODE = 'P0001';
  END IF;

  RETURN v_equipment_id;
END;
$$;
```

Column list on `operations.equipment` matches current live-code INSERT in `useMutateTicketEquipment.ts`. Duplicate serial in building surfaces as the underlying `23505` unique constraint (existing `equipment_serial_building_id_key`). RLS on both tables is enforced by INVOKER.

### Slice D — Views + trigram index

```sql
CREATE INDEX IF NOT EXISTS administrations_company_name_trgm_idx
  ON public.administrations USING gin (company_name gin_trgm_ops);

CREATE OR REPLACE VIEW public.key_orders_summary
WITH (security_invoker = true) AS
SELECT
  ko.id, ko.order_number, ko.status, ko.created_at, ko.administration_id,
  a.company_name
FROM public.key_orders ko
LEFT JOIN public.administrations a ON a.id = ko.administration_id;

CREATE OR REPLACE VIEW public.technical_orders_summary
WITH (security_invoker = true) AS
SELECT
  t.id, t.order_number, t.status, t.created_at, t.administration_id,
  a.company_name
FROM public.technical_orders t
LEFT JOIN public.administrations a ON a.id = t.administration_id;
```

Building linkage under ADR-3 option (b) is resolved client-side via PostgREST embed of `key_order_items` / `technical_order_items`. If option (a) fallback triggers in tasks, add `building_ids uuid[]` computed via `array_agg(distinct oi.building_id)` with a `LEFT JOIN <items>` and `GROUP BY` in the view body.

### Slice E — RPC `public.complete_authorizations`

```sql
CREATE OR REPLACE FUNCTION public.complete_authorizations(
  p_install_ids uuid[],
  p_remove_ids  uuid[],
  p_staff_id    uuid,
  p_timestamp   timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_expected int;
  v_actual int;
BEGIN
  IF coalesce(array_length(p_install_ids, 1), 0) > 0 THEN
    v_expected := array_length(p_install_ids, 1);
    UPDATE operations.key_authorizations
       SET sync_state = 'installed',
           installed_by_staff_id = p_staff_id,
           installed_at = p_timestamp
     WHERE id = ANY(p_install_ids)
       AND sync_state = 'pending_install';
    GET DIAGNOSTICS v_actual = ROW_COUNT;
    IF v_actual <> v_expected THEN
      RAISE EXCEPTION 'complete_authorizations: install batch mismatch (expected %, got %)',
        v_expected, v_actual USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF coalesce(array_length(p_remove_ids, 1), 0) > 0 THEN
    v_expected := array_length(p_remove_ids, 1);
    UPDATE operations.key_authorizations
       SET sync_state = 'removed',
           removed_by_staff_id = p_staff_id,
           removed_at = p_timestamp
     WHERE id = ANY(p_remove_ids)
       AND sync_state = 'pending_removal';
    GET DIAGNOSTICS v_actual = ROW_COUNT;
    IF v_actual <> v_expected THEN
      RAISE EXCEPTION 'complete_authorizations: remove batch mismatch (expected %, got %)',
        v_expected, v_actual USING ERRCODE = 'P0001';
    END IF;
  END IF;
END;
$$;
```

Empty-arrays no-op returns immediately (both IF branches skipped). Terminal-state guard is the `AND sync_state = 'pending_*'` clause combined with the row-count check.

### Slice F — View `support.installer_tickets_with_context`

```sql
CREATE OR REPLACE VIEW support.installer_tickets_with_context
WITH (security_invoker = true) AS
SELECT
  t.*,                                   -- all support.tickets columns
  b.name       AS building_name,
  b.address    AS building_address,
  b.administration_id,
  a.company_name AS administration_company_name
FROM support.tickets t
LEFT JOIN public.buildings b ON b.id = t.building_id
LEFT JOIN public.administrations a ON a.id = b.administration_id;
```

RLS on `support.tickets` is enforced by INVOKER. If pgTAP evidence forces DEFINER escalation (see ADR-2), the SELECT list is frozen to an explicit column set and the view body gains `WHERE t.assigned_staff_id = (SELECT auth.uid())`.

---

## Interface changes

**`packages/shared/src/errors/toastMutationError.ts`** (new). Exported `toastMutationError(err, opts?)` per ADR-6. `packages/shared/src/errors/index.ts` re-exports it.

**`packages/shared/src/hooks/`** (new subpath). `useConfigureTechnicalTicketEquipment.ts` exports `createUseConfigureTechnicalTicketEquipment(opts)` per ADR-7. `packages/shared/src/hooks/index.ts` re-exports. `packages/shared/src/index.ts` gains `export * from './hooks';`.

**`packages/supabase/src/rpc/tickets.ts`** gains two new wrappers in slice C and slice E respectively:

- `createAndAssignEquipment(input: { ticketId, buildingId, serial, model, description, accessType }): Promise<string>` (returns UUID)
- `completeAuthorizations(input: { installIds, removeIds, staffId, timestamp }): Promise<void>`

Both wrappers call `supabase.rpc('create_and_assign_equipment', {...})` / `supabase.rpc('complete_authorizations', {...})` and throw on `.error`.

**`packages/supabase/src/database.types.ts`** regenerated in slices C, D, E, F (see ADR-8, REQ-TYPEGEN-1).

**Hook signatures.** No public signature changes to consumer hooks — `useMutateTicketEquipment`, `useCompleteAuthorizations`, `useKeyOrders`, `useTechnicalOrders`, `useAssignedTickets`, `useTicketHistory` retain their existing exported shapes. Only their internal query bodies change.

**Deletions.** `apps/admin/src/hooks/mapMutationError.ts` and `apps/installer/src/hooks/mapMutationError.ts` are deleted in slice A per REQ-SHARED-ERROR-1 req 6; all ~73 callers update their import to `import { toastMutationError } from '@vitalock/shared'`. `apps/admin/src/hooks/useConfigureTechnicalTicketEquipment.ts` and `apps/installer/src/hooks/useConfigureTechnicalTicketEquipment.ts` collapse to a 3-line factory call in slice B.

---

## Testing strategy

### Vitest updates by file

- **Slice A**
  - New: `packages/shared/src/errors/__tests__/toastMutationError.test.ts` — nine scenarios REQ-SHARED-ERROR-1.1 through 1.9.
  - Update: existing admin/installer `mapMutationError.test.ts` files migrate to import from `@vitalock/shared` or are deleted if the coverage is fully in the shared test.
- **Slice B**
  - New: `packages/shared/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` — REQ-SHARED-CONFIG-EQUIP-1.1 and 1.2.
  - Update: `apps/admin/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` — assert admin invalidation set (REQ-SHARED-CONFIG-EQUIP-1.3).
  - Update: `apps/installer/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` — assert installer invalidation set (REQ-SHARED-CONFIG-EQUIP-1.4).
- **Slice C**
  - New: `apps/admin/src/hooks/__tests__/useMutateTicketEquipment.test.ts` — happy path + PostgrestError path (ADR-10).
- **Slice D**
  - Update: `apps/admin/src/hooks/__tests__/useKeyOrders.test.ts` — mock view-backed query; drop client-side filter assertion; add server-side `.ilike` assertion.
  - Update: `apps/admin/src/hooks/__tests__/useTechnicalOrders.test.ts` — same shape.
- **Slice E**
  - New: `apps/installer/src/hooks/__tests__/useCompleteAuthorizations.test.ts` — three happy paths + error path (ADR-10).
- **Slice F**
  - Update: `apps/installer/src/hooks/__tests__/useAssignedTickets.test.ts` — mock view-backed single query; drop stitching assertions; keep realtime subscription assertion.
  - Update: `apps/installer/src/hooks/__tests__/useTicketHistory.test.ts` — mock view-backed single query.

### pgTAP new files

- `supabase/tests/rpc/create_and_assign_equipment.sql` (slice C) — five scenarios REQ-DB-CREATE-ASSIGN-EQUIP-1.1 through 1.5.
- `supabase/tests/rpc/complete_authorizations.sql` (slice E) — seven scenarios REQ-DB-COMPLETE-AUTH-1.1 through 1.7.
- `supabase/tests/views/order_summaries.sql` (slice D) — four scenarios REQ-DB-ORDERS-VIEW-1.1 through 1.4.
- `supabase/tests/views/installer_tickets_with_context.sql` (slice F) — three scenarios REQ-DB-TICKETS-VIEW-1.1 through 1.3, plus one extra evidence scenario that determines whether ADR-2 must escalate to DEFINER (installer sees own tickets and joined building rows under INVOKER).

### Coverage expectations

Per ADR-10, slices C and E deliver minimal happy-path + one error-path only; full branch coverage of the two currently-uncovered hooks is out of scope. Existing suites for other hooks maintain their current pass rate; no new failing tests are permitted at slice-merge boundaries.

---

## Delivery order

Recommended chained order with explicit dependency arrows:

```
Slice A (mapMutationError shared)       ──► unblocks Slice B, C, E error copy
Slice B (config-equip factory)          ──► unblocks admin+installer re-exports
Slice C (create_and_assign_equipment)   ──► depends on A for shared error mapping
Slice D (order summary views)           ──► independent of C, E; depends on A
Slice E (complete_authorizations)       ──► depends on A for shared error mapping
Slice F (installer tickets view)        ──► independent of C/D/E; depends on A
```

Preferred merge sequence: **A → B → C → D → E → F**. A/B ship first as pure-TypeScript, no-migration, low-risk unblockers. C ships next because AP-1 is the data-integrity defect flagged as the priority in the proposal. D/E/F may reorder based on reviewer availability; there is no hard ordering constraint among them. Each slice's atomic commit rule (ADR-8) means any two consecutive slices can be reviewed and merged in parallel by different reviewers without conflict, provided each rebases on the latest `main` before the atomic commit is prepared.
