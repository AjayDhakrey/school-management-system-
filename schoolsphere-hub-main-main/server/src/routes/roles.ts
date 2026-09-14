import { Router } from "express";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_DEPARTMENT_PERMISSIONS,
  type Role,
  type StaffDepartment,
} from "../permissions.js";
import {
  EDITABLE_ROLES,
  effectivePermissions,
  isCustomized,
  resetRolePermissions,
  setRolePermissions,
} from "../rolePermissions.js";
import { logAudit } from "./helpers.js";

export const rolesRouter = Router();
rolesRouter.use(authenticate);

const STAFF_DEPARTMENTS: StaffDepartment[] = ["ADMIN", "ACCOUNTS", "LIBRARY", "TRANSPORT"];

/**
 * Read-only reference for non-editable roles (SUPER_ADMIN, SCHOOL_ADMIN) plus the school's
 * effective (default-or-customized) permission set for every editable role.
 */
rolesRouter.get("/", authorize("users.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const roles = await Promise.all(
    (["TEACHER", "PARENT", "STUDENT"] as Role[]).map(async (role) => ({
      role,
      department: null as StaffDepartment | null,
      permissions: await effectivePermissions(schoolId, role),
      customized: await isCustomized(schoolId, role),
      defaultPermissions: ROLE_PERMISSIONS[role],
    })),
  );

  const staffDepartments = await Promise.all(
    STAFF_DEPARTMENTS.map(async (department) => ({
      role: "STAFF" as Role,
      department,
      permissions: await effectivePermissions(schoolId, "STAFF", department),
      customized: await isCustomized(schoolId, "STAFF", department),
      defaultPermissions: STAFF_DEPARTMENT_PERMISSIONS[department],
    })),
  );

  res.json({
    permissions: PERMISSIONS,
    editableRoles: EDITABLE_ROLES,
    roles: [...roles, ...staffDepartments],
    // SCHOOL_ADMIN shown for reference only — never editable (see rolePermissions.ts).
    schoolAdminPermissions: ROLE_PERMISSIONS.SCHOOL_ADMIN,
  });
});

/** Replaces a role's (or staff department's) effective permission set for this school. */
rolesRouter.put("/:role", authorize("users.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const role = req.params.role as Role;
  if (!EDITABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: `${role} permissions cannot be customized` });
  }

  const { department, permissions } = req.body ?? {};
  if (!Array.isArray(permissions) || !permissions.every((p) => typeof p === "string")) {
    return res.status(400).json({ error: "permissions must be an array of permission strings" });
  }

  let dept: StaffDepartment | null = null;
  if (role === "STAFF") {
    if (!STAFF_DEPARTMENTS.includes(department)) {
      return res
        .status(400)
        .json({ error: `department must be one of ${STAFF_DEPARTMENTS.join(", ")}` });
    }
    dept = department;
  }

  const invalid = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Unknown permission(s): ${invalid.join(", ")}` });
  }

  await setRolePermissions(schoolId, role, dept, permissions);
  await logAudit(req, "role.permissions_changed", `${schoolId}:${role}:${dept ?? ""}`);
  res.json({ ok: true, permissions: await effectivePermissions(schoolId, role, dept) });
});

/** Reverts a role's (or staff department's) permissions back to the code default for this school. */
rolesRouter.post("/:role/reset", authorize("users.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const role = req.params.role as Role;
  if (!EDITABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: `${role} permissions cannot be customized` });
  }

  let dept: StaffDepartment | null = null;
  if (role === "STAFF") {
    const { department } = req.body ?? {};
    if (!STAFF_DEPARTMENTS.includes(department)) {
      return res
        .status(400)
        .json({ error: `department must be one of ${STAFF_DEPARTMENTS.join(", ")}` });
    }
    dept = department;
  }

  await resetRolePermissions(schoolId, role, dept);
  await logAudit(req, "role.permissions_reset", `${schoolId}:${role}:${dept ?? ""}`);
  res.json({ ok: true, permissions: await effectivePermissions(schoolId, role, dept) });
});
