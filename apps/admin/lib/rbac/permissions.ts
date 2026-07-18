export type OrganizationRole = "owner" | "admin" | "manager" | "user";

export const ORGANIZATION_ROLES = ["owner", "admin", "manager", "user"] as const satisfies readonly OrganizationRole[];

export const ASSIGNABLE_ROLES = ["admin", "manager", "user"] as const;

export type Capability = "settings_billing" | "org_overview" | "self_view";

export const CAPABILITIES = {
  settings_billing: ["owner", "admin"],
  org_overview: ["owner", "admin", "manager"],
  self_view: ["owner", "admin", "manager", "user"],
} as const satisfies Record<Capability, readonly OrganizationRole[]>;

export function rolesFor(cap: Capability): readonly OrganizationRole[] {
  return CAPABILITIES[cap];
}

export function hasCapability(role: OrganizationRole | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return (CAPABILITIES[cap] as readonly OrganizationRole[]).includes(role);
}

export function canManageSettings(role: OrganizationRole | null | undefined): boolean {
  return hasCapability(role, "settings_billing");
}

export function canSeeOrgOverview(role: OrganizationRole | null | undefined): boolean {
  return hasCapability(role, "org_overview");
}

export function isSelfScopedRole(role: OrganizationRole | null | undefined): boolean {
  return role === "user";
}

export function isAssignableRole(role: string): role is (typeof ASSIGNABLE_ROLES)[number] {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}
