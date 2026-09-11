import type { Database } from '../database.types';

/**
 * Typed view over the generated table surface.
 *
 * Hooks that stitch joins together in JS used to re-declare the row shapes
 * they selected as local `Raw*` interfaces and then bridge the gap with a
 * double cast. Deriving the row from `Database` instead means the
 * selected columns are checked against the real schema, and a renamed or
 * dropped column becomes a compile error rather than a runtime `undefined`.
 *
 * Use `SelectedRow` to describe exactly the columns a `.select()` asked for:
 *
 * ```ts
 * type EquipmentRow = SelectedRow<'operations', 'equipment', 'id' | 'serial_number'>;
 * ```
 */
export type SchemaName = keyof Database;

/** The `Tables` map of one schema in the generated database type. */
export type SchemaTables<S extends SchemaName> = Database[S] extends { Tables: infer T }
  ? T
  : never;

/** Name of any table in schema `S`. */
export type TableName<S extends SchemaName> = keyof SchemaTables<S> & string;

/** Full generated `Row` type of `Schema.Table`. */
export type TableRow<S extends SchemaName, T extends TableName<S>> = SchemaTables<S>[T] extends {
  Row: infer R;
}
  ? R
  : never;

/**
 * The subset of `Schema.Table`'s row covering exactly the selected columns.
 * `Columns` is constrained to real column names, so a typo fails to compile.
 */
export type SelectedRow<
  S extends SchemaName,
  T extends TableName<S>,
  Columns extends keyof TableRow<S, T>,
> = Pick<TableRow<S, T>, Columns>;
