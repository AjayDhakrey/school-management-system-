import { Router } from "express";
import { db } from "../db/client.js";
import { authenticate, authorize, requireSchoolId } from "../middleware/auth.js";

export const schoolProfileRouter = Router();
schoolProfileRouter.use(authenticate);

const EDITABLE_FIELDS: Record<string, string> = {
  name: "name",
  shortName: "short_name",
  tagline: "tagline",
  address: "address",
  phone: "phone",
  email: "email",
  principal: "principal",
  session: "session",
  logoUrl: "logo_url",
  code: "code",
  website: "website",
  board: "board",
  affiliation: "affiliation",
};

// Basic school identity (name, address, contact info) isn't sensitive — every authenticated
// member of the school can read it (e.g. for a fee receipt header), but only settings.manage
// can change it (see PATCH below).
schoolProfileRouter.get("/", async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const school = await db.prepare("SELECT * FROM schools WHERE id = ?").get(schoolId);
  if (!school) return res.status(404).json({ error: "School not found" });
  res.json(school);
});

schoolProfileRouter.patch("/", authorize("settings.manage"), async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const updates: string[] = [];
  const params: unknown[] = [];
  for (const [bodyKey, value] of Object.entries(req.body ?? {})) {
    const column = EDITABLE_FIELDS[bodyKey];
    if (column) {
      if (typeof value !== "string" || value.length > (column === "address" ? 500 : 200)) {
        return res
          .status(400)
          .json({ error: `${bodyKey} must be a string within the allowed length` });
      }
      if (column === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return res.status(400).json({ error: "email must be valid" });
      }
      if ((column === "website" || column === "logo_url") && value) {
        try {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        } catch {
          return res.status(400).json({ error: `${bodyKey} must be a valid HTTP(S) URL` });
        }
      }
      updates.push(`${column} = ?`);
      params.push(value.trim());
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

  params.push(schoolId);
  await db.prepare(`UPDATE schools SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});
