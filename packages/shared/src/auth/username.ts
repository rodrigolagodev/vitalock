import { z } from 'zod';

/**
 * Login identifier format. Mirrors `identity.staff.username`'s CHECK
 * constraint (`staff_username_format`) byte-for-byte: lowercase letters,
 * digits, `.`, `_`, `-`, 3-32 characters. The DB never normalizes on its
 * own — every caller must send an already-normalized value.
 */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

/**
 * Shared validator for every username input surface (both login forms and
 * the admin Personal form). Trims and lowercases before matching
 * `USERNAME_PATTERN`, so a differently-cased or padded value normalizes
 * instead of being rejected.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, 'Usuario inválido');
