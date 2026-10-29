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
//   create_student_logins  — { class_id, student_ids? } -> { created, switched, skipped, existing }
//                          Student-ID logins (no email needed): password = DOB as DDMMYYYY,
//                          changed by the student on first login. Older email logins are
//                          switched onto the Student ID (students sign in with it only).
//   reset_student_password — { student_id } -> { ok }   back to the DOB, change required again
//   create_parent_logins   — { school_id?, parent_ids? } -> { created, switched, skipped, existing }
//                          Mobile-number logins: parents sign in with their registered mobile;
//                          the first password is the first four letters of their name (first
//                          one capital) + the first four digits of the mobile, e.g. Raje9876.
//                          Changed by the parent on first login. Older email logins are switched.
//   reset_parent_password  — { parent_id } -> { ok }   back to the first password (and onto the
//                          current mobile number if it changed), change required again
//
// Caller authz: SUPER_ADMIN may act on any school; SCHOOL_ADMIN only within their own.
// The two student actions are also open to the class teacher of the student's class.

// npm: rather than jsr: — the dashboard deployer's jsr.io manifest fetch can time out.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

/** Projects on Supabase's new API keys expose them as JSON maps ({ default: "sb_…" }). */
function newKey(name: string): string | undefined {
  try {
    const keys = JSON.parse(Deno.env.get(name) ?? "{}") as Record<string, string>;
    return keys["default"] ?? Object.values(keys)[0];
  } catch {
    return undefined;
  }
}
// Prefer the new secret key; fall back to the legacy service-role JWT. (Legacy keys can be
// switched off in the dashboard, which made the old anon-key caller check always fail.)
const SERVICE_ROLE_KEY =
  newKey("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

// Supabase Auth needs an email, so a Student ID login gets an internal address that is
// never mailed (.invalid is reserved). The login page turns a typed Student ID into this.
// Keep in sync with STUDENT_LOGIN_DOMAIN in frontend/src/lib/student-login.ts.
const STUDENT_LOGIN_DOMAIN = "students.edunex.invalid";
const studentLoginEmail = (code: string) => `${code.toLowerCase()}@${STUDENT_LOGIN_DOMAIN}`;

/** "2016-03-14" -> "14032016" */
function dobPassword(dob: string): string {
  const [y, m, d] = dob.slice(0, 10).split("-");
  return `${d}${m}${y}`;
}

// Parents sign in with their mobile number, stored the same way under its own domain.
// Keep in sync with PARENT_LOGIN_DOMAIN in frontend/src/lib/parent-login.ts.
const PARENT_LOGIN_DOMAIN = "parents.edunex.invalid";
const parentLoginEmail = (phone: string) => `${phone}@${PARENT_LOGIN_DOMAIN}`;

/** "+91 98765 43210" -> "9876543210"; null unless it is a 10-digit mobile number. */
function cleanMobile(value: string | null): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

/** ("Rajesh Kumar", "9876543210") -> "Raje9876"; null when the name gives too few letters. */
function parentPassword(name: string, phone: string): string | null {
  const letters = name.replace(/[^A-Za-z]/g, "").slice(0, 4);
  const pw = letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() + phone.slice(0, 4);
  return pw.length >= 6 ? pw : null;
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the caller's session token directly with the Auth server (works with both the new
  // and the legacy API keys), then read their role with the trusted client.
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (!user) {
    return json(
      { error: `Your session could not be verified (${authError?.message ?? "no user"}). Sign out and sign in again.` },
      401,
    );
  }

  const { data: callerProfile } = await admin
    .from("user_profiles")
    .select("role, school_id, linked_teacher_id")
    .eq("id", user.id)
    .single();
  if (!callerProfile) return json({ error: "Forbidden" }, 403);
  const callerRole = callerProfile.role as Role;
  const callerSchool = callerProfile.school_id as string | null;
  const callerTeacherId = callerProfile.linked_teacher_id as string | null;

  const canManageSchool = (schoolId: string | null) =>
    callerRole === "SUPER_ADMIN" ||
    (callerRole === "SCHOOL_ADMIN" && schoolId != null && schoolId === callerSchool);

  /** School admins, plus the class teacher of this class, may manage its students' logins. */
  const canManageClass = (cls: { school_id: string; class_teacher_id: string | null }) =>
    canManageSchool(cls.school_id) ||
    (callerRole === "TEACHER" &&
      cls.school_id === callerSchool &&
      callerTeacherId != null &&
      cls.class_teacher_id === callerTeacherId);

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

    if (action === "create_student_logins") {
      const classId = body.class_id as string;
      if (!classId) return json({ error: "class_id is required" }, 400);
      const { data: cls } = await admin
        .from("classes")
        .select("id, school_id, class_teacher_id")
        .eq("id", classId)
        .single();
      if (!cls) return json({ error: "Class not found" }, 404);
      if (!canManageClass(cls)) {
        return json({ error: "Only the class teacher or the school admin can create these logins" }, 403);
      }

      let query = admin
        .from("students")
        .select("id, name, dob, student_code")
        .eq("class_id", classId)
        .eq("school_id", cls.school_id);
      const onlyIds = Array.isArray(body.student_ids) ? (body.student_ids as string[]) : null;
      if (onlyIds?.length) query = query.in("id", onlyIds);
      const { data: students, error: studentsErr } = await query;
      if (studentsErr) return json({ error: studentsErr.message }, 400);

      const ids = (students ?? []).map((s) => s.id as string);
      const { data: existingProfiles } = ids.length
        ? await admin
            .from("user_profiles")
            .select("id, email, linked_student_id")
            .in("linked_student_id", ids)
        : { data: [] };
      const loginByStudent = new Map<string, { id: string; email: string }>(
        (existingProfiles ?? []).map((p: Record<string, unknown>) => [
          String(p.linked_student_id),
          { id: String(p.id), email: String(p.email) },
        ]),
      );

      const created: { student_id: string; name: string; student_code: string }[] = [];
      const switched: { student_id: string; name: string; student_code: string }[] = [];
      const skipped: { student_id: string; name: string; reason: string }[] = [];
      let existing = 0;
      for (const s of students ?? []) {
        const login = loginByStudent.get(s.id);
        if (login && login.email.endsWith(`@${STUDENT_LOGIN_DOMAIN}`)) {
          existing++;
          continue;
        }
        if (!s.student_code) {
          skipped.push({ student_id: s.id, name: s.name, reason: "No Student ID yet" });
          continue;
        }
        if (!s.dob) {
          skipped.push({ student_id: s.id, name: s.name, reason: "Date of birth missing" });
          continue;
        }
        const email = studentLoginEmail(s.student_code);

        // Students sign in with their Student ID only: an older email login is moved onto
        // the Student ID (same account and data) and its password goes back to the DOB.
        if (login) {
          const { error: moveErr } = await admin.auth.admin.updateUserById(login.id, {
            email,
            password: dobPassword(s.dob),
            email_confirm: true,
          });
          if (moveErr) {
            skipped.push({ student_id: s.id, name: s.name, reason: moveErr.message });
            continue;
          }
          await admin
            .from("user_profiles")
            .update({ email, must_change_password: true })
            .eq("id", login.id);
          switched.push({ student_id: s.id, name: s.name, student_code: s.student_code });
          continue;
        }

        const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: dobPassword(s.dob),
          email_confirm: true,
        });
        if (createErr || !authUser.user) {
          skipped.push({
            student_id: s.id,
            name: s.name,
            reason: createErr?.message ?? "Could not create the login",
          });
          continue;
        }
        const { error: profileErr } = await admin.from("user_profiles").insert({
          id: authUser.user.id,
          school_id: cls.school_id,
          role: "STUDENT",
          name: s.name,
          email,
          linked_student_id: s.id,
          must_change_password: true,
        });
        if (profileErr) {
          await admin.auth.admin.deleteUser(authUser.user.id);
          skipped.push({ student_id: s.id, name: s.name, reason: profileErr.message });
          continue;
        }
        created.push({ student_id: s.id, name: s.name, student_code: s.student_code });
      }
      return json({ created, switched, skipped, existing });
    }

    if (action === "reset_student_password") {
      const studentId = body.student_id as string;
      if (!studentId) return json({ error: "student_id is required" }, 400);
      const { data: student } = await admin
        .from("students")
        .select("id, school_id, class_id, dob")
        .eq("id", studentId)
        .single();
      if (!student) return json({ error: "Student not found" }, 404);
      const { data: cls } = student.class_id
        ? await admin
            .from("classes")
            .select("school_id, class_teacher_id")
            .eq("id", student.class_id)
            .single()
        : { data: null };
      const allowed = cls ? canManageClass(cls) : canManageSchool(student.school_id);
      if (!allowed) return json({ error: "Forbidden" }, 403);
      if (!student.dob) return json({ error: "Add the student's date of birth first" }, 400);

      const { data: login } = await admin
        .from("user_profiles")
        .select("id")
        .eq("linked_student_id", studentId)
        .maybeSingle();
      if (!login) return json({ error: "This student has no login yet" }, 404);
      const { error: pwErr } = await admin.auth.admin.updateUserById(login.id, {
        password: dobPassword(student.dob),
      });
      if (pwErr) return json({ error: pwErr.message }, 400);
      await admin.from("user_profiles").update({ must_change_password: true }).eq("id", login.id);
      return json({ ok: true });
    }

    if (action === "create_parent_logins") {
      const schoolId = (body.school_id as string | undefined) ?? callerSchool;
      if (!schoolId || !canManageSchool(schoolId)) return json({ error: "Forbidden" }, 403);

      let query = admin.from("parents").select("id, name, phone").eq("school_id", schoolId);
      const onlyIds = Array.isArray(body.parent_ids) ? (body.parent_ids as string[]) : null;
      if (onlyIds?.length) query = query.in("id", onlyIds);
      const { data: parents, error: parentsErr } = await query;
      if (parentsErr) return json({ error: parentsErr.message }, 400);

      const ids = (parents ?? []).map((p) => p.id as string);
      const { data: existingProfiles } = ids.length
        ? await admin
            .from("user_profiles")
            .select("id, email, linked_parent_id")
            .in("linked_parent_id", ids)
        : { data: [] };
      const loginByParent = new Map<string, { id: string; email: string }>(
        (existingProfiles ?? []).map((p: Record<string, unknown>) => [
          String(p.linked_parent_id),
          { id: String(p.id), email: String(p.email) },
        ]),
      );

      const created: { parent_id: string; name: string; phone: string }[] = [];
      const switched: { parent_id: string; name: string; phone: string }[] = [];
      const skipped: { parent_id: string; name: string; reason: string }[] = [];
      let existing = 0;
      for (const p of parents ?? []) {
        const login = loginByParent.get(p.id);
        if (login && login.email.endsWith(`@${PARENT_LOGIN_DOMAIN}`)) {
          existing++;
          continue;
        }
        const phone = cleanMobile(p.phone);
        if (!phone) {
          skipped.push({ parent_id: p.id, name: p.name, reason: "No valid 10-digit mobile number" });
          continue;
        }
        const password = parentPassword(p.name, phone);
        if (!password) {
          skipped.push({ parent_id: p.id, name: p.name, reason: "Name has fewer than 2 letters" });
          continue;
        }
        const email = parentLoginEmail(phone);

        // Parents sign in with their mobile number: an older email login is moved onto it
        // (same account and data) and its password goes back to the first password.
        if (login) {
          const { error: moveErr } = await admin.auth.admin.updateUserById(login.id, {
            email,
            password,
            email_confirm: true,
          });
          if (moveErr) {
            skipped.push({ parent_id: p.id, name: p.name, reason: moveErr.message });
            continue;
          }
          await admin
            .from("user_profiles")
            .update({ email, must_change_password: true })
            .eq("id", login.id);
          switched.push({ parent_id: p.id, name: p.name, phone });
          continue;
        }

        const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createErr || !authUser.user) {
          skipped.push({
            parent_id: p.id,
            name: p.name,
            reason: /already|registered|exists/i.test(createErr?.message ?? "")
              ? "This mobile number is already used by another login"
              : (createErr?.message ?? "Could not create the login"),
          });
          continue;
        }
        const { error: profileErr } = await admin.from("user_profiles").insert({
          id: authUser.user.id,
          school_id: schoolId,
          role: "PARENT",
          name: p.name,
          email,
          linked_parent_id: p.id,
          must_change_password: true,
        });
        if (profileErr) {
          await admin.auth.admin.deleteUser(authUser.user.id);
          skipped.push({ parent_id: p.id, name: p.name, reason: profileErr.message });
          continue;
        }
        created.push({ parent_id: p.id, name: p.name, phone });
      }
      return json({ created, switched, skipped, existing });
    }

    if (action === "reset_parent_password") {
      const parentId = body.parent_id as string;
      if (!parentId) return json({ error: "parent_id is required" }, 400);
      const { data: parent } = await admin
        .from("parents")
        .select("id, school_id, name, phone")
        .eq("id", parentId)
        .single();
      if (!parent) return json({ error: "Parent not found" }, 404);
      if (!canManageSchool(parent.school_id)) return json({ error: "Forbidden" }, 403);
      const phone = cleanMobile(parent.phone);
      if (!phone) return json({ error: "Add the parent's 10-digit mobile number first" }, 400);
      const password = parentPassword(parent.name, phone);
      if (!password) return json({ error: "The parent's name needs at least 2 letters" }, 400);

      const { data: login } = await admin
        .from("user_profiles")
        .select("id")
        .eq("linked_parent_id", parentId)
        .maybeSingle();
      if (!login) return json({ error: "This parent has no login yet" }, 404);
      // Also moves the login onto the current mobile number, in case it was edited.
      const email = parentLoginEmail(phone);
      const { error: pwErr } = await admin.auth.admin.updateUserById(login.id, {
        email,
        password,
        email_confirm: true,
      });
      if (pwErr) return json({ error: pwErr.message }, 400);
      await admin
        .from("user_profiles")
        .update({ email, must_change_password: true })
        .eq("id", login.id);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
