// Single source of truth for the internal-team RBAC roles. Server's
// Prisma enum (InternalTeamAccess) and every client-side check should
// reference these constants instead of raw string literals so a typo'd
// 'OPERATIONS' / 'OPERATION' can't slip through.

export const ACCESS_ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  RELATIONSHIP_MANAGER: 'RELATIONSHIP_MANAGER',
  OPERATIONS: 'OPERATIONS',
} as const;

export type AccessRole = (typeof ACCESS_ROLE)[keyof typeof ACCESS_ROLE];

export const ACCESS_ROLE_VALUES: readonly AccessRole[] = [
  ACCESS_ROLE.SUPER_ADMIN,
  ACCESS_ROLE.RELATIONSHIP_MANAGER,
  ACCESS_ROLE.OPERATIONS,
];

export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  RELATIONSHIP_MANAGER: 'Relationship Manager',
  OPERATIONS: 'Operations',
};
