import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";

export const auditRouter = Router();
auditRouter.use(authenticate, requireSuperAdmin);

auditRouter.get("/", async (req, res) => {
  const { action } = req.query;
  if (typeof action === "string" && action.trim()) {
    res.json(
      await db
        .prepare("SELECT * FROM audit_log WHERE action = ? ORDER BY created_at DESC LIMIT 500")
        .all(action),
    );
    return;
  }
  res.json(await db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500").all());
});
