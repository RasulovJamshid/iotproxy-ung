import { PERMISSIONS } from '@iotproxy/shared';
import { OrgContext } from './interfaces/auth-user.interface';

/**
 * Permission hierarchy helpers for API-key authorization.
 *
 * READ  – list / view resources (sites, sensors, groups, types, categories, org info)
 * QUERY – READ + query time-series readings / aggregations / search / nearest
 * ADMIN – superset of everything
 */

const READ_PERMS: readonly string[] = [
  PERMISSIONS.READ,
  PERMISSIONS.QUERY,   // query implies read
  PERMISSIONS.ADMIN,   // admin implies everything
];

const QUERY_PERMS: readonly string[] = [
  PERMISSIONS.QUERY,
  PERMISSIONS.ADMIN,
];

/** True when the API key may list / view resources. */
export function canRead(org: OrgContext): boolean {
  return org.permissions.some(p => (READ_PERMS as string[]).includes(p));
}

/** True when the API key may query time-series data. */
export function canQuery(org: OrgContext): boolean {
  return org.permissions.some(p => (QUERY_PERMS as string[]).includes(p));
}

/** True when the API key has admin access. */
export function canAdmin(org: OrgContext): boolean {
  return org.permissions.includes(PERMISSIONS.ADMIN);
}
