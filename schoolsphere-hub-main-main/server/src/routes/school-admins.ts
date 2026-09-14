import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { logAudit } from "./helpers.js";

export const schoolAdminsRouter = Router();
schoolAdminsRouter.use(authenticate, requireSuperAdmin);

schoolAdminsRouter.get("/", async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.status, u.school_id, u.created_at, s.name AS school_name
       FROM users u JOIN schools s ON s.id = u.school_id
       WHERE u.role = 'SCHOOL_ADMIN'
       ORDER BY u.created_at DESC`,
    )
    .all();
  res.json(rows);
});

schoolAdminsRouter.patch("/:id/status", async (req, res) => {
  const { status } = req.body ?? {};
  const allowed = ["ACTIVE", "SUSPENDED"];
  if (!allowed.includes(status))
    return res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });

  const result = await db
    .prepare("UPDATE users SET status = ? WHERE id = ? AND role = 'SCHOOL_ADMIN'")
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "School Admin not found" });

  await logAudit(req, "school_admin.status_changed", req.params.id, status);
  res.json({ ok: true });
});
