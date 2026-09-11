import type { Database } from '../database.types';

/**
 * Typed view over the generated Supabase RPC surface.
 *
 * `supabase gen types` emits `Database['public']['Functions']` as a map of
 * `{ Args, Returns }` pairs. Deriving from that map — instead of re-declaring
 * argument shapes by hand — keeps every wrapper in `src/rpc/` honest: when a
 * migration changes an RPC signature and the types are regenerated, the
 * wrappers stop compiling instead of silently drifting behind a cast.
 */
export type PublicFunctions = Database['public']['Functions'];

/** Name of any RPC callable through `client.rpc(...)` on the public schema. */
export type RpcName = keyof PublicFunctions;

/** Exact argument object the generated types expect for `Fn`. */
export type RpcArgs<Fn extends RpcName> = PublicFunctions[Fn]['Args'];

/** Exact value `client.rpc(Fn, ...)` resolves `data` to. */
export type RpcReturns<Fn extends RpcName> = PublicFunctions[Fn]['Returns'];

/**
 * Keys of `RpcArgs<Fn>` that the SQL signature declares with a DEFAULT.
 *
 * `supabase gen types` marks a defaulted SQL parameter as an *optional*
 * property (`p_note?: string`) rather than a *nullable* one (`p_note: string
 * | null`). Every defaulted parameter across our RPCs defaults to NULL (see
 * `supabase/migrations/`), so omitting such a key is exactly equivalent to
 * sending an explicit `null`, and the omission is what the generated type
 * actually permits.
 */
export type OptionalRpcArgs<Fn extends RpcName> = Pick<
  RpcArgs<Fn>,
  {
    [K in keyof RpcArgs<Fn>]-?: Record<string, never> extends Pick<RpcArgs<Fn>, K> ? K : never;
  }[keyof RpcArgs<Fn>]
>;

type DefinedOnly<T> = { [K in keyof T]?: NonNullable<T[K]> };

/**
 * Drop `null` / `undefined` entries so a defaulted RPC parameter is *omitted*
 * rather than sent as an explicit null.
 *
 * Spread the result into the RPC argument object:
 *
 * ```ts
 * client.rpc('resolve_ticket', {
 *   p_ticket_id: input.ticketId,
 *   ...definedRpcArgs({ p_note: input.note, p_actor_staff_id: input.actorStaffId }),
 * });
 * ```
 *
 * The single `as` below is the type-level counterpart of the runtime filter
 * directly above it: every retained value passed the `!= null` check, which is
 * precisely what `NonNullable` asserts. It is not a boundary cast — no
 * unvalidated external data flows through it.
 */
export function definedRpcArgs<T extends Record<string, unknown>>(args: T): DefinedOnly<T> {
  const defined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value != null) defined[key] = value;
  }
  return defined as DefinedOnly<T>;
}
