// User-login lifecycle: the parts that need the Auth Admin API (service-role key)
// and can't be a plain RLS-governed table write.
//
// Actions:
//   create              — attach a login to an existing teacher/parent/student/staff row,
//                          or a bare SCHOOL_ADMIN. Returns { userId, tempPassword? }.
//   reset_password      — { user_id }            -> { tempPassword }
//   set_password        — { user_id, password }  -> { ok }
//   set_status          — { user_id, status }    -> { ok }   (also bans/unbans the auth user)
//   delete              — { user_id }            -> { ok }   (FK cascades clean up profile/notifs/messages)
//   upsert_school_admin — { school_id, email, name, password } -> { userId, reset }
//
// Caller authz: SUPER_ADMIN may act on any school; SCHOOL_ADMIN only within their own.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "STAFF" | "PARENT" | "STUDENT";
type Department = "ADMIN" | "ACCOUNTS" | "LIBRARY" | "TRANSPORT" | null;

const LINK_TABLE: Record<string, string> = {
  TEACHER: "teachers",
  PARENT: "parents",
  STUDENT: "students",
  STAFF: "staff",
};
const LINK_COLUMN: Record<string, string> = {
  TEACHER: "linked_teacher_id",
  PARENT: "linked_parent_id",
  STUDENT: "linked_student_id",
  STAFF: "linked_staff_id",
};

function tempPassword(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: callerProfile } = await caller
    .from("user_profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .single();
  if (!callerProfile) return json({ error: "Forbidden" }, 403);
  const callerRole = callerProfile.role as Role;
  const callerSchool = callerProfile.school_id as string | null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const canManageSchool = (schoolId: string | null) =>
    callerRole === "SUPER_ADMIN" ||
    (callerRole === "SCHOOL_ADMIN" && schoolId != null && schoolId === callerSchool);

  // Resolve the school a target login belongs to (for authz on the by-id actions).
  const targetSchool = async (userId: string): Promise<string | null | undefined> => {
    const { data } = await admin
      .from("user_profiles")
      .select("school_id")
      .eq("id", userId)
      .single();
    return data ? (data.school_id as string | null) : undefined;
  };

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = body.action as string;

  try {
    if (action === "create") {
      const role = body.role as Role;
      const email = String(body.email ?? "")
        .toLowerCase()
        .trim();
      const name = String(body.name ?? "").trim();
      const schoolId = (body.school_id as string | null) ?? null;
      const department = (body.department as Department) ?? null;
      const linkedId = body.linked_id as string | undefined;

      if (!role || !email || !name)
        return json({ error: "role, name and email are required" }, 400);
      if (!canManageSchool(role === "SUPER_ADMIN" ? null : schoolId))
        return json({ error: "Forbidden" }, 403);

      let linkedCols: Record<string, string> = {};
      if (role in LINK_TABLE) {
        if (!linkedId) return json({ error: `linked_id (${LINK_TABLE[role]}) is required` }, 400);
        const { data: row } = await admin
          .from(LINK_TABLE[role])
          .select("id")
          .eq("id", linkedId)
          .eq("school_id", schoolId)
          .single();
        if (!row)
          return json({ error: `${LINK_TABLE[role]} record not found in this school` }, 404);
        linkedCols = { [LINK_COLUMN[role]]: linkedId };
      } else if (role !== "SCHOOL_ADMIN") {
        return json({ error: "Unsupported role for a created login" }, 400);
      }

      const supplied = typeof body.password === "string" && (body.password as string).length >= 6;
      const pw = supplied ? (body.password as string) : tempPassword();

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: pw,
        email_confirm: true,
      });
      if (createErr || !created.user)
        return json({ error: createErr?.message ?? "Failed to create user" }, 400);

      const { error: profileErr } = await admin.from("user_profiles").insert({
        id: created.user.id,
        school_id: schoolId,
        role,
        department: role === "STAFF" ? department : null,
        name,
        email,
        ...linkedCols,
      });
      if (profileErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: profileErr.message }, 400);
      }
      return json({ userId: created.user.id, ...(supplied ? {} : { tempPassword: pw }) }, 201);
    }

    if (action === "reset_password" || action === "set_password") {
      const userId = body.user_id as string;
      if (!userId) return json({ error: "user_id is required" }, 400);
      const school = await targetSchool(userId);
      if (school === undefined) return json({ error: "User not found" }, 404);
      if (!canManageSchool(school)) return json({ error: "Forbidden" }, 403);

      const pw =
        action === "set_password" && typeof body.password === "string" && body.password.length >= 6
          ? (body.password as string)
          : tempPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password: pw });
      if (error) return json({ error: error.message }, 400);
      return json(action === "set_password" ? { ok: true } : { tempPassword: pw });
    }

    if (action === "set_status") {
      const userId = body.user_id as string;
      const status = body.status as string;
      if (!userId || !["ACTIVE", "SUSPENDED"].includes(status)) {
        return json({ error: "user_id and status (ACTIVE|SUSPENDED) are required" }, 400);
      }
      if (userId === user.id) return json({ error: "Cannot change your own status" }, 400);
      const school = await targetSchool(userId);
      if (school === undefined) return json({ error: "User not found" }, 404);
      if (!canManageSchool(school)) return json({ error: "Forbidden" }, 403);

      const { error: profErr } = await admin
        .from("user_profiles")
        .update({ status })
        .eq("id", userId);
      if (profErr) return json({ error: profErr.message }, 400);
      const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: status === "SUSPENDED" ? "876000h" : "none",
      });
      if (banErr) return json({ error: banErr.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete") {
      const userId = body.user_id as string;
      if (!userId) return json({ error: "user_id is required" }, 400);
      if (userId === user.id) return json({ error: "Cannot delete your own account" }, 400);
      const school = await targetSchool(userId);
      if (school === undefined) return json({ error: "User not found" }, 404);
      if (!canManageSchool(school)) return json({ error: "Forbidden" }, 403);

      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "upsert_school_admin") {
      const schoolId = body.school_id as string;
      const email = String(body.email ?? "")
        .toLowerCase()
        .trim();
      const name = String(body.name ?? "").trim() || "School Admin";
      const password = body.password as string;
      if (!schoolId || !email || typeof password !== "string" || password.length < 6) {
        return json({ error: "school_id, email and a 6+ char password are required" }, 400);
      }
      if (!canManageSchool(schoolId)) return json({ error: "Forbidden" }, 403);

      const { data: existing } = await admin
        .from("user_profiles")
        .select("id")
        .eq("school_id", schoolId)
        .eq("role", "SCHOOL_ADMIN")
        .maybeSingle();

      if (existing) {
        const { error: pwErr } = await admin.auth.admin.updateUserById(existing.id, {
          email,
          password,
        });
        if (pwErr) return json({ error: pwErr.message }, 400);
        await admin.from("user_profiles").update({ name, email }).eq("id", existing.id);
        return json({ userId: existing.id, reset: true });
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !created.user)
        return json({ error: createErr?.message ?? "Failed to create user" }, 400);
      const { error: profileErr } = await admin.from("user_profiles").insert({
        id: created.user.id,
        school_id: schoolId,
        role: "SCHOOL_ADMIN",
        name,
        email,
      });
      if (profileErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: profileErr.message }, 400);
      }
      return json({ userId: created.user.id, reset: false }, 201);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
