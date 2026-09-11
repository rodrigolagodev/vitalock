import type { Json } from '../database.types';

/**
 * Runtime narrowing for RPCs whose generated `Returns` is `Json`.
 *
 * Postgres `jsonb` carries no static shape, so `gen types` can only say
 * `Json`. These helpers *validate* the payload at the boundary instead of
 * asserting a shape the compiler cannot check — a wrong assumption surfaces
 * as a thrown error at the call site rather than as `undefined` leaking into
 * the UI several frames later.
 */
export type JsonObject = { [key: string]: Json | undefined };

/** True when `value` is a plain JSON object (not null, not an array). */
export function isJsonObject(value: Json | null | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrow an RPC payload to a JSON object, throwing a named error otherwise.
 * `rpcName` is used verbatim in the message so a malformed payload is
 * traceable to the SQL function that produced it.
 */
export function requireJsonObject(value: Json | null | undefined, rpcName: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new TypeError(`${rpcName} returned a non-object JSON payload`);
  }
  return value;
}

/** Read `key` as a string, or `null` when absent or of another type. */
export function readJsonString(source: JsonObject, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

/** Read `key` as a string, throwing when absent or of another type. */
export function requireJsonString(source: JsonObject, key: string, rpcName: string): string {
  const value = readJsonString(source, key);
  if (value === null) {
    throw new TypeError(`${rpcName} returned no string "${key}" in its JSON payload`);
  }
  return value;
}

/**
 * Read `key` as an array of strings. A missing key, a non-array value, and
 * non-string entries are all dropped rather than throwing — callers of these
 * RPCs treat the list as "extra information", never as a required field.
 */
export function readJsonStringArray(source: JsonObject, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
