import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get("/", authorize("notifications.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  res.json(
    await db
      .prepare(
        "SELECT * FROM notifications WHERE school_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 200",
      )
      .all(schoolId, req.user!.id),
  );
});

notificationsRouter.patch("/:id/read", authorize("notifications.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const result = await db
    .prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ? AND school_id = ?")
    .run(req.params.id, req.user!.id, schoolId);
  if (result.changes === 0) return res.status(404).json({ error: "Notification not found" });
  res.json({ ok: true });
});

notificationsRouter.patch("/read-all", authorize("notifications.view"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  await db
    .prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND school_id = ?")
    .run(req.user!.id, schoolId);
  res.json({ ok: true });
});
