import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";

export const platformSettingsRouter = Router();
platformSettingsRouter.use(authenticate, requireSuperAdmin);

platformSettingsRouter.get("/", async (_req, res) => {
  const rows = (await db
    .prepare("SELECT setting_key, setting_value FROM platform_settings")
    .all()) as { setting_key: string; setting_value: string }[];
  res.json(Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value])));
});

platformSettingsRouter.put("/", async (req, res) => {
  const { platformName, supportEmail } = req.body ?? {};
  if (
    typeof platformName !== "string" ||
    !platformName.trim() ||
    platformName.length > 100 ||
    typeof supportEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail) ||
    supportEmail.length > 254
  )
    return res.status(400).json({ error: "Valid platformName and supportEmail are required" });
  await db.transaction(async () => {
    for (const [key, value] of [
      ["platformName", platformName.trim()],
      ["supportEmail", supportEmail.trim().toLowerCase()],
    ])
      await db
        .prepare(
          "INSERT INTO platform_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = app_now()",
        )
        .run(key, value, req.user!.id);
  });
  res.json({ ok: true });
});
