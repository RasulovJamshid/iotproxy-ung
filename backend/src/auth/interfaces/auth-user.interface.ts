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
}
