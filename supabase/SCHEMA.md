# Vitalock — Database Schema Reference

> **Generated** by `scripts/gen-schema-doc.sh` from the database as of migration `20260911100000_revoke_anon_execute_on_internal_functions.sql`.
> Do not edit by hand — re-run `pnpm gen:schema-doc` after a migration; CI fails if this file is stale. For narrative (flows, auth model, business rules) see `FLOWS.md`.

## Tables

| Table                                | Columns | RLS | Policies |
| ------------------------------------ | ------: | :-: | -------: |
| `identity.audit_log`                 |       8 | ✅  |        1 |
| `identity.staff`                     |      10 | ✅  |        2 |
| `operations.equipment`               |      14 | ✅  |        2 |
| `operations.key_authorizations`      |      13 | ✅  |        3 |
| `public.administrations`             |      10 | ✅  |        2 |
| `public.buildings`                   |       9 | ✅  |        2 |
| `public.key_events`                  |       6 | ✅  |        2 |
| `public.key_order_items`             |      14 | ✅  |        1 |
| `public.key_orders`                  |      14 | ✅  |        1 |
| `public.particulares`                |       9 | ✅  |        1 |
| `public.products`                    |       8 | ✅  |        1 |
| `public.rfid_key_intended_equipment` |       3 | ✅  |        2 |
| `public.rfid_keys`                   |      16 | ✅  |        2 |
| `public.stock_movements`             |      13 | ✅  |        1 |
| `public.technical_order_items`       |      14 | ✅  |        1 |
| `public.technical_orders`            |      13 | ✅  |        1 |
| `public.units`                       |       9 | ✅  |        2 |
| `sales.bill_items`                   |      13 | ✅  |        1 |
| `sales.bills`                        |      14 | ✅  |        1 |
| `sales.key_request_items`            |       7 | ✅  |        1 |
| `sales.key_requests`                 |      25 | ✅  |        1 |
| `sales.payments`                     |      13 | ✅  |        1 |
| `sales.products`                     |       7 | ✅  |        1 |
| `sales.quote_items`                  |      10 | ✅  |        1 |
| `sales.quotes`                       |      15 | ✅  |        1 |
| `sales.recurring_charges`            |      11 | ✅  |        1 |
| `support.equipment_updates`          |      10 | ✅  |        2 |
| `support.ticket_comments`            |       5 | ✅  |        3 |
| `support.tickets`                    |      25 | ✅  |        3 |

## Columns

### `identity.audit_log`

| Column         | Type                     | Null | Default             |
| -------------- | ------------------------ | :--: | ------------------- |
| `id`           | uuid                     |  no  | `gen_random_uuid()` |
| `occurred_at`  | timestamp with time zone |  no  | `now()`             |
| `actor_id`     | uuid                     | yes  |                     |
| `subject_id`   | uuid                     |  no  |                     |
| `event_type`   | text                     |  no  |                     |
| `before_value` | text                     | yes  |                     |
| `after_value`  | text                     | yes  |                     |
| `metadata`     | jsonb                    |  no  | `'{}'::jsonb`       |

### `identity.staff`

| Column         | Type                     | Null | Default             |
| -------------- | ------------------------ | :--: | ------------------- |
| `id`           | uuid                     |  no  | `gen_random_uuid()` |
| `auth_user_id` | uuid                     | yes  |                     |
| `full_name`    | text                     |  no  |                     |
| `email`        | text                     | yes  |                     |
| `phone`        | text                     | yes  |                     |
| `role`         | text                     |  no  |                     |
| `status`       | text                     |  no  | `'active'::text`    |
| `notes`        | text                     | yes  |                     |
| `created_at`   | timestamp with time zone |  no  | `now()`             |
| `updated_at`   | timestamp with time zone |  no  | `now()`             |

### `operations.equipment`

| Column                  | Type                     | Null | Default             |
| ----------------------- | ------------------------ | :--: | ------------------- |
| `id`                    | uuid                     |  no  | `gen_random_uuid()` |
| `serial_number`         | text                     |  no  |                     |
| `model`                 | text                     | yes  |                     |
| `building_id`           | uuid                     |  no  |                     |
| `description`           | text                     |  no  |                     |
| `access_type`           | text                     | yes  |                     |
| `status`                | text                     |  no  | `'active'::text`    |
| `replaces_equipment_id` | uuid                     | yes  |                     |
| `installed_at`          | timestamp with time zone |  no  | `now()`             |
| `decommissioned_at`     | timestamp with time zone | yes  |                     |
| `decommission_reason`   | text                     | yes  |                     |
| `notes`                 | text                     | yes  |                     |
| `created_at`            | timestamp with time zone |  no  | `now()`             |
| `updated_at`            | timestamp with time zone |  no  | `now()`             |

### `operations.key_authorizations`

| Column                  | Type                     | Null | Default                   |
| ----------------------- | ------------------------ | :--: | ------------------------- |
| `id`                    | uuid                     |  no  | `gen_random_uuid()`       |
| `rfid_key_id`           | uuid                     |  no  |                           |
| `equipment_id`          | uuid                     |  no  |                           |
| `sync_state`            | text                     |  no  | `'pending_install'::text` |
| `installed_at`          | timestamp with time zone | yes  |                           |
| `installed_by_staff_id` | uuid                     | yes  |                           |
| `removed_at`            | timestamp with time zone | yes  |                           |
| `removed_by_staff_id`   | uuid                     | yes  |                           |
| `remove_reason`         | text                     | yes  |                           |
| `notes`                 | text                     | yes  |                           |
| `created_at`            | timestamp with time zone |  no  | `now()`                   |
| `updated_at`            | timestamp with time zone |  no  | `now()`                   |
| `reject_reason`         | text                     | yes  |                           |

### `public.administrations`

| Column         | Type                     | Null | Default             |
| -------------- | ------------------------ | :--: | ------------------- |
| `id`           | uuid                     |  no  | `gen_random_uuid()` |
| `company_name` | text                     |  no  |                     |
| `tax_id`       | text                     | yes  |                     |
| `email`        | text                     | yes  |                     |
| `phone`        | text                     | yes  |                     |
| `address`      | text                     | yes  |                     |
| `status`       | text                     |  no  | `'active'::text`    |
| `notes`        | text                     | yes  |                     |
| `created_at`   | timestamp with time zone |  no  | `now()`             |
| `updated_at`   | timestamp with time zone |  no  | `now()`             |

### `public.buildings`

| Column              | Type                     | Null | Default             |
| ------------------- | ------------------------ | :--: | ------------------- |
| `id`                | uuid                     |  no  | `gen_random_uuid()` |
| `administration_id` | uuid                     |  no  |                     |
| `name`              | text                     |  no  |                     |
| `address`           | text                     | yes  |                     |
| `city`              | text                     | yes  |                     |
| `status`            | text                     |  no  | `'active'::text`    |
| `notes`             | text                     | yes  |                     |
| `created_at`        | timestamp with time zone |  no  | `now()`             |
| `updated_at`        | timestamp with time zone |  no  | `now()`             |

### `public.key_events`

| Column           | Type                     | Null | Default             |
| ---------------- | ------------------------ | :--: | ------------------- |
| `id`             | uuid                     |  no  | `gen_random_uuid()` |
| `key_id`         | uuid                     |  no  |                     |
| `event_type`     | text                     |  no  |                     |
| `note`           | text                     | yes  |                     |
| `actor_staff_id` | uuid                     | yes  |                     |
| `occurred_at`    | timestamp with time zone |  no  | `now()`             |

### `public.key_order_items`

| Column                 | Type                     | Null | Default             |
| ---------------------- | ------------------------ | :--: | ------------------- |
| `id`                   | uuid                     |  no  | `gen_random_uuid()` |
| `order_id`             | uuid                     |  no  |                     |
| `item_type`            | text                     |  no  | `'key'::text`       |
| `quantity`             | integer                  |  no  | `1`                 |
| `description`          | text                     | yes  |                     |
| `building_id`          | uuid                     |  no  |                     |
| `unit_id`              | uuid                     | yes  |                     |
| `unit_price`           | numeric(12,2)            |  no  |                     |
| `product_id`           | uuid                     | yes  |                     |
| `pickup_particular_id` | uuid                     | yes  |                     |
| `produced_key_id`      | uuid                     | yes  |                     |
| `status`               | text                     |  no  | `'pending'::text`   |
| `created_at`           | timestamp with time zone |  no  | `now()`             |
| `updated_at`           | timestamp with time zone |  no  | `now()`             |

### `public.key_orders`

| Column                 | Type                     | Null | Default                  |
| ---------------------- | ------------------------ | :--: | ------------------------ |
| `id`                   | uuid                     |  no  | `gen_random_uuid()`      |
| `order_number`         | text                     |  no  | `gen_key_order_number()` |
| `client_type`          | text                     |  no  |                          |
| `administration_id`    | uuid                     | yes  |                          |
| `particular_id`        | uuid                     | yes  |                          |
| `particular_full_name` | text                     | yes  |                          |
| `particular_dni`       | text                     | yes  |                          |
| `particular_phone`     | text                     | yes  |                          |
| `particular_email`     | text                     | yes  |                          |
| `pickup_particular_id` | uuid                     | yes  |                          |
| `status`               | text                     |  no  | `'draft'::text`          |
| `notes`                | text                     | yes  |                          |
| `created_at`           | timestamp with time zone |  no  | `now()`                  |
| `updated_at`           | timestamp with time zone |  no  | `now()`                  |

### `public.particulares`

| Column       | Type                     | Null | Default             |
| ------------ | ------------------------ | :--: | ------------------- |
| `id`         | uuid                     |  no  | `gen_random_uuid()` |
| `unit_id`    | uuid                     | yes  |                     |
| `dni`        | text                     |  no  |                     |
| `full_name`  | text                     |  no  |                     |
| `phone`      | text                     | yes  |                     |
| `email`      | text                     | yes  |                     |
| `created_at` | timestamp with time zone |  no  | `now()`             |
| `updated_at` | timestamp with time zone |  no  | `now()`             |
| `status`     | text                     |  no  | `'active'::text`    |

### `public.products`

| Column            | Type                     | Null | Default             |
| ----------------- | ------------------------ | :--: | ------------------- |
| `id`              | uuid                     |  no  | `gen_random_uuid()` |
| `name`            | text                     |  no  |                     |
| `category`        | text                     |  no  |                     |
| `cost_price`      | numeric(12,2)            | yes  |                     |
| `stock_total`     | integer                  |  no  | `0`                 |
| `stock_reservado` | integer                  |  no  | `0`                 |
| `created_at`      | timestamp with time zone |  no  | `now()`             |
| `updated_at`      | timestamp with time zone |  no  | `now()`             |

### `public.rfid_key_intended_equipment`

| Column         | Type                     | Null | Default |
| -------------- | ------------------------ | :--: | ------- |
| `rfid_key_id`  | uuid                     |  no  |         |
| `equipment_id` | uuid                     |  no  |         |
| `created_at`   | timestamp with time zone |  no  | `now()` |

### `public.rfid_keys`

| Column                  | Type                     | Null | Default             |
| ----------------------- | ------------------------ | :--: | ------------------- |
| `id`                    | uuid                     |  no  | `gen_random_uuid()` |
| `rfid_code`             | text                     |  no  |                     |
| `unit_id`               | uuid                     |  no  |                     |
| `status`                | text                     |  no  | `'active'::text`    |
| `notes`                 | text                     | yes  |                     |
| `activated_at`          | timestamp with time zone |  no  | `now()`             |
| `deactivated_at`        | timestamp with time zone | yes  |                     |
| `created_at`            | timestamp with time zone |  no  | `now()`             |
| `updated_at`            | timestamp with time zone |  no  | `now()`             |
| `key_request_item_id`   | uuid                     | yes  |                     |
| `picked_up_at`          | timestamp with time zone | yes  |                     |
| `picked_up_by_name`     | text                     | yes  |                     |
| `picked_up_by_surname`  | text                     | yes  |                     |
| `picked_up_by_dni`      | text                     | yes  |                     |
| `delivered_by_staff_id` | uuid                     | yes  |                     |
| `order_item_id`         | uuid                     | yes  |                     |

### `public.stock_movements`

| Column          | Type                     | Null | Default             |
| --------------- | ------------------------ | :--: | ------------------- |
| `id`            | uuid                     |  no  | `gen_random_uuid()` |
| `product_id`    | uuid                     |  no  |                     |
| `type`          | text                     |  no  |                     |
| `quantity`      | integer                  |  no  |                     |
| `unit_cost`     | numeric(12,2)            | yes  |                     |
| `note`          | text                     | yes  |                     |
| `order_id`      | uuid                     | yes  |                     |
| `order_item_id` | uuid                     | yes  |                     |
| `ticket_id`     | uuid                     | yes  |                     |
| `staff_id`      | uuid                     | yes  |                     |
| `created_by`    | uuid                     | yes  |                     |
| `created_at`    | timestamp with time zone |  no  | `now()`             |
| `order_kind`    | text                     | yes  |                     |

### `public.technical_order_items`

| Column                              | Type                     | Null | Default             |
| ----------------------------------- | ------------------------ | :--: | ------------------- |
| `id`                                | uuid                     |  no  | `gen_random_uuid()` |
| `order_id`                          | uuid                     |  no  |                     |
| `item_type`                         | text                     |  no  |                     |
| `quantity`                          | integer                  |  no  | `1`                 |
| `description`                       | text                     | yes  |                     |
| `unit_price`                        | numeric(12,2)            |  no  |                     |
| `product_id`                        | uuid                     | yes  |                     |
| `intended_equipment_id`             | uuid                     | yes  |                     |
| `intended_assignee_staff_id`        | uuid                     | yes  |                     |
| `status`                            | text                     |  no  | `'pending'::text`   |
| `created_at`                        | timestamp with time zone |  no  | `now()`             |
| `updated_at`                        | timestamp with time zone |  no  | `now()`             |
| `building_id`                       | uuid                     |  no  |                     |
| `intended_replacement_equipment_id` | uuid                     | yes  |                     |

### `public.technical_orders`

| Column                 | Type                     | Null | Default                        |
| ---------------------- | ------------------------ | :--: | ------------------------------ |
| `id`                   | uuid                     |  no  | `gen_random_uuid()`            |
| `order_number`         | text                     |  no  | `gen_technical_order_number()` |
| `client_type`          | text                     |  no  |                                |
| `administration_id`    | uuid                     | yes  |                                |
| `particular_id`        | uuid                     | yes  |                                |
| `particular_full_name` | text                     | yes  |                                |
| `particular_dni`       | text                     | yes  |                                |
| `particular_phone`     | text                     | yes  |                                |
| `particular_email`     | text                     | yes  |                                |
| `status`               | text                     |  no  | `'draft'::text`                |
| `notes`                | text                     | yes  |                                |
| `created_at`           | timestamp with time zone |  no  | `now()`                        |
| `updated_at`           | timestamp with time zone |  no  | `now()`                        |

### `public.units`

| Column              | Type                     | Null | Default             |
| ------------------- | ------------------------ | :--: | ------------------- |
| `id`                | uuid                     |  no  | `gen_random_uuid()` |
| `building_id`       | uuid                     |  no  |                     |
| `number`            | text                     |  no  |                     |
| `unit_type`         | text                     | yes  |                     |
| `status`            | text                     |  no  | `'active'::text`    |
| `notes`             | text                     | yes  |                     |
| `created_at`        | timestamp with time zone |  no  | `now()`             |
| `updated_at`        | timestamp with time zone |  no  | `now()`             |
| `is_administrative` | boolean                  |  no  | `false`             |

### `sales.bill_items`

| Column                        | Type                     | Null | Default             |
| ----------------------------- | ------------------------ | :--: | ------------------- |
| `id`                          | uuid                     |  no  | `gen_random_uuid()` |
| `bill_id`                     | uuid                     |  no  |                     |
| `product_id`                  | uuid                     | yes  |                     |
| `description`                 | text                     |  no  |                     |
| `quantity`                    | numeric(10,2)            |  no  |                     |
| `unit_price`                  | numeric(14,2)            |  no  |                     |
| `subtotal`                    | numeric(14,2)            |  no  | `0`                 |
| `related_key_request_item_id` | uuid                     | yes  |                     |
| `related_equipment_id`        | uuid                     | yes  |                     |
| `related_recurring_charge_id` | uuid                     | yes  |                     |
| `notes`                       | text                     | yes  |                     |
| `created_at`                  | timestamp with time zone |  no  | `now()`             |
| `updated_at`                  | timestamp with time zone |  no  | `now()`             |

### `sales.bills`

| Column                | Type                     | Null | Default                   |
| --------------------- | ------------------------ | :--: | ------------------------- |
| `id`                  | uuid                     |  no  | `gen_random_uuid()`       |
| `bill_number`         | text                     |  no  | `sales.gen_bill_number()` |
| `administration_id`   | uuid                     |  no  |                           |
| `charge_date`         | date                     |  no  | `CURRENT_DATE`            |
| `due_date`            | date                     | yes  |                           |
| `status`              | text                     |  no  | `'draft'::text`           |
| `total_amount`        | numeric(14,2)            |  no  | `0`                       |
| `currency`            | text                     |  no  | `'ARS'::text`             |
| `from_quote_id`       | uuid                     | yes  |                           |
| `cancellation_reason` | text                     | yes  |                           |
| `notes`               | text                     | yes  |                           |
| `created_by_staff_id` | uuid                     | yes  |                           |
| `created_at`          | timestamp with time zone |  no  | `now()`                   |
| `updated_at`          | timestamp with time zone |  no  | `now()`                   |

### `sales.key_request_items`

| Column           | Type                     | Null | Default             |
| ---------------- | ------------------------ | :--: | ------------------- |
| `id`             | uuid                     |  no  | `gen_random_uuid()` |
| `key_request_id` | uuid                     |  no  |                     |
| `unit_id`        | uuid                     |  no  |                     |
| `quantity`       | integer                  |  no  |                     |
| `notes`          | text                     | yes  |                     |
| `created_at`     | timestamp with time zone |  no  | `now()`             |
| `updated_at`     | timestamp with time zone |  no  | `now()`             |

### `sales.key_requests`

| Column                    | Type                     | Null | Default                          |
| ------------------------- | ------------------------ | :--: | -------------------------------- |
| `id`                      | uuid                     |  no  | `gen_random_uuid()`              |
| `request_number`          | text                     |  no  | `sales.gen_key_request_number()` |
| `administration_id`       | uuid                     |  no  |                                  |
| `requester_type`          | text                     |  no  |                                  |
| `requester_name`          | text                     | yes  |                                  |
| `requester_surname`       | text                     | yes  |                                  |
| `requester_dni`           | text                     | yes  |                                  |
| `requester_contact`       | text                     | yes  |                                  |
| `pickup_person_name`      | text                     | yes  |                                  |
| `pickup_person_surname`   | text                     | yes  |                                  |
| `pickup_person_dni`       | text                     | yes  |                                  |
| `status`                  | text                     |  no  | `'pending_authorization'::text`  |
| `received_at`             | timestamp with time zone |  no  | `now()`                          |
| `received_by_staff_id`    | uuid                     | yes  |                                  |
| `authorized_by`           | text                     | yes  |                                  |
| `authorized_at`           | timestamp with time zone | yes  |                                  |
| `authorization_method`    | text                     | yes  |                                  |
| `rejection_reason`        | text                     | yes  |                                  |
| `rejection_notes`         | text                     | yes  |                                  |
| `cancellation_reason`     | text                     | yes  |                                  |
| `notes`                   | text                     | yes  |                                  |
| `created_at`              | timestamp with time zone |  no  | `now()`                          |
| `updated_at`              | timestamp with time zone |  no  | `now()`                          |
| `requester_particular_id` | uuid                     | yes  |                                  |
| `pickup_particular_id`    | uuid                     | yes  |                                  |

### `sales.payments`

| Column              | Type                     | Null | Default             |
| ------------------- | ------------------------ | :--: | ------------------- |
| `id`                | uuid                     |  no  | `gen_random_uuid()` |
| `administration_id` | uuid                     |  no  |                     |
| `bill_id`           | uuid                     |  no  |                     |
| `payment_date`      | date                     |  no  | `CURRENT_DATE`      |
| `amount`            | numeric(14,2)            |  no  |                     |
| `currency`          | text                     |  no  | `'ARS'::text`       |
| `payment_method`    | text                     |  no  |                     |
| `reference`         | text                     | yes  |                     |
| `requires_invoice`  | boolean                  |  no  |                     |
| `invoiced_at`       | timestamp with time zone | yes  |                     |
| `notes`             | text                     | yes  |                     |
| `created_at`        | timestamp with time zone |  no  | `now()`             |
| `updated_at`        | timestamp with time zone |  no  | `now()`             |

### `sales.products`

| Column         | Type                     | Null | Default             |
| -------------- | ------------------------ | :--: | ------------------- |
| `id`           | uuid                     |  no  | `gen_random_uuid()` |
| `name`         | text                     |  no  |                     |
| `product_type` | text                     |  no  |                     |
| `description`  | text                     | yes  |                     |
| `is_active`    | boolean                  |  no  | `true`              |
| `created_at`   | timestamp with time zone |  no  | `now()`             |
| `updated_at`   | timestamp with time zone |  no  | `now()`             |

### `sales.quote_items`

| Column        | Type                     | Null | Default             |
| ------------- | ------------------------ | :--: | ------------------- |
| `id`          | uuid                     |  no  | `gen_random_uuid()` |
| `quote_id`    | uuid                     |  no  |                     |
| `product_id`  | uuid                     | yes  |                     |
| `description` | text                     |  no  |                     |
| `quantity`    | numeric(10,2)            |  no  |                     |
| `unit_price`  | numeric(14,2)            |  no  |                     |
| `subtotal`    | numeric(14,2)            |  no  | `0`                 |
| `notes`       | text                     | yes  |                     |
| `created_at`  | timestamp with time zone |  no  | `now()`             |
| `updated_at`  | timestamp with time zone |  no  | `now()`             |

### `sales.quotes`

| Column                | Type                     | Null | Default                    |
| --------------------- | ------------------------ | :--: | -------------------------- |
| `id`                  | uuid                     |  no  | `gen_random_uuid()`        |
| `quote_number`        | text                     |  no  | `sales.gen_quote_number()` |
| `administration_id`   | uuid                     |  no  |                            |
| `status`              | text                     |  no  | `'draft'::text`            |
| `valid_until`         | date                     | yes  |                            |
| `total_amount`        | numeric(14,2)            |  no  | `0`                        |
| `currency`            | text                     |  no  | `'ARS'::text`              |
| `sent_at`             | timestamp with time zone | yes  |                            |
| `accepted_at`         | timestamp with time zone | yes  |                            |
| `rejected_at`         | timestamp with time zone | yes  |                            |
| `rejection_reason`    | text                     | yes  |                            |
| `created_by_staff_id` | uuid                     | yes  |                            |
| `notes`               | text                     | yes  |                            |
| `created_at`          | timestamp with time zone |  no  | `now()`                    |
| `updated_at`          | timestamp with time zone |  no  | `now()`                    |

### `sales.recurring_charges`

| Column              | Type                     | Null | Default             |
| ------------------- | ------------------------ | :--: | ------------------- |
| `id`                | uuid                     |  no  | `gen_random_uuid()` |
| `administration_id` | uuid                     |  no  |                     |
| `product_id`        | uuid                     | yes  |                     |
| `description`       | text                     |  no  |                     |
| `monthly_amount`    | numeric(14,2)            |  no  |                     |
| `start_date`        | date                     |  no  |                     |
| `end_date`          | date                     | yes  |                     |
| `is_active`         | boolean                  |  no  | `true`              |
| `notes`             | text                     | yes  |                     |
| `created_at`        | timestamp with time zone |  no  | `now()`             |
| `updated_at`        | timestamp with time zone |  no  | `now()`             |

### `support.equipment_updates`

| Column                 | Type                     | Null | Default             |
| ---------------------- | ------------------------ | :--: | ------------------- |
| `id`                   | uuid                     |  no  | `gen_random_uuid()` |
| `ticket_id`            | uuid                     |  no  |                     |
| `equipment_id`         | uuid                     |  no  |                     |
| `mdb_storage_path`     | text                     |  no  |                     |
| `keys_to_activate`     | uuid[]                   |  no  | `'{}'::uuid[]`      |
| `keys_to_disable`      | uuid[]                   |  no  | `'{}'::uuid[]`      |
| `created_at`           | timestamp with time zone |  no  | `now()`             |
| `created_by_staff_id`  | uuid                     | yes  |                     |
| `resolved_at`          | timestamp with time zone | yes  |                     |
| `resolved_by_staff_id` | uuid                     | yes  |                     |

### `support.ticket_comments`

| Column            | Type                     | Null | Default             |
| ----------------- | ------------------------ | :--: | ------------------- |
| `id`              | uuid                     |  no  | `gen_random_uuid()` |
| `ticket_id`       | uuid                     |  no  |                     |
| `author_staff_id` | uuid                     | yes  |                     |
| `body`            | text                     |  no  |                     |
| `created_at`      | timestamp with time zone |  no  | `now()`             |

### `support.tickets`

| Column                    | Type                     | Null | Default                       |
| ------------------------- | ------------------------ | :--: | ----------------------------- |
| `id`                      | uuid                     |  no  | `gen_random_uuid()`           |
| `ticket_number`           | text                     |  no  | `support.gen_ticket_number()` |
| `administration_id`       | uuid                     |  no  |                               |
| `building_id`             | uuid                     |  no  |                               |
| `unit_id`                 | uuid                     | yes  |                               |
| `equipment_id`            | uuid                     | yes  |                               |
| `category`                | text                     |  no  |                               |
| `description`             | text                     |  no  |                               |
| `status`                  | text                     |  no  | `'open'::text`                |
| `related_bill_id`         | uuid                     | yes  |                               |
| `related_key_request_id`  | uuid                     | yes  |                               |
| `opened_at`               | timestamp with time zone |  no  | `now()`                       |
| `opened_by_staff_id`      | uuid                     | yes  |                               |
| `assigned_to_staff_id`    | uuid                     | yes  |                               |
| `resolved_at`             | timestamp with time zone | yes  |                               |
| `resolved_by_staff_id`    | uuid                     | yes  |                               |
| `resolution_notes`        | text                     | yes  |                               |
| `cancellation_reason`     | text                     | yes  |                               |
| `notes`                   | text                     | yes  |                               |
| `created_at`              | timestamp with time zone |  no  | `now()`                       |
| `updated_at`              | timestamp with time zone |  no  | `now()`                       |
| `key_order_item_id`       | uuid                     | yes  |                               |
| `technical_order_item_id` | uuid                     | yes  |                               |
| `pending_new_serial`      | text                     | yes  |                               |
| `pending_new_model`       | text                     | yes  |                               |

## Row-level security policies

| Table                                | Policy                                       | Command | Roles         |
| ------------------------------------ | -------------------------------------------- | ------- | ------------- |
| `identity.audit_log`                 | `admin_read_audit_log`                       | SELECT  | authenticated |
| `identity.staff`                     | `admin_all_staff`                            | ALL     | authenticated |
| `identity.staff`                     | `installer_read_staff`                       | SELECT  | authenticated |
| `operations.equipment`               | `admin_all_equipment`                        | ALL     | authenticated |
| `operations.equipment`               | `installer_read_equipment`                   | SELECT  | authenticated |
| `operations.key_authorizations`      | `admin_all_key_authorizations`               | ALL     | authenticated |
| `operations.key_authorizations`      | `installer_read_key_authorizations`          | SELECT  | authenticated |
| `operations.key_authorizations`      | `installer_update_key_authorizations`        | UPDATE  | authenticated |
| `public.administrations`             | `admin_all_administrations`                  | ALL     | authenticated |
| `public.administrations`             | `installer_read_administrations`             | SELECT  | authenticated |
| `public.buildings`                   | `admin_all_buildings`                        | ALL     | authenticated |
| `public.buildings`                   | `installer_read_buildings`                   | SELECT  | authenticated |
| `public.key_events`                  | `admin_all_key_events`                       | ALL     | authenticated |
| `public.key_events`                  | `installer_read_key_events`                  | SELECT  | authenticated |
| `public.key_order_items`             | `admin_all_key_order_items`                  | ALL     | authenticated |
| `public.key_orders`                  | `admin_all_key_orders`                       | ALL     | authenticated |
| `public.particulares`                | `admin_all_particulares`                     | ALL     | authenticated |
| `public.products`                    | `admin_all_products`                         | ALL     | authenticated |
| `public.rfid_key_intended_equipment` | `admin_all_rfid_key_intended_equipment`      | ALL     | authenticated |
| `public.rfid_key_intended_equipment` | `installer_read_rfid_key_intended_equipment` | SELECT  | authenticated |
| `public.rfid_keys`                   | `admin_all_rfid_keys`                        | ALL     | authenticated |
| `public.rfid_keys`                   | `installer_read_rfid_keys`                   | SELECT  | authenticated |
| `public.stock_movements`             | `admin_all_stock_movements`                  | ALL     | authenticated |
| `public.technical_order_items`       | `admin_all_technical_order_items`            | ALL     | authenticated |
| `public.technical_orders`            | `admin_all_technical_orders`                 | ALL     | authenticated |
| `public.units`                       | `admin_all_units`                            | ALL     | authenticated |
| `public.units`                       | `installer_read_units`                       | SELECT  | authenticated |
| `sales.bill_items`                   | `admin_all_bill_items`                       | ALL     | authenticated |
| `sales.bills`                        | `admin_all_bills`                            | ALL     | authenticated |
| `sales.key_request_items`            | `admin_all_key_request_items`                | ALL     | authenticated |
| `sales.key_requests`                 | `admin_all_key_requests`                     | ALL     | authenticated |
| `sales.payments`                     | `admin_all_payments`                         | ALL     | authenticated |
| `sales.products`                     | `admin_all_products`                         | ALL     | authenticated |
| `sales.quote_items`                  | `admin_all_quote_items`                      | ALL     | authenticated |
| `sales.quotes`                       | `admin_all_quotes`                           | ALL     | authenticated |
| `sales.recurring_charges`            | `admin_all_recurring_charges`                | ALL     | authenticated |
| `support.equipment_updates`          | `admin_all_equipment_updates`                | ALL     | authenticated |
| `support.equipment_updates`          | `installer_read_assigned_equipment_updates`  | SELECT  | authenticated |
| `support.ticket_comments`            | `admin_all_ticket_comments`                  | ALL     | authenticated |
| `support.ticket_comments`            | `installer_insert_comments`                  | INSERT  | authenticated |
| `support.ticket_comments`            | `installer_read_comments`                    | SELECT  | authenticated |
| `support.tickets`                    | `admin_all_tickets`                          | ALL     | authenticated |
| `support.tickets`                    | `installer_read_own_tickets`                 | SELECT  | authenticated |
| `support.tickets`                    | `installer_update_own_tickets`               | UPDATE  | authenticated |

## RPC surface (functions callable through PostgREST)

Every `SECURITY DEFINER` RPC is wrapped by an authorization guard (see `README.md` § Authorization convention). `_unguarded` inner functions are revoked from all client roles.

| Function                                                                                                                                                                                                                                                     | Returns                    | Security | Guard          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | -------- | -------------- |
| `cancel_key_disable(p_key_id uuid, p_actor_staff_id uuid, p_note text)`                                                                                                                                                                                      | `void`                     | DEFINER  | admin          |
| `cancel_key_disable_unguarded(p_key_id uuid, p_actor_staff_id uuid, p_note text)`                                                                                                                                                                            | `void`                     | DEFINER  | revoked        |
| `cancel_key_order(p_order_id uuid)`                                                                                                                                                                                                                          | `void`                     | DEFINER  | admin          |
| `cancel_key_order_unguarded(p_order_id uuid)`                                                                                                                                                                                                                | `void`                     | DEFINER  | revoked        |
| `cancel_technical_order(p_order_id uuid)`                                                                                                                                                                                                                    | `void`                     | DEFINER  | admin          |
| `cancel_technical_order_unguarded(p_order_id uuid)`                                                                                                                                                                                                          | `void`                     | DEFINER  | revoked        |
| `change_key_status(p_key_id uuid, p_status text, p_note text, p_actor_staff_id uuid)`                                                                                                                                                                        | `void`                     | DEFINER  | admin          |
| `change_key_status_unguarded(p_key_id uuid, p_status text, p_note text, p_actor_staff_id uuid)`                                                                                                                                                              | `void`                     | DEFINER  | revoked        |
| `complete_authorizations(p_install_ids uuid[], p_remove_ids uuid[], p_staff_id uuid)`                                                                                                                                                                        | `void`                     | INVOKER  |                |
| `configure_key_order_item(p_order_item_id uuid, p_rfid_code text, p_unit_id uuid, p_equipment_ids uuid[])`                                                                                                                                                   | `uuid`                     | DEFINER  | admin          |
| `configure_key_order_item_unguarded(p_order_item_id uuid, p_rfid_code text, p_unit_id uuid, p_equipment_ids uuid[])`                                                                                                                                         | `uuid`                     | DEFINER  | revoked        |
| `configure_technical_ticket_equipment(p_ticket_id uuid, p_new_serial text, p_new_model text)`                                                                                                                                                                | `void`                     | DEFINER  | staff          |
| `configure_technical_ticket_equipment_unguarded(p_ticket_id uuid, p_new_serial text, p_new_model text)`                                                                                                                                                      | `void`                     | DEFINER  | revoked        |
| `confirm_key_order(p_order_id uuid)`                                                                                                                                                                                                                         | `void`                     | DEFINER  | admin          |
| `confirm_key_order_unguarded(p_order_id uuid)`                                                                                                                                                                                                               | `void`                     | DEFINER  | revoked        |
| `confirm_technical_order(p_order_id uuid)`                                                                                                                                                                                                                   | `void`                     | DEFINER  | admin          |
| `confirm_technical_order_unguarded(p_order_id uuid)`                                                                                                                                                                                                         | `void`                     | DEFINER  | revoked        |
| `create_and_assign_equipment(p_ticket_id uuid, p_building_id uuid, p_serial text, p_model text, p_description text, p_access_type text)`                                                                                                                     | `uuid`                     | INVOKER  |                |
| `create_equipment_update(p_equipment_id uuid, p_administration_id uuid, p_building_id uuid, p_description text, p_mdb_storage_path text, p_keys_to_activate uuid[], p_keys_to_disable uuid[], p_actor_staff_id uuid, p_assigned_to_staff_id uuid)`           | `uuid`                     | DEFINER  | admin          |
| `create_equipment_update_unguarded(p_equipment_id uuid, p_administration_id uuid, p_building_id uuid, p_description text, p_mdb_storage_path text, p_keys_to_activate uuid[], p_keys_to_disable uuid[], p_actor_staff_id uuid, p_assigned_to_staff_id uuid)` | `uuid`                     | DEFINER  | revoked        |
| `create_key_order_with_items(p_order jsonb, p_items jsonb[], p_confirm_immediately boolean)`                                                                                                                                                                 | `uuid`                     | DEFINER  | admin          |
| `create_key_order_with_items_unguarded(p_order jsonb, p_items jsonb[], p_confirm_immediately boolean)`                                                                                                                                                       | `uuid`                     | DEFINER  | revoked        |
| `create_product_with_initial_stock(p_name text, p_category text, p_cost_price numeric, p_quantity integer, p_note text, p_actor_staff_id uuid)`                                                                                                              | `uuid`                     | DEFINER  | admin (inline) |
| `create_stock_movement(p_product_id uuid, p_type text, p_quantity integer, p_unit_cost numeric, p_note text, p_actor_staff_id uuid)`                                                                                                                         | `uuid`                     | DEFINER  | admin (inline) |
| `create_technical_order_with_items(p_order jsonb, p_items jsonb[], p_confirm_immediately boolean)`                                                                                                                                                           | `uuid`                     | DEFINER  | admin          |
| `create_technical_order_with_items_unguarded(p_order jsonb, p_items jsonb[], p_confirm_immediately boolean)`                                                                                                                                                 | `uuid`                     | DEFINER  | revoked        |
| `gen_key_order_number()`                                                                                                                                                                                                                                     | `text`                     | DEFINER  |                |
| `gen_technical_order_number()`                                                                                                                                                                                                                               | `text`                     | DEFINER  |                |
| `mark_key_order_invoiced(p_order_id uuid)`                                                                                                                                                                                                                   | `void`                     | DEFINER  | admin          |
| `mark_key_order_invoiced_unguarded(p_order_id uuid)`                                                                                                                                                                                                         | `void`                     | DEFINER  | revoked        |
| `mark_key_order_item_installed(p_order_item_id uuid)`                                                                                                                                                                                                        | `void`                     | DEFINER  | admin          |
| `mark_key_order_item_installed_unguarded(p_order_item_id uuid)`                                                                                                                                                                                              | `void`                     | DEFINER  | revoked        |
| `mark_technical_order_invoiced(p_order_id uuid)`                                                                                                                                                                                                             | `void`                     | DEFINER  | admin          |
| `mark_technical_order_invoiced_unguarded(p_order_id uuid)`                                                                                                                                                                                                   | `void`                     | DEFINER  | revoked        |
| `recompute_key_order_status(p_order_id uuid)`                                                                                                                                                                                                                | `void`                     | DEFINER  |                |
| `recompute_technical_order_status(p_order_id uuid)`                                                                                                                                                                                                          | `void`                     | DEFINER  |                |
| `record_order_key_pickup(p_key_id uuid, p_picked_up_by_name text, p_picked_up_by_surname text, p_picked_up_by_dni text, p_actor_staff_id uuid)`                                                                                                              | `void`                     | DEFINER  | admin          |
| `record_order_key_pickup_unguarded(p_key_id uuid, p_picked_up_by_name text, p_picked_up_by_surname text, p_picked_up_by_dni text, p_actor_staff_id uuid)`                                                                                                    | `void`                     | DEFINER  | revoked        |
| `request_key_disable(p_key_id uuid, p_actor_staff_id uuid, p_note text)`                                                                                                                                                                                     | `void`                     | DEFINER  | admin          |
| `request_key_disable_unguarded(p_key_id uuid, p_actor_staff_id uuid, p_note text)`                                                                                                                                                                           | `void`                     | DEFINER  | revoked        |
| `resolve_equipment_installation(p_ticket_id uuid, p_serial text, p_unit_id uuid, p_note text, p_actor_staff_id uuid)`                                                                                                                                        | `uuid`                     | DEFINER  | admin          |
| `resolve_equipment_installation_unguarded(p_ticket_id uuid, p_serial text, p_unit_id uuid, p_note text, p_actor_staff_id uuid)`                                                                                                                              | `uuid`                     | DEFINER  | revoked        |
| `resolve_equipment_replacement(p_ticket_id uuid, p_old_equipment_id uuid, p_new_serial text, p_new_model text, p_new_description text, p_note text, p_actor_staff_id uuid)`                                                                                  | `uuid`                     | DEFINER  | admin          |
| `resolve_equipment_replacement_unguarded(p_ticket_id uuid, p_old_equipment_id uuid, p_new_serial text, p_new_model text, p_new_description text, p_note text, p_actor_staff_id uuid)`                                                                        | `uuid`                     | DEFINER  | revoked        |
| `resolve_equipment_update(p_task_id uuid, p_actor_staff_id uuid)`                                                                                                                                                                                            | `jsonb`                    | DEFINER  | staff          |
| `resolve_equipment_update_unguarded(p_task_id uuid, p_actor_staff_id uuid)`                                                                                                                                                                                  | `jsonb`                    | DEFINER  | revoked        |
| `resolve_ticket(p_ticket_id uuid, p_note text, p_actor_staff_id uuid)`                                                                                                                                                                                       | `uuid`                     | DEFINER  | staff          |
| `resolve_ticket_unguarded(p_ticket_id uuid, p_note text, p_actor_staff_id uuid)`                                                                                                                                                                             | `uuid`                     | DEFINER  | revoked        |
| `update_draft_key_order_with_items(p_order_id uuid, p_patch jsonb, p_items jsonb[], p_expected_updated_at timestamp with time zone)`                                                                                                                         | `timestamp with time zone` | DEFINER  | admin          |
| `update_draft_key_order_with_items_unguarded(p_order_id uuid, p_patch jsonb, p_items jsonb[], p_expected_updated_at timestamp with time zone)`                                                                                                               | `timestamp with time zone` | DEFINER  | revoked        |
| `update_draft_technical_order_with_items(p_order_id uuid, p_patch jsonb, p_items jsonb[], p_expected_updated_at timestamp with time zone)`                                                                                                                   | `timestamp with time zone` | DEFINER  | admin          |
| `update_draft_technical_order_with_items_unguarded(p_order_id uuid, p_patch jsonb, p_items jsonb[], p_expected_updated_at timestamp with time zone)`                                                                                                         | `timestamp with time zone` | DEFINER  | revoked        |

## Views

- `public.all_orders`
- `public.equipment_inventory`
- `public.key_orders_summary`
- `public.keys_inventory`
- `public.technical_orders_summary`
- `sales.administration_balance`
- `sales.pending_to_invoice`
- `support.installer_tickets_with_context`
- `support.technical_order_tickets`
