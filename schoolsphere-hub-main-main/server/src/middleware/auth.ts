import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Permission, Role, StaffDepartment } from "../permissions.js";
import { hasEffectivePermission } from "../rolePermissions.js";
import { config } from "../config.js";
import { db } from "../db/client.js";

export interface AuthUser {
  id: string;
  role: Role;
  schoolId: string | null;
  department: StaffDepartment | null;
  linkedTeacherId: string | null;
  linkedParentId: string | null;
  linkedStudentId: string | null;
  linkedStaffId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn,
    issuer: "schoolsphere-api",
    audience: "schoolsphere-web",
  });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !/^Bearer [^\s]+$/.test(header)) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "schoolsphere-api",
      audience: "schoolsphere-web",
    });
    if (typeof payload === "string" || typeof payload.id !== "string") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const row = await db.prepare(
      `SELECT u.id, u.role, u.school_id, u.department, u.status,
              u.linked_teacher_id, u.linked_parent_id, u.linked_student_id, u.linked_staff_id,
              s.status AS school_status
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.id = ?`,
    ).get(payload.id) as {
      id: string;
      role: Role;
      school_id: string | null;
      department: StaffDepartment | null;
      status: string;
      linked_teacher_id: string | null;
      linked_parent_id: string | null;
      linked_student_id: string | null;
      linked_staff_id: string | null;
      school_status: string | null;
    } | undefined;

    const validSchoolContext = row?.role === "SUPER_ADMIN"
      ? row.school_id === null
      : Boolean(row?.school_id && ["ACTIVE", "TRIAL"].includes(row.school_status ?? ""));
    if (!row || row.status !== "ACTIVE" || !validSchoolContext) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = {
      id: row.id,
      role: row.role,
      schoolId: row.school_id,
      department: row.department,
      linkedTeacherId: row.linked_teacher_id,
      linkedParentId: row.linked_parent_id,
      linkedStudentId: row.linked_student_id,
      linkedStaffId: row.linked_staff_id,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function authorize(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!(await hasEffectivePermission(user.schoolId, user.role, user.department, permission))) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }
    next();
  };
}

/** SUPER_ADMIN only. Use for cross-school endpoints like /api/schools. */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Super admin only" });
  }
  next();
}

/**
 * Every non-super-admin route must call this to scope queries.
 * Never reads schoolId from the client - only from the verified token.
 */
export function requireSchoolId(req: Request, res: Response): string | null {
  const schoolId = req.user?.schoolId;
  if (!schoolId) {
    res.status(403).json({ error: "No school associated with this account" });
    return null;
  }
  return schoolId;
}
