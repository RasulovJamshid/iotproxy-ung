import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { Organization, OrgUser } from '../types';

export function useOrganization() {
  const { user } = useAuth();
  return useQuery<Organization>({
    queryKey: ['organization', user?.organizationId],
    queryFn: async () =>
      (await api.get(`/organizations/${user!.organizationId}`)).data,
    enabled: !!user,
  });
}

export function useAllOrganizations() {
  const { user } = useAuth();
  return useQuery<Organization[]>({
    queryKey: ['organizations'],
    queryFn: async () => (await api.get('/organizations')).data,
    enabled: user?.role === 'SYSTEM_ADMIN',
  });
}

export function useOrgUsers(orgId?: string) {
  const { user } = useAuth();
  const targetOrgId = orgId ?? user?.organizationId;
  return useQuery<OrgUser[]>({
    queryKey: ['org-users', targetOrgId],
    queryFn: async () =>
      (await api.get(`/organizations/${targetOrgId}/users`)).data,
    enabled: !!targetOrgId,
  });
}

export function useCreateUser() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, ...body }: { orgId?: string; email: string; password: string; role: string }) => {
      const targetOrgId = orgId ?? user!.organizationId;
      return api.post(`/organizations/${targetOrgId}/users`, body).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-users'] }),
  });
}

export function useUpdateUser() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, currentOrgId, ...body }: {
      userId: string;
      currentOrgId?: string;
      role?: string;
      isActive?: boolean;
      organizationId?: string;
      email?: string;
      password?: string;
    }) => {
      const orgId = currentOrgId ?? user!.organizationId;
      return api.patch(`/organizations/${orgId}/users/${userId}`, body).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-users'] }),
  });
}

export function useUserMemberships(userId: string | null) {
  return useQuery<Array<{ org: { id: string; name: string; slug: string }; role: string }>>({
    queryKey: ['user-memberships', userId],
    queryFn: async () => (await api.get(`/organizations/members/${userId}`)).data,
    enabled: !!userId,
  });
}

export function useAddMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, orgId, role }: { userId: string; orgId: string; role: string }) =>
      api.post(`/organizations/${orgId}/members`, { userId, role }).then((r) => r.data),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ['user-memberships', userId] });
      qc.invalidateQueries({ queryKey: ['org-users'] });
    },
  });
}

export function useUpdateMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, orgId, role }: { userId: string; orgId: string; role: string }) =>
      api.patch(`/organizations/${orgId}/members/${userId}`, { role }).then((r) => r.data),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ['user-memberships', userId] });
      qc.invalidateQueries({ queryKey: ['org-users'] });
    },
  });
}

export function useRemoveMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, orgId }: { userId: string; orgId: string }) =>
      api.delete(`/organizations/${orgId}/members/${userId}`),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ['user-memberships', userId] });
      qc.invalidateQueries({ queryKey: ['org-users'] });
    },
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; slug: string; rateLimitRpm?: number; rawRetentionDays?: number | null }) =>
      api.post('/organizations', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

export function useUpdateOrganization() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; slug?: string; rateLimitRpm?: number; rawRetentionDays?: number | null; isActive?: boolean }) =>
      api.patch(`/organizations/${user!.organizationId}`, body).then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(['organization', user!.organizationId], updated);
    },
  });
}

/** SYSTEM_ADMIN: update ANY org by id */
export function useUpdateOrganizationById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; slug?: string; rateLimitRpm?: number; rawRetentionDays?: number | null; isActive?: boolean }) =>
      api.patch(`/organizations/${id}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

