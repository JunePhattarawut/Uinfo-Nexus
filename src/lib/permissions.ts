// Central RBAC permission definitions.
// Add a new permission string here, then update ROLE_PERMISSIONS below.

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type Permission =
  // Workspace
  | "workspace:view"
  | "workspace:edit"
  | "workspace:delete"
  // Members
  | "members:invite"
  | "members:changeRole"
  | "members:remove"
  // Projects
  | "project:create"
  | "project:edit"
  | "project:delete"
  // Issues
  | "issue:create"
  | "issue:edit"
  | "issue:delete"
  | "issue:comment"
  // Spaces / Pages
  | "space:create"
  | "space:delete"
  | "page:create"
  | "page:edit"
  | "page:delete"
  // Admin
  | "admin:access"   // Admin panel, migration, webhooks, automation
  | "admin:users";   // Super-admin user management (OWNER only)

// ── Permission matrix ──────────────────────────────────────────────
// Every permission a role has is listed explicitly — no inheritance.
const OWNER: Permission[] = [
  "workspace:view", "workspace:edit", "workspace:delete",
  "members:invite", "members:changeRole", "members:remove",
  "project:create", "project:edit", "project:delete",
  "issue:create", "issue:edit", "issue:delete", "issue:comment",
  "space:create", "space:delete",
  "page:create", "page:edit", "page:delete",
  "admin:access", "admin:users",
];

const ADMIN: Permission[] = [
  "workspace:view", "workspace:edit",
  "members:invite", "members:changeRole", "members:remove",
  "project:create", "project:edit", "project:delete",
  "issue:create", "issue:edit", "issue:delete", "issue:comment",
  "space:create",
  "page:create", "page:edit", "page:delete",
  "admin:access",
];

const MEMBER: Permission[] = [
  "workspace:view",
  "issue:create", "issue:edit", "issue:comment",
  "page:create", "page:edit",
];

const VIEWER: Permission[] = [
  "workspace:view",
];

const ROLE_PERMISSIONS: Record<WorkspaceRole, Set<Permission>> = {
  OWNER:  new Set(OWNER),
  ADMIN:  new Set(ADMIN),
  MEMBER: new Set(MEMBER),
  VIEWER: new Set(VIEWER),
};

/** Returns true if the given role has the given permission. */
export function can(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** Ordered list for display (highest first). */
export const ROLE_ORDER: WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

/** Human-readable label + description for each role. */
export const ROLE_META: Record<WorkspaceRole, { label: string; description: string; color: string }> = {
  OWNER:  { label: "Owner",  description: "Full access, including user management", color: "bg-violet-100 text-violet-800 border-violet-200" },
  ADMIN:  { label: "Admin",  description: "Manage workspace, projects and members",  color: "bg-blue-100 text-blue-800 border-blue-200" },
  MEMBER: { label: "Member", description: "Create and edit issues and pages",         color: "bg-gray-100 text-gray-700 border-gray-200" },
  VIEWER: { label: "Viewer", description: "Read-only access to all content",          color: "bg-amber-50 text-amber-700 border-amber-200" },
};
