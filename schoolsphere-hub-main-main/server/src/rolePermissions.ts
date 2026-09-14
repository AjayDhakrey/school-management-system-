import { randomUUID } from "node:crypto";
import { db } from "./db/client.js";
import {
  PERMISSIONS,
  permissionsFor,
  type Permission,
  type Role,
  type StaffDepartment,
} from "./permissions.js";

interface OverrideRow {
  permission: string;
  enabled: number;
}

/**
 * Roles whose permissions can be customized per school. SCHOOL_ADMIN is deliberately excluded —
 * it's a wildcard ("everything except platform-level"), not an explicit list, so there's no safe
 * way to "edit" it without risking a real lockout with no recovery path. SUPER_ADMIN is a
 * platform-level role, not scoped to any single school at all.
 */
export const EDITABLE_ROLES: Role[] = ["TEACHER", "STAFF", "PARENT", "STUDENT"];

async function overrideRows(schoolId: string, role: Role, department: StaffDepartment | null) {
  return (await db
    .prepare(
      `SELECT permission, enabled FROM school_role_permissions WHERE school_id = ? AND role = ? AND department IS ?`,
    )
    .all(schoolId, role, department)) as OverrideRow[];
}

/** True if this (school, role[, department]) combo has ever been customized — i.e. has any override rows at all. */
export async function isCustomized(
  schoolId: string,
  role: Role,
  department?: StaffDepartment | null,
) {
  if (role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN") return false;
  return (await overrideRows(schoolId, role, department ?? null)).length > 0;
}

/** The permission set actually enforced for this role at this school — the override if customized, the code default otherwise. */
export async function effectivePermissions(
  schoolId: string | null,
  role: Role,
  department?: StaffDepartment | null,
) {
  if (!schoolId || role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN")
    return permissionsFor(role, department);
  const rows = await overrideRows(schoolId, role, department ?? null);
  if (rows.length === 0) return permissionsFor(role, department);
  return rows.filter((r) => r.enabled === 1).map((r) => r.permission) as Permission[];
}

export async function hasEffectivePermission(
  schoolId: string | null | undefined,
  role: Role,
  department: StaffDepartment | null | undefined,
  permission: Permission,
) {
  return (await effectivePermissions(schoolId ?? null, role, department)).includes(permission);
}

/**
 * Replaces the full override set for a (school, role[, department]) combo with the given
 * enabled-permission list — always a full replace, never a diff/merge, so the result is
 * unambiguous. Only EDITABLE_ROLES may be passed here (enforced by the route, not here).
 */
export async function setRolePermissions(
  schoolId: string,
  role: Role,
  department: StaffDepartment | null,
  enabledPermissions: string[],
) {
  const enabledSet = new Set(enabledPermissions);
  await db.transaction(async () => {
    await db
      .prepare(
        "DELETE FROM school_role_permissions WHERE school_id = ? AND role = ? AND department IS ?",
      )
      .run(schoolId, role, department);
    const insert = await db.prepare(
      "INSERT INTO school_role_permissions (id, school_id, role, department, permission, enabled) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const permission of PERMISSIONS) {
      await insert.run(
        randomUUID(),
        schoolId,
        role,
        department,
        permission,
        enabledSet.has(permission) ? 1 : 0,
      );
    }
  });
}

/** Reverts a (school, role[, department]) combo back to the code default. */
export async function resetRolePermissions(
  schoolId: string,
  role: Role,
  department: StaffDepartment | null,
) {
  await db
    .prepare(
      "DELETE FROM school_role_permissions WHERE school_id = ? AND role = ? AND department IS ?",
    )
    .run(schoolId, role, department);
}
