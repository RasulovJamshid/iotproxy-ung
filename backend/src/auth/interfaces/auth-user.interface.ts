export interface AuthUser {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}

export interface OrgContext {
  organizationId: string;
  siteId?: string;
  permissions: string[];
  apiKeyId?: string;
  /** GLOBAL | ORGS | SITES — undefined means legacy single-org/site */
  scopeType?: string;
  /** Populated for ORGS scope: org IDs the key grants access to */
  allowedOrgIds?: string[];
  /** Populated for SITES scope: explicit (orgId, siteId) pairs */
  allowedSites?: Array<{ orgId: string; siteId: string }>;
}
