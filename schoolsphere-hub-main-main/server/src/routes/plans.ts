import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { FEATURE_KEYS, logAudit } from "./helpers.js";

export const plansRouter = Router();
plansRouter.use(authenticate, requireSuperAdmin);

plansRouter.get("/", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM plans ORDER BY price").all());
});

plansRouter.post("/", async (req, res) => {
  const { name, price, billingCycle } = req.body ?? {};
  if (typeof name !== "string" || !name.trim())
    return res.status(400).json({ error: "name is required" });
  const id = randomUUID();
  await db
    .prepare("INSERT INTO plans (id, name, price, billing_cycle) VALUES (?, ?, ?, ?)")
    .run(id, name, typeof price === "number" ? price : 0, billingCycle ?? "MONTHLY");
  res.status(201).json({ id });
});

plansRouter.patch("/:id", async (req, res) => {
  const existing = await db.prepare("SELECT id FROM plans WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Plan not found" });

  const { name, price, billingCycle, status } = req.body ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];
  if (typeof name === "string") {
    updates.push("name = ?");
    params.push(name);
  }
  if (typeof price === "number") {
    updates.push("price = ?");
    params.push(price);
  }
  if (typeof billingCycle === "string") {
    updates.push("billing_cycle = ?");
    params.push(billingCycle);
  }
  if (typeof status === "string") {
    updates.push("status = ?");
    params.push(status);
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

  params.push(req.params.id);
  await db.prepare(`UPDATE plans SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

plansRouter.get("/:id/features", async (req, res) => {
  const plan = await db.prepare("SELECT id FROM plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const rows = (await db
    .prepare("SELECT feature_key, enabled FROM plan_features WHERE plan_id = ?")
    .all(req.params.id)) as {
    feature_key: string;
    enabled: number;
  }[];
  const byKey = new Map(rows.map((r) => [r.feature_key, Boolean(r.enabled)]));
  res.json(FEATURE_KEYS.map((key) => ({ feature_key: key, enabled: byKey.get(key) ?? true })));
});

plansRouter.put("/:id/features", async (req, res) => {
  const plan = await db.prepare("SELECT id FROM plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { features } = req.body ?? {};
  if (!features || typeof features !== "object")
    return res.status(400).json({ error: "features object is required" });

  const upsert = await db.prepare(
    `INSERT INTO plan_features (plan_id, feature_key, enabled) VALUES (?, ?, ?)
     ON CONFLICT(plan_id, feature_key) DO UPDATE SET enabled = excluded.enabled`,
  );
  for (const key of FEATURE_KEYS) {
    if (key in features) upsert.run(req.params.id, key, features[key] ? 1 : 0);
  }
  await logAudit(req, "plan.features_updated", req.params.id, JSON.stringify(features));
  res.json({ ok: true });
});
