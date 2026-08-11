# Delta for Ordenes Admin

## MODIFIED Requirements

### Requirement: Client Type Selection

The system MUST support two mutually exclusive client types: `administration`
and `particular`. Client type is chosen via radio button in OrdenFormSheet.
When `administration` is selected, the form MUST show an administration
combobox (populated via `useAdministrations`). When `particular` is selected,
the form MUST show a ParticularSelector (server-side search by name or DNI)
plus a QuickParticularCreateDialog link for inline creation; the submitted
order MUST carry `particular_id` (existing DNI match or inline-created row).
The flat `particular_full_name/dni/phone/email` fields MUST be retained as an
audit snapshot, auto-populated from the selected particular. The DB MUST
enforce a CHECK that `administration_id` is non-null when
`client_type='administration'` and `particular_full_name` is non-empty when
`client_type='particular'`.
(Previously: particular client type used plain inline text fields with no
entity linkage)

#### Scenario: Admin selects administration client type

- GIVEN the OrdenFormSheet is open
- WHEN the admin selects "Administración"
- THEN the administration combobox appears
- AND particular fields are hidden

#### Scenario: Admin selects particular client type

- GIVEN the OrdenFormSheet is open
- WHEN the admin selects "Particular"
- THEN the ParticularSelector and inline-create link appear
- AND the administration combobox is hidden

#### Scenario: Existing particular selected by search

- GIVEN a particular exists with DNI 30111222
- WHEN the admin searches, selects it, and submits
- THEN the order is created with particular_id pointing to that particular
- AND the flat particular_* snapshot is populated from the entity

#### Scenario: Inline-created particular linked on submit

- GIVEN no particular matches the order's buyer
- WHEN the admin creates the particular inline and submits
- THEN the new particular is linked as particular_id
- AND order and items are created atomically

#### Scenario: Administration client type requires administration_id

- GIVEN client_type is 'administration' and administration_id is null
- WHEN the admin attempts to submit
- THEN form validation blocks submission with a required-field error

---

### Requirement: Order Status State Machine

Orders MUST follow the state machine: `draft → in_preparation →
ready_for_pickup → completed`; any non-terminal state → `cancelled`.
The DB MUST enforce that status transitions are legal (no skip, no reverse
from terminal). Specific rules:

- `draft → in_preparation`: manual button on OrdenDetailPage
- `in_preparation → ready_for_pickup`: auto-transition via DB trigger when all
  non-cancelled key items reach `status='configured'`
- `ready_for_pickup → completed`: auto-transition evaluated at pickup
  registration — when ALL non-cancelled key items have `picked_up_at` set, the
  order becomes `completed`; evaluated in the pickup mutation logic (no
  recompute trigger this cycle)
- Any non-terminal → `cancelled`: manual "Cancelar orden" button

(Previously: `ready_for_pickup → completed` was DB-allowed with no UI or
automation this cycle)

#### Scenario: Manual start of preparation

- GIVEN order status is 'draft'
- WHEN the admin clicks "Iniciar preparación"
- THEN order status becomes 'in_preparation'
- AND the status badge updates on the detail page

#### Scenario: Auto-transition to ready_for_pickup

- GIVEN an order in 'in_preparation' with 2 key items both pending
- WHEN the admin configures both key items (each reaches 'configured')
- THEN the DB trigger fires and order status becomes 'ready_for_pickup'
- AND no manual admin action is required

#### Scenario: Cancelled item excluded from auto-transition check

- GIVEN an order in 'in_preparation' with 1 configured key item and 1 cancelled key item
- WHEN the trigger recomputes
- THEN the order transitions to 'ready_for_pickup' (cancelled item not counted)

#### Scenario: All keys picked up completes the order

- GIVEN an order in 'ready_for_pickup' with 2 configured key items
- WHEN the last pickup is registered (all items have picked_up_at)
- THEN the order status becomes 'completed'

#### Scenario: Some keys pending keeps the order ready

- GIVEN an order in 'ready_for_pickup' with 2 key items
- WHEN only 1 pickup is registered
- THEN the order status stays 'ready_for_pickup'

#### Scenario: Cancel order from any non-terminal state

- GIVEN order status is 'draft', 'in_preparation', or 'ready_for_pickup'
- WHEN the admin clicks "Cancelar orden" and confirms
- THEN order status becomes 'cancelled'

#### Scenario: Cancel blocked on terminal state

- GIVEN order status is 'completed' or 'cancelled'
- WHEN the admin attempts to cancel
- THEN the cancel button is absent or disabled

---

### Requirement: Error Mapping

`mapMutationError` MUST handle SQLSTATE 23505 (order_number uniqueness OR
duplicate particular DNI/unit) and 23503 (FK violation on order_item
operations) with Spanish-language friendly toasts. Unrecognized codes fall
back to a generic error toast.
(Previously: 23505 was mapped only for order_number collisions)

#### Scenario: 23505 mapped for order_number collision

- GIVEN the DB returns SQLSTATE 23505 on order creation
- WHEN mapMutationError processes the error
- THEN a toast describes the order number conflict in Spanish

#### Scenario: 23505 mapped for duplicate particular

- GIVEN the DB returns SQLSTATE 23505 while saving a particular (DNI or unit)
- WHEN mapMutationError processes the error
- THEN a toast explains the duplicate DNI or unit in Spanish

#### Scenario: 23503 mapped for FK violation

- GIVEN the DB returns SQLSTATE 23503 during configure-key save
- WHEN mapMutationError processes the error
- THEN a toast describes the referential integrity issue in Spanish

---

## ADDED Requirements

### Requirement: Pickup Person Selection

OrdenDetailPage MUST include a pickup section ("quién retira la llave") for
orders with a particular client. The section MUST offer: (a) a
ParticularSelector to pick an existing particular, (b) a
QuickParticularCreateDialog link for inline creation, and (c) a checkbox
"usar mismos datos de compra" that sets `pickup_particular_id =
particular_id`. Orders without a particular (administration client) MUST NOT
show the section this cycle.

#### Scenario: Checkbox reuses buyer as pickup person

- GIVEN a particular order with buyer particular P
- WHEN the admin checks "usar mismos datos de compra"
- THEN pickup_particular_id equals P
- AND no separate pickup search is required

#### Scenario: Explicit pickup person selected

- GIVEN a particular order
- WHEN the admin searches and selects a different particular Q as pickup person
- THEN pickup_particular_id equals Q
- AND the checkbox is unchecked

#### Scenario: Pickup person created inline

- GIVEN no suitable pickup particular exists
- WHEN the admin creates one via the dialog
- THEN the new particular is set as pickup_particular_id

#### Scenario: Section hidden for administration orders

- GIVEN an order with client_type 'administration'
- WHEN OrdenDetailPage renders
- THEN the pickup section is not shown
