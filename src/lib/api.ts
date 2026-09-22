import { supabase } from "./supabase";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// The portal pages were written against the retired Express API (`/students`, `/fees/:id/pay`,
// ...). This module keeps that contract and serves each route from Supabase: plain reads and
// writes go through PostgREST under RLS, and multi-step rules go through the RPCs in
// supabase/migrations/ (27_rpc_functions.sql, 32_admission_stage_machine.sql,
// 33_platform_rpcs.sql).

type Row = Record<string, unknown>;
type Method = "POST" | "PATCH" | "PUT" | "DELETE";
type DbError = {
  message?: string | undefined;
  code?: string | undefined;
  details?: string | null | undefined;
} | null;

const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const TABLES: Record<string, string> = {
  "academic-years": "academic_years",
  announcements: "announcements",
  admissions: "admissions",
  attendance: "attendance",
  audit: "audit_log",
  certificates: "certificates",
  classes: "classes",
  events: "events",
  exams: "exams",
  "fee-structures": "fee_structures",
  fees: "fees",
  holidays: "holidays",
  homework: "homework",
  "homework-submissions": "homework_submissions",
  leads: "leads",
  leave: "leave_requests",
  notices: "notices",
  notifications: "notifications",
  parents: "parents",
  payments: "payments",
  plans: "plans",
  results: "results",
  "salary-structures": "salary_structures",
  payroll: "payroll_items",
  rooms: "rooms",
  staff: "staff",
  "staff-attendance": "staff_attendance",
  students: "students",
  subjects: "subjects",
  support: "support_tickets",
  teachers: "teachers",
  "teacher-attendance": "teacher_attendance",
  timetable: "timetable_slots",
  transport: "vehicles",
  users: "user_profiles",
};

// Rows the platform (not a school) owns; POSTs to these never get a school_id.
const PLATFORM_TABLES = [
  "schools",
  "plans",
  "leads",
  "announcements",
  "payments",
  "support_tickets",
];

// `staff.department` is an enum; the staff screens show and send these labels.
const STAFF_DEPARTMENT_LABELS: Record<string, string> = {
  ADMIN: "Administration",
  ACCOUNTS: "Accounts",
  LIBRARY: "Library",
  TRANSPORT: "Transport",
};

const ADMISSION_STATUS_FOR_STAGE: Record<string, string> = {
  ENQUIRY: "New",
  WAITLISTED: "Waitlisted",
  APPROVED: "Approved",
  CONVERTED: "Approved",
  REJECTED: "Rejected",
};

const ADMISSION_DOCUMENTS_BUCKET = "admission-documents";

const FEATURE_KEYS = [
  "Attendance",
  "Fees",
  "Exams",
  "Homework",
  "Library",
  "Transport",
  "Timetable",
  "Admissions",
];

const SCHOOL_OPTION_TYPES = ["teacher-designations", "staff-departments", "staff-designations"];

const EMPLOYEE = {
  "teacher-attendance": {
    kind: "teacher",
    people: "teachers",
    table: "teacher_attendance",
    fk: "teacher_id",
    idKey: "teacherId",
    role: "TEACHER",
  },
  "staff-attendance": {
    kind: "staff",
    people: "staff",
    table: "staff_attendance",
    fk: "staff_id",
    idKey: "staffId",
    role: "STAFF",
  },
} as const;
type EmployeeResource = keyof typeof EMPLOYEE;
const isEmployeeResource = (value: string | undefined): value is EmployeeResource =>
  value === "teacher-attendance" || value === "staff-attendance";

// Messages for unique indexes, matching what the Express API said for the same conflict.
const UNIQUE_MESSAGES: Record<string, string> = {
  uq_timetable_class_slot: "This class already has a period scheduled at that day and time",
  uq_timetable_teacher_slot: "This teacher is already scheduled at that day and time",
  uq_timetable_room_slot: "This room is already booked at that day and time",
  uq_exam_schedule: "A conflicting exam schedule already exists",
  uq_teachers_employee_id: "Employee ID already exists",
  uq_staff_employee_id: "Employee ID already exists",
  uq_academic_years_school_name: "Academic year already exists",
  uq_academic_years_one_active: "Another academic year is already active",
  uq_classes_year_name_section: "This class and section already exists for the academic year",
  uq_subjects_school_name: "Subject name or code already exists",
  uq_subjects_school_code: "Subject name or code already exists",
  uq_rooms_school_name: "Room name or number already exists",
  uq_rooms_school_number: "Room name or number already exists",
  class_subjects_class_id_subject_id_key: "Subject is already assigned to this class/section",
  uq_fee_structures_equivalent: "An equivalent active fee structure already exists",
  user_profiles_email_key: "A login with this email already exists",
  ux_library_one_active_issue_per_book: "Book is already issued",
};

const toSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
function snakeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      toSnake(key),
      snakeObject(item),
    ]),
  );
}

function fail(error: DbError, status = 400): never {
  let message = error?.message ?? "Supabase request failed";
  switch (error?.code) {
    case "23505": {
      const name = /constraint "([^"]+)"/.exec(message)?.[1];
      message = (name && UNIQUE_MESSAGES[name]) ?? "A record with these details already exists";
      status = 409;
      break;
    }
    case "23503":
      message = "This record is linked to other data and cannot be removed or changed";
      status = 409;
      break;
    case "23514":
    case "22P02":
      message = "One of the values sent is not valid";
      status = 400;
      break;
    case "42501":
      if (message.includes("row-level security")) message = "You do not have permission to do this";
      status = 403;
      break;
    case "PGRST116":
      message = "Record not found or you do not have access to it";
      status = 404;
      break;
  }
  throw new ApiError(status, message, error);
}

// supabase-js reports every non-2xx function response as a generic "non-2xx status code"
// error; the function's own `{ error }` body is what the user needs to see.
async function invokeFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const response: unknown = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
      if (typeof payload?.error === "string") throw new ApiError(response.status, payload.error);
    }
    fail(error);
  }
  return data as Row;
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) fail(error);
  return data as T;
}

// ---------------------------------------------------------------------------
// Signed-in profile (role, school, linked record ids), cached per auth user.
// ---------------------------------------------------------------------------

interface Profile {
  id: string;
  role: string;
  school_id: string | null;
  department: string | null;
  name: string | null;
  email: string;
  linked_teacher_id: string | null;
  linked_parent_id: string | null;
  linked_student_id: string | null;
  linked_staff_id: string | null;
}

let cachedProfile: { userId: string; promise: Promise<Profile> } | null = null;
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") {
    cachedProfile = null;
  }
});

async function profile(): Promise<Profile> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new ApiError(401, "Session expired, please sign in again");
  if (cachedProfile?.userId !== userId) {
    const promise = (async () => {
      const { data: row, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) fail(error, 401);
      return row as Profile;
    })();
    cachedProfile = { userId, promise };
    promise.catch(() => {
      if (cachedProfile?.promise === promise) cachedProfile = null;
    });
  }
  return cachedProfile.promise;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

// PostgREST caps a response at 1000 rows; the Express API returned whole lists.
const PAGE_SIZE = 1000;
type Pageable = {
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: DbError }>;
};
async function selectAll(build: () => Pageable): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) fail(error);
    const page = (data ?? []) as Row[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

async function selectOne(table: string, id: string, columns = "*"): Promise<Row> {
  const { data, error } = await supabase.from(table).select(columns).eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new ApiError(404, "Record not found");
  return data as unknown as Row;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const isDate = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isMonth = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
const nextMonthStart = (month: string) => {
  const [year = 0, mon = 0] = month.split("-").map(Number);
  return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
};
const contains = (haystack: unknown, needle: string) =>
  String(haystack ?? "")
    .toLowerCase()
    .includes(needle.toLowerCase());

// Moves an embedded PostgREST object's fields onto the row under new names.
function flatten(row: Row, embed: string, fields: Record<string, string>) {
  const nested = row[embed];
  const source = (Array.isArray(nested) ? nested[0] : nested) as Row | null | undefined;
  for (const [from, to] of Object.entries(fields)) row[to] = source?.[from] ?? null;
  delete row[embed];
  return row;
}

function byKeys<T extends Row>(rows: T[], ...keys: string[]) {
  return rows.sort((a, b) => {
    for (const key of keys) {
      const desc = key.startsWith("-");
      const name = desc ? key.slice(1) : key;
      const left = a[name];
      const right = b[name];
      if (left === right) continue;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : naturalCollator.compare(String(left), String(right));
      if (order === 0) continue;
      return desc ? -order : order;
    }
    return 0;
  });
}

function staffDepartmentCode(value: string) {
  const upper = value.trim().toUpperCase();
  return (
    Object.keys(STAFF_DEPARTMENT_LABELS).find(
      (code) => code === upper || STAFF_DEPARTMENT_LABELS[code]?.toUpperCase() === upper,
    ) ?? (upper === "ACCOUNT" ? "ACCOUNTS" : null)
  );
}

function normalizeAttendanceStatus(value: string | null) {
  const found = ["Present", "Absent", "Late", "Leave"].find(
    (status) => status.toLowerCase() === (value ?? "").trim().toLowerCase(),
  );
  return found ?? null;
}

function summarizeAttendance(rows: Row[]) {
  const counts = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const row of rows) {
    if (row["status"] === "Present") counts.present++;
    else if (row["status"] === "Absent") counts.absent++;
    else if (row["status"] === "Late") counts.late++;
    else if (row["status"] === "Leave") counts.leave++;
  }
  const eligible = counts.present + counts.late + counts.absent;
  const percentage = eligible
    ? Math.round(((counts.present + counts.late) / eligible) * 1000) / 10
    : 0;
  return {
    ...counts,
    total: counts.present + counts.absent + counts.late + counts.leave,
    eligible,
    percentage,
  };
}

// The restored schema keeps teacher assignments in `class_subjects` and parent links in
// `student_guardians`/`students.parent_id`. The UI still reads the flat JSON-array columns
// the previous backend exposed, so rebuild them here rather than at every call site.
async function addDerivedColumns(table: string, rows: Row[]) {
  const ids = rows.map((row) => row["id"]).filter((id): id is string => typeof id === "string");
  if (!ids.length) return rows;
  const collect = (map: Map<string, Set<string>>, key: unknown, value: unknown) => {
    if (typeof key !== "string" || typeof value !== "string") return;
    const bucket = map.get(key) ?? new Set<string>();
    bucket.add(value);
    map.set(key, bucket);
  };
  const apply = (row: Row, field: string, map: Map<string, Set<string>>) => {
    const id = row["id"];
    row[field] = JSON.stringify(typeof id === "string" ? [...(map.get(id) ?? [])] : []);
  };
  const loginIds = async (column: string) => {
    const { data } = await supabase.from("user_profiles").select(`id,${column}`).in(column, ids);
    return new Map(
      ((data ?? []) as unknown as Row[]).map((login) => [String(login[column]), login["id"]]),
    );
  };

  if (table === "teachers") {
    const [assignments, logins] = await Promise.all([
      supabase
        .from("class_subjects")
        .select("teacher_id,class_id,subject_id")
        .in("teacher_id", ids),
      loginIds("linked_teacher_id"),
    ]);
    const classes = new Map<string, Set<string>>();
    const subjects = new Map<string, Set<string>>();
    for (const row of assignments.data ?? []) {
      collect(classes, row.teacher_id, row.class_id);
      collect(subjects, row.teacher_id, row.subject_id);
    }
    for (const row of rows) {
      apply(row, "assigned_classes", classes);
      apply(row, "assigned_subjects", subjects);
      row["user_id"] = logins.get(String(row["id"])) ?? null;
    }
    return rows;
  }

  if (table === "staff") {
    const logins = await loginIds("linked_staff_id");
    for (const row of rows) {
      const code = row["department"];
      if (typeof code === "string") row["department"] = STAFF_DEPARTMENT_LABELS[code] ?? code;
      row["user_id"] = logins.get(String(row["id"])) ?? null;
    }
    return rows;
  }

  if (table === "admissions") {
    // The Dashboard still counts the legacy `status` mirror of `stage`.
    for (const row of rows)
      row["status"] = ADMISSION_STATUS_FOR_STAGE[String(row["stage"])] ?? "Pending";
    return rows;
  }

  if (table === "events") {
    // Stored as event_date/event_time; the calendar and list views read date/time.
    for (const row of rows) {
      row["date"] = row["event_date"] ?? "";
      row["time"] = row["event_time"] ?? "";
    }
    return rows;
  }

  if (table === "parents") {
    const [guardians, children] = await Promise.all([
      supabase.from("student_guardians").select("parent_id,student_id").in("parent_id", ids),
      supabase.from("students").select("id,parent_id").in("parent_id", ids),
    ]);
    const linked = new Map<string, Set<string>>();
    for (const row of guardians.data ?? []) collect(linked, row.parent_id, row.student_id);
    for (const row of children.data ?? []) collect(linked, row.parent_id, row.id);
    for (const row of rows) apply(row, "linked_student_ids", linked);
    return rows;
  }

  return rows;
}

async function teacherAssignments(teacherId: string) {
  const rows = await selectAll(() =>
    supabase
      .from("class_subjects")
      .select("id,class_id,subject_id,classes(name,section),subjects(name)")
      .eq("teacher_id", teacherId)
      .order("id"),
  );
  return rows.map((row) =>
    flatten(flatten(row, "classes", { name: "class_name", section: "section" }), "subjects", {
      name: "subject_name",
    }),
  );
}

// A parent's selected child: the child row if it's theirs (RLS hides anyone else's).
async function ownedChild(studentId: string | null) {
  if (!studentId) return null;
  const { data } = await supabase
    .from("students")
    .select("id,class_id")
    .eq("id", studentId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function parse(path: string) {
  const url = new URL(path, "http://local");
  return { parts: url.pathname.split("/").filter(Boolean), search: url.searchParams };
}

async function get<T>(path: string): Promise<T> {
  const { parts, search } = parse(path);
  return (await read(parts, search)) as T;
}

async function read(parts: string[], search: URLSearchParams): Promise<unknown> {
  const [resource, second, third] = parts;
  const param = (key: string) => search.get(key) || null;

  switch (resource) {
    case "roles":
      return rpc("get_school_role_matrix");

    // Lets the UI hide actions the signed-in user's role has been switched off for.
    case "permissions":
      if (!second) break;
      return rpc<boolean>("has_permission", { p_permission: second });

    case "school-profile": {
      const current = await profile();
      if (!current.school_id) throw new ApiError(404, "School not found");
      return selectOne("schools", current.school_id);
    }

    case "platform-settings": {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("setting_key,setting_value");
      if (error) fail(error);
      return Object.fromEntries((data ?? []).map((row) => [row.setting_key, row.setting_value]));
    }

    case "school-options": {
      const { data, error } = await supabase
        .from("school_options")
        .select("option_type,option_value")
        .order("option_value");
      if (error) fail(error);
      return Object.fromEntries(
        SCHOOL_OPTION_TYPES.map((type) => [
          type,
          (data ?? []).filter((row) => row.option_type === type).map((row) => row.option_value),
        ]),
      );
    }

    case "academic-years":
      if (second) return selectOne("academic_years", second);
      return selectAll(() =>
        supabase
          .from("academic_years")
          .select("*")
          .order("start_date", { ascending: false })
          .order("id"),
      );

    case "schools": {
      const schools = second
        ? [await selectOne("schools", second)]
        : await selectAll(() => supabase.from("schools").select("*").order("name").order("id"));
      const admins = await selectAll(() =>
        supabase
          .from("user_profiles")
          .select("id,name,email,school_id")
          .eq("role", "SCHOOL_ADMIN")
          .order("created_at")
          .order("id"),
      );
      for (const school of schools) {
        const admin = admins.find((row) => row["school_id"] === school["id"]);
        school["admin"] = admin
          ? { id: admin["id"], name: admin["name"], email: admin["email"] }
          : null;
      }
      return second ? schools[0] : schools;
    }

    case "school-admins": {
      const rows = await selectAll(() =>
        supabase
          .from("user_profiles")
          .select("id,name,email,status,school_id,created_at,schools(name)")
          .eq("role", "SCHOOL_ADMIN")
          .order("created_at", { ascending: false })
          .order("id"),
      );
      return rows.map((row) => flatten(row, "schools", { name: "school_name" }));
    }

    case "support":
    case "payments": {
      const table = TABLES[resource] ?? resource;
      const rows = await selectAll(() => {
        const query = supabase.from(table).select("*,schools(name)");
        return (
          resource === "payments"
            ? query.order("paid_on", { ascending: false }).order("created_at", { ascending: false })
            : query.order("created_at", { ascending: false })
        ).order("id");
      });
      return rows.map((row) => flatten(row, "schools", { name: "school_name" }));
    }

    case "plans": {
      if (second && third === "features") {
        const { data, error } = await supabase
          .from("plan_features")
          .select("feature_key,enabled")
          .eq("plan_id", second);
        if (error) fail(error);
        const enabled = new Map(
          (data ?? []).map((row) => [String(row.feature_key), Boolean(row.enabled)]),
        );
        return FEATURE_KEYS.map((key) => ({ feature_key: key, enabled: enabled.get(key) ?? true }));
      }
      if (second) return selectOne("plans", second);
      return selectAll(() => supabase.from("plans").select("*").order("price").order("id"));
    }

    case "leads":
    case "announcements":
      return selectAll(() =>
        supabase.from(resource).select("*").order("created_at", { ascending: false }).order("id"),
      );

    case "audit": {
      let query = supabase.from("audit_log").select("*");
      const action = param("action");
      if (action) query = query.eq("action", action);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
      if (error) fail(error);
      return data ?? [];
    }

    case "users":
      return selectAll(() =>
        supabase
          .from("user_profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id"),
      );

    case "students": {
      if (second === "me") {
        const current = await profile();
        if (current.role !== "STUDENT" || !current.linked_student_id) {
          throw new ApiError(403, "Students only");
        }
        return selectOne("students", current.linked_student_id);
      }
      if (second) return selectOne("students", second);
      const rows = await selectAll(() => {
        let query = supabase.from("students").select("*");
        const filters: [string, string][] = [
          ["academicYearId", "academic_year_id"],
          ["classId", "class_id"],
          ["className", "class_name"],
          ["section", "section"],
          ["status", "status"],
        ];
        for (const [key, column] of filters) {
          const value = param(key);
          if (value) query = query.eq(column, value);
        }
        return query.order("name").order("id");
      });
      const q = param("q")?.trim();
      return q
        ? rows.filter(
            (row) =>
              contains(row["name"], q) ||
              contains(row["admission_no"], q) ||
              contains(row["roll"], q),
          )
        : rows;
    }

    case "teachers":
    case "staff": {
      const current = await profile();
      if (second === "me") {
        const linked =
          resource === "teachers" ? current.linked_teacher_id : current.linked_staff_id;
        if (!linked)
          throw new ApiError(403, resource === "teachers" ? "Teachers only" : "Staff only");
        const [row] = await addDerivedColumns(resource, [await selectOne(resource, linked)]);
        if (row && resource === "teachers") row["assignments"] = await teacherAssignments(linked);
        return row;
      }
      if (second) {
        const [row] = await addDerivedColumns(resource, [await selectOne(resource, second)]);
        if (row && resource === "teachers") row["assignments"] = await teacherAssignments(second);
        return row;
      }
      const rows = await selectAll(() => {
        let query = supabase.from(resource).select("*");
        // A TEACHER / STAFF member only ever sees their own record through this list.
        if (resource === "teachers" && current.role === "TEACHER") {
          query = query.eq(
            "id",
            current.linked_teacher_id ?? "00000000-0000-0000-0000-000000000000",
          );
        }
        if (resource === "staff" && current.role === "STAFF") {
          query = query.eq("id", current.linked_staff_id ?? "00000000-0000-0000-0000-000000000000");
        }
        const department = param("department");
        if (department) {
          query = query.eq(
            "department",
            resource === "staff" ? (staffDepartmentCode(department) ?? department) : department,
          );
        }
        const status = param("status");
        if (status)
          query = query.eq("employment_status", status.trim().toUpperCase().replace(/\s+/g, "_"));
        return query.order("name").order("id");
      });
      const q = param("q")?.trim();
      const filtered = q
        ? rows.filter(
            (row) =>
              contains(row["name"], q) ||
              contains(row["employee_id"], q) ||
              contains(row["email"], q),
          )
        : rows;
      return addDerivedColumns(resource, filtered);
    }

    case "parents": {
      if (second && third === "children") {
        const rows = await selectAll(() =>
          supabase
            .from("student_guardians")
            .select("relationship,is_primary,students(*)")
            .eq("parent_id", second)
            .order("id"),
        );
        return byKeys(
          rows
            .filter((row) => row["students"])
            .map((row) => ({
              ...(row["students"] as Row),
              relationship: row["relationship"],
              is_primary: row["is_primary"],
            })),
          "name",
        );
      }
      const rows = second
        ? [await selectOne("parents", second)]
        : await selectAll(() => supabase.from("parents").select("*").order("name").order("id"));
      const enriched = await addDerivedColumns("parents", rows);
      return second ? enriched[0] : enriched;
    }

    case "classes": {
      const columns = "*,academic_years(name),rooms(name),teachers(name)";
      const rows = second
        ? [await selectOne("classes", second, columns)]
        : await selectAll(() =>
            supabase.from("classes").select(columns).order("name").order("section").order("id"),
          );
      for (const row of rows) {
        flatten(row, "academic_years", { name: "academic_year_name" });
        flatten(row, "rooms", { name: "room_name" });
        flatten(row, "teachers", { name: "class_teacher_name" });
      }
      return second ? rows[0] : byKeys(rows, "name", "section", "id");
    }

    case "rooms":
      if (second) return selectOne("rooms", second);
      return selectAll(() => supabase.from("rooms").select("*").order("name").order("id"));

    case "subjects": {
      if (second === "mappings" || second === "my-teaching" || second === "my-class") {
        const current = await profile();
        let classId: string | null = null;
        if (
          second === "my-teaching" &&
          (current.role !== "TEACHER" || !current.linked_teacher_id)
        ) {
          throw new ApiError(403, "Teachers only");
        }
        if (second === "my-class") {
          if (current.role !== "STUDENT" || !current.linked_student_id) {
            throw new ApiError(403, "Students only");
          }
          const own = await ownedChild(current.linked_student_id);
          classId = typeof own?.["class_id"] === "string" ? own["class_id"] : null;
          if (!classId) return [];
        }
        const rows = await selectAll(() => {
          let query = supabase
            .from("class_subjects")
            .select(
              "*,classes(name,section),subjects(name,code,type,credits,description),teachers(name,email,phone,photo_url)",
            );
          if (second === "my-teaching")
            query = query.eq("teacher_id", current.linked_teacher_id ?? "");
          if (classId) query = query.eq("class_id", classId);
          for (const [key, column] of [
            ["classId", "class_id"],
            ["teacherId", "teacher_id"],
            ["subjectId", "subject_id"],
          ] as const) {
            const value = second === "mappings" ? param(key) : null;
            if (value) query = query.eq(column, value);
          }
          return query.order("id");
        });
        const mapped = rows.map((row) => {
          flatten(row, "classes", { name: "class_name", section: "section" });
          flatten(row, "subjects", {
            name: "subject_name",
            code: "subject_code",
            type: "subject_type",
            credits: "subject_credits",
            description: "subject_description",
          });
          return flatten(row, "teachers", {
            name: "teacher_name",
            email: "teacher_email",
            phone: "teacher_phone",
            photo_url: "teacher_photo_url",
          });
        });
        return second === "my-teaching"
          ? byKeys(mapped, "subject_name", "class_name", "section")
          : second === "my-class"
            ? byKeys(mapped, "subject_name")
            : byKeys(mapped, "class_name", "section", "subject_name");
      }
      if (second) return selectOne("subjects", second);
      return selectAll(() => supabase.from("subjects").select("*").order("name").order("id"));
    }

    case "attendance": {
      if (second === "roster") {
        return rpc("attendance_roster", { p_class_id: param("classId"), p_date: param("date") });
      }
      const summary = second === "summary";
      const rows = await selectAll(() => {
        let query = supabase
          .from("attendance")
          .select(
            summary ? "id,status" : "*,students(name,admission_no,roll),classes(name,section)",
          );
        for (const [key, column] of [
          ["studentId", "student_id"],
          ["classId", "class_id"],
          ["academicYearId", "academic_year_id"],
        ] as const) {
          const value = param(key);
          if (value) query = query.eq(column, value);
        }
        const date = param("date");
        const from = param("from");
        const to = param("to");
        const month = param("month");
        if (!summary) {
          const status = normalizeAttendanceStatus(param("status"));
          if (status) query = query.eq("status", status);
          if (isDate(date)) query = query.eq("date", date);
          if (isMonth(month))
            query = query.gte("date", `${month}-01`).lt("date", nextMonthStart(month));
        }
        if (isDate(from)) query = query.gte("date", from);
        if (isDate(to)) query = query.lte("date", to);
        return query.order("date", { ascending: false }).order("id");
      });
      if (summary) return summarizeAttendance(rows);
      const section = param("section")?.toLowerCase();
      const q = param("q")?.trim();
      const shaped = rows
        .map((row) => {
          flatten(row, "students", {
            name: "student_name",
            admission_no: "admission_no",
            roll: "student_roll",
          });
          return flatten(row, "classes", { name: "class_name", section: "section" });
        })
        .filter((row) => !section || String(row["section"] ?? "").toLowerCase() === section)
        .filter(
          (row) => !q || contains(row["student_name"], q) || contains(row["admission_no"], q),
        );
      return byKeys(shaped, "-date", "student_roll", "student_name");
    }

    case "teacher-attendance":
    case "staff-attendance": {
      const cfg = EMPLOYEE[resource];
      const current = await profile();
      const department = param("department");
      const matchesDepartment = (value: unknown) => {
        if (!department) return true;
        const wanted =
          cfg.kind === "staff" ? (staffDepartmentCode(department) ?? department) : department;
        return String(value ?? "").toUpperCase() === wanted.toUpperCase();
      };
      const label = (code: unknown) =>
        cfg.kind === "staff" && typeof code === "string"
          ? (STAFF_DEPARTMENT_LABELS[code] ?? code)
          : code;

      if (second === "roster") {
        const date = param("date");
        if (!isDate(date)) throw new ApiError(400, "date must be a valid YYYY-MM-DD calendar date");
        const [people, marks] = await Promise.all([
          selectAll(() =>
            supabase
              .from(cfg.people)
              .select("id,name,employee_id,department,employment_status")
              .in("employment_status", ["ACTIVE", "ON_LEAVE"])
              .order("name")
              .order("id"),
          ),
          selectAll(() =>
            supabase
              .from(cfg.table)
              .select(`id,${cfg.fk},status,remarks`)
              .eq("date", date)
              .order("id"),
          ),
        ]);
        const byPerson = new Map(marks.map((mark) => [String(mark[cfg.fk]), mark]));
        const q = param("q")?.trim();
        return {
          date,
          people: people
            .filter((person) => matchesDepartment(person["department"]))
            .filter(
              (person) => !q || contains(person["name"], q) || contains(person["employee_id"], q),
            )
            .map((person) => {
              const mark = byPerson.get(String(person["id"]));
              return {
                ...person,
                department: label(person["department"]),
                attendance_id: mark?.["id"] ?? null,
                status: mark?.["status"] ?? null,
                remarks: mark?.["remarks"] ?? null,
              };
            }),
        };
      }

      const rows = await selectAll(() => {
        let query = supabase
          .from(cfg.table)
          .select(`*,${cfg.people}(name,employee_id,department,employment_status)`);
        const self = cfg.kind === "teacher" ? current.linked_teacher_id : current.linked_staff_id;
        if (current.role === cfg.role)
          query = query.eq(cfg.fk, self ?? "00000000-0000-0000-0000-000000000000");
        const person = param(cfg.idKey);
        if (person) query = query.eq(cfg.fk, person);
        const status = normalizeAttendanceStatus(param("status"));
        if (status) query = query.eq("status", status);
        const date = param("date");
        const from = param("from");
        const to = param("to");
        const month = param("month");
        if (isDate(date)) query = query.eq("date", date);
        if (isMonth(month))
          query = query.gte("date", `${month}-01`).lt("date", nextMonthStart(month));
        if (isDate(from)) query = query.gte("date", from);
        if (isDate(to)) query = query.lte("date", to);
        return query.order("date", { ascending: false }).order("id");
      });
      const shaped = rows
        .map((row) =>
          flatten(row, cfg.people, {
            name: "person_name",
            employee_id: "employee_id",
            department: "department",
            employment_status: "employment_status",
          }),
        )
        .filter((row) => matchesDepartment(row["department"]))
        .map((row) => ({ ...row, department: label(row["department"]) }));
      if (second === "summary") return summarizeAttendance(shaped);
      return byKeys(shaped, "-date", "person_name");
    }

    case "exams": {
      const columns = "*,subjects(name),classes(name,section),academic_years(name),rooms(name)";
      const shape = (row: Row) => {
        flatten(row, "subjects", { name: "subject_name" });
        flatten(row, "classes", { name: "class_name", section: "section" });
        flatten(row, "academic_years", { name: "academic_year_name" });
        return flatten(row, "rooms", { name: "room_name" });
      };
      if (second) return shape(await selectOne("exams", second, columns));
      const child = await ownedChild(param("studentId"));
      if (param("studentId") && !child?.["class_id"]) return [];
      const rows = await selectAll(() => {
        let query = supabase.from("exams").select(columns);
        if (typeof child?.["class_id"] === "string")
          query = query.eq("class_id", child["class_id"]);
        return query.order("date").order("start_time").order("id");
      });
      return rows.map(shape);
    }

    case "results": {
      if (second) throw new ApiError(404, "Unsupported backend route: report cards");
      const rows = await selectAll(() => {
        let query = supabase
          .from("results")
          .select("*,exams(subject_id,subject,name,status,passing_marks,date)");
        const studentId = param("studentId");
        const examId = param("examId");
        if (studentId) query = query.eq("student_id", studentId);
        if (examId) query = query.eq("exam_id", examId);
        return query.order("id");
      });
      const shaped = rows.map((row) =>
        flatten(row, "exams", {
          subject_id: "subject_id",
          subject: "subject",
          name: "exam_name",
          status: "exam_status",
          passing_marks: "passing_marks",
          date: "exam_date",
        }),
      );
      return byKeys(shaped, "exam_date", "student_id");
    }

    case "fee-structures": {
      const rows = await selectAll(() => {
        let query = supabase
          .from("fee_structures")
          .select("*,academic_years(name,start_date),classes(name,section)");
        for (const [key, column] of [
          ["academicYearId", "academic_year_id"],
          ["classId", "class_id"],
          ["category", "category"],
          ["status", "status"],
        ] as const) {
          const value = param(key);
          if (value) query = query.eq(column, value);
        }
        return query.order("id");
      });
      const shaped = rows.map((row) => {
        flatten(row, "academic_years", {
          name: "academic_year_name",
          start_date: "academic_year_start",
        });
        return flatten(row, "classes", { name: "class_name", section: "section" });
      });
      return byKeys(shaped, "-academic_year_start", "category", "fee_type");
    }

    case "salary-structures":
      return selectAll(() =>
        supabase
          .from("salary_structures")
          .select("*")
          .order("effective_from", { ascending: false }),
      );

    case "payroll": {
      const current = await profile();
      return selectAll(() => {
        let query = supabase.from("payroll_items").select("*");
        const month = param("month");
        if (month) query = query.eq("payroll_month", `${month.slice(0, 7)}-01`);
        if (current.role === "TEACHER")
          query = query
            .eq("employee_type", "TEACHER")
            .eq("employee_id", current.linked_teacher_id ?? "00000000-0000-0000-0000-000000000000");
        else if (current.role === "STAFF" && current.department !== "ACCOUNTS")
          query = query
            .eq("employee_type", "STAFF")
            .eq("employee_id", current.linked_staff_id ?? "00000000-0000-0000-0000-000000000000");
        return query.order("payroll_month", { ascending: false }).order("created_at");
      });
    }

    case "fees": {
      if (second === "receipts") {
        if (third) return selectOne("fee_receipts", third);
        return selectAll(() => {
          let query = supabase.from("fee_receipts").select("*");
          const studentId = param("studentId");
          if (studentId) query = query.eq("student_id", studentId);
          return query
            .order("payment_date", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id");
        });
      }
      if (second && third === "payments") {
        await selectOne("fees", second, "id");
        const rows = await selectAll(() =>
          supabase
            .from("fee_payments")
            .select("*,fee_receipts(id,receipt_no)")
            .eq("fee_id", second)
            .order("payment_date")
            .order("created_at")
            .order("id"),
        );
        return rows.map((row) =>
          flatten(row, "fee_receipts", { id: "receipt_id", receipt_no: "receipt_no" }),
        );
      }
      const today = new Date().toISOString().slice(0, 10);
      const shape = (row: Row) => {
        flatten(row, "students", { name: "student_name", admission_no: "admission_no" });
        flatten(row, "classes", { name: "class_name", section: "section" });
        flatten(row, "academic_years", { name: "academic_year_name" });
        const amount = Number(row["amount"] ?? 0);
        const discount = Number(row["discount"] ?? 0);
        const fine = Number(row["fine"] ?? 0);
        const paid = Number(row["paid_amount"] ?? 0);
        const total = Math.max(0, amount - discount + fine);
        const overdue = typeof row["due_date"] === "string" && row["due_date"] < today;
        Object.assign(row, {
          amount,
          discount,
          fine,
          paid_amount: paid,
          total_fee: total,
          outstanding_amount: Math.max(0, total - paid),
          calculated_status:
            paid >= total ? "Paid" : paid > 0 ? "Partial" : overdue ? "Overdue" : "Pending",
          overdue_amount: overdue ? Math.max(0, total - paid) : 0,
        });
        return row;
      };
      const columns = "*,students(name,admission_no),classes(name,section),academic_years(name)";
      if (second) return shape(await selectOne("fees", second, columns));
      const rows = await selectAll(() => {
        let query = supabase.from("fees").select(columns);
        for (const [key, column] of [
          ["studentId", "student_id"],
          ["academicYearId", "academic_year_id"],
          ["classId", "class_id"],
          ["feeStructureId", "fee_structure_id"],
        ] as const) {
          const value = param(key);
          if (value) query = query.eq(column, value);
        }
        return query.order("due_date", { nullsFirst: false }).order("created_at").order("id");
      });
      const status = param("status");
      return rows.map(shape).filter((row) => !status || row["calculated_status"] === status);
    }

    case "homework": {
      const current = await profile();
      let submissionsFor: string | null = null;
      let classId: string | null = null;
      if (current.role === "STUDENT") {
        submissionsFor = current.linked_student_id;
      } else if (current.role === "PARENT" && param("studentId")) {
        const child = await ownedChild(param("studentId"));
        if (child) {
          submissionsFor = String(child["id"]);
          classId = typeof child["class_id"] === "string" ? child["class_id"] : null;
          if (!classId) return [];
        }
      }
      const rows = await selectAll(() => {
        let query = supabase.from("homework").select("*");
        if (classId) query = query.eq("class_id", classId);
        return query.order("due_date").order("id");
      });
      if (!submissionsFor) return rows;
      const submissions = await selectAll(() =>
        supabase
          .from("homework_submissions")
          .select("*")
          .eq("student_id", submissionsFor)
          .order("id"),
      );
      const byHomework = new Map(submissions.map((row) => [String(row["homework_id"]), row]));
      return rows.map((row) => {
        const submission = byHomework.get(String(row["id"]));
        return {
          ...row,
          submission_id: submission?.["id"] ?? null,
          submission_status: submission?.["status"] ?? null,
          submission_file_name: submission?.["file_name"] ?? null,
          submission_note: submission?.["note"] ?? null,
          submission_feedback: submission?.["feedback"] ?? null,
          submission_grade: submission?.["grade"] ?? null,
          submission_submitted_at: submission?.["submitted_at"] ?? null,
        };
      });
    }

    case "homework-submissions": {
      const homeworkId = param("homeworkId");
      if (!homeworkId) throw new ApiError(400, "homeworkId query param is required");
      const rows = await selectAll(() =>
        supabase
          .from("homework_submissions")
          .select("*,students(name)")
          .eq("homework_id", homeworkId)
          .order("submitted_at", { ascending: false })
          .order("id"),
      );
      return rows.map((row) => flatten(row, "students", { name: "student_name" }));
    }

    case "leave": {
      const current = await profile();
      const rows = await selectAll(() => {
        let query = supabase.from("leave_requests").select("*");
        const type = param("type");
        if (current.role === "TEACHER") {
          query =
            param("scope") === "class-students"
              ? query.eq("requester_type", "STUDENT")
              : query
                  .eq("requester_type", "TEACHER")
                  .eq(
                    "requester_id",
                    current.linked_teacher_id ?? "00000000-0000-0000-0000-000000000000",
                  );
        } else if (current.role === "STAFF") {
          query = query.eq("requester_type", "STAFF").eq("requester_id", current.id);
        } else if (current.role === "STUDENT" || current.role === "PARENT") {
          query = query.eq("requester_type", "STUDENT");
          const studentId = param("studentId");
          if (current.role === "PARENT" && studentId) query = query.eq("requester_id", studentId);
        } else if (type && ["STUDENT", "TEACHER", "STAFF"].includes(type)) {
          query = query.eq("requester_type", type);
        }
        return query.order("from_date", { ascending: false }).order("id");
      });
      return rows;
    }

    case "library": {
      if (second === "books") {
        return selectAll(() =>
          supabase.from("library_books").select("*").order("title").order("id"),
        );
      }
      if (second === "records") {
        return selectAll(() =>
          supabase
            .from("library_records")
            .select("*")
            .order("issued_on", { ascending: false })
            .order("id"),
        );
      }
      break;
    }

    case "notices": {
      const current = await profile();
      const [rows, reads] = await Promise.all([
        selectAll(() =>
          supabase
            .from("notices")
            .select("*,classes(name,section)")
            .order("date", { ascending: false })
            .order("id"),
        ),
        selectAll(() =>
          supabase.from("notice_reads").select("notice_id").eq("user_id", current.id).order("id"),
        ),
      ]);
      const read = new Set(reads.map((row) => String(row["notice_id"])));
      return rows
        .filter(
          (row) => current.role !== "STAFF" || ["All", "Staff"].includes(String(row["audience"])),
        )
        .map((row) => ({
          ...flatten(row, "classes", { name: "class_name", section: "section" }),
          read: read.has(String(row["id"])),
        }));
    }

    case "notifications": {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) fail(error);
      return data ?? [];
    }

    case "certificates":
      return selectAll(() => {
        let query = supabase.from("certificates").select("*");
        const studentId = param("studentId");
        if (studentId) query = query.eq("student_id", studentId);
        return query.order("issued_on", { ascending: false }).order("id");
      });

    case "holidays":
      return selectAll(() => supabase.from("holidays").select("*").order("date").order("id"));

    case "events": {
      const rows = await selectAll(() =>
        supabase.from("events").select("*").order("event_date").order("event_time").order("id"),
      );
      return addDerivedColumns("events", rows);
    }

    case "timetable": {
      // One class's full timetable with each period's teacher name (teacher's class view).
      if (second === "class" && third) return rpc("class_timetable", { p_class_id: third });
      const child = await ownedChild(param("studentId"));
      if (param("studentId") && child && !child["class_id"]) return [];
      return selectAll(() => {
        let query = supabase.from("timetable_slots").select("*");
        if (typeof child?.["class_id"] === "string")
          query = query.eq("class_id", child["class_id"]);
        return query.order("day").order("period").order("id");
      });
    }

    case "transport": {
      if (second === "mine") {
        const current = await profile();
        let studentId: string | null = null;
        if (current.role === "STUDENT") studentId = current.linked_student_id;
        else if (current.role === "PARENT") {
          studentId = param("studentId");
          if (!studentId) throw new ApiError(400, "A valid studentId (your own child) is required");
        } else {
          throw new ApiError(403, "Students or parents only");
        }
        const { data: student, error } = await supabase
          .from("students")
          .select("vehicle_id,pickup_point,drop_point")
          .eq("id", studentId ?? "")
          .maybeSingle();
        if (error) fail(error);
        if (!student) throw new ApiError(400, "A valid studentId (your own child) is required");
        if (!student.vehicle_id) return null;
        const { data: vehicle } = await supabase
          .from("vehicles")
          .select("*")
          .eq("id", student.vehicle_id)
          .maybeSingle();
        if (!vehicle) return null;
        return {
          ...vehicle,
          stops: Array.isArray(vehicle.stops) ? vehicle.stops : [],
          occupied: 0,
          pickup_point: student.pickup_point,
          drop_point: student.drop_point,
        };
      }
      const [vehicles, occupancy] = await Promise.all([
        selectAll(() => supabase.from("vehicles").select("*").order("number").order("id")),
        rpc<{ vehicle_id: string; occupied: number }[]>("vehicle_occupancy"),
      ]);
      const occupied = new Map(
        (occupancy ?? []).map((row) => [row.vehicle_id, Number(row.occupied)]),
      );
      return vehicles.map((vehicle) => ({
        ...vehicle,
        stops: Array.isArray(vehicle["stops"]) ? vehicle["stops"] : [],
        occupied: occupied.get(String(vehicle["id"])) ?? 0,
      }));
    }

    case "admissions": {
      if (second) {
        const [row] = await addDerivedColumns("admissions", [
          await selectOne("admissions", second),
        ]);
        return { ...row, ...(await admissionDetail(second)) };
      }
      const rows = await selectAll(() =>
        supabase
          .from("admissions")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id"),
      );
      return addDerivedColumns("admissions", rows);
    }
  }

  throw new ApiError(404, `Unsupported backend route: /${parts.join("/")}`);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function mutate<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const { parts } = parse(path);
  return (await write(method, parts, (body ?? {}) as Row)) as T;
}

async function write(method: Method, parts: string[], body: Row): Promise<unknown> {
  const [resource = "", second, third, fourth] = parts;
  const values = () => snakeObject(body) as Row;

  switch (resource) {
    case "auth":
      if (second === "password" && method === "PATCH") return changePassword(values());
      break;

    case "users":
    case "school-admins":
      return manageLogin(method, resource, second, third, values());

    case "schools": {
      if (second && parts[parts.length - 1] === "admin" && method === "POST") {
        return invokeFunction("manage-user-login", {
          ...values(),
          action: "upsert_school_admin",
          school_id: second,
        });
      }
      // `admin` is always the final segment. A blank school id (`/schools//admin`) parses to
      // two segments; refuse it rather than inserting the password as a `schools` column.
      if (parts[parts.length - 1] === "admin") {
        throw new ApiError(400, "A school id is required to manage its School Admin");
      }
      if (method === "POST" && !second) {
        const input = values();
        if (!str(input["name"]).trim() || !str(input["short_name"]).trim()) {
          throw new ApiError(400, "name and shortName are required");
        }
        const { data, error } = await supabase
          .from("schools")
          .insert({
            name: str(input["name"]).trim(),
            short_name: str(input["short_name"]).trim(),
            address: input["address"] ?? null,
            phone: input["phone"] ?? null,
            email: input["email"] ?? null,
            status: "TRIAL",
            plan: input["plan"] || "Basic",
            billing_cycle: input["billing_cycle"] || "MONTHLY",
            payment_status: "PENDING",
            subscription_started_at: new Date().toISOString(),
            subscription_expires_at: input["subscription_expires_at"] || null,
          })
          .select("id")
          .single();
        if (error) fail(error);
        return { id: data.id };
      }
      if (method === "PATCH" && second && third === "status") {
        const status = str(body["status"]);
        const allowed = ["ACTIVE", "INACTIVE", "SUSPENDED", "TRIAL", "EXPIRED"];
        if (!allowed.includes(status)) {
          throw new ApiError(400, `status must be one of ${allowed.join(", ")}`);
        }
        return updateRow("schools", second, { status });
      }
      if (method === "PATCH" && second) {
        return updateRow(
          "schools",
          second,
          pick(values(), [
            "name",
            "short_name",
            "address",
            "phone",
            "email",
            "plan",
            "billing_cycle",
            "payment_status",
            "subscription_started_at",
            "subscription_expires_at",
          ]),
        );
      }
      break;
    }

    case "school-profile": {
      if (method !== "PATCH") break;
      const current = await profile();
      if (!current.school_id) throw new ApiError(404, "School not found");
      const update = pick(values(), [
        "name",
        "short_name",
        "tagline",
        "address",
        "phone",
        "email",
        "principal",
        "session",
        "logo_url",
        "code",
        "website",
        "board",
        "affiliation",
      ]);
      for (const [key, value] of Object.entries(update)) {
        if (value !== null && typeof value !== "string") {
          throw new ApiError(400, `${key} must be a string within the allowed length`);
        }
        const text = str(value).trim();
        if (key === "email" && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          throw new ApiError(400, "email must be valid");
        }
        if ((key === "website" || key === "logo_url") && text && !/^https?:\/\//i.test(text)) {
          throw new ApiError(400, `${key} must be a valid HTTP(S) URL`);
        }
        update[key] = text;
      }
      if (!Object.keys(update).length) throw new ApiError(400, "No valid fields to update");
      return updateRow("schools", current.school_id, update);
    }

    case "platform-settings": {
      if (method !== "PUT") break;
      const platformName = str(body["platformName"]).trim();
      const supportEmail = str(body["supportEmail"]).trim().toLowerCase();
      if (
        !platformName ||
        platformName.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)
      ) {
        throw new ApiError(400, "Valid platformName and supportEmail are required");
      }
      const current = await profile();
      const now = new Date().toISOString();
      const { error } = await supabase.from("platform_settings").upsert([
        {
          setting_key: "platformName",
          setting_value: platformName,
          updated_by: current.id,
          updated_at: now,
        },
        {
          setting_key: "supportEmail",
          setting_value: supportEmail,
          updated_by: current.id,
          updated_at: now,
        },
      ]);
      if (error) fail(error);
      return { ok: true };
    }

    case "school-options": {
      if (method !== "POST") break;
      const type = str(body["type"]);
      const value = str(body["value"]).trim();
      if (!SCHOOL_OPTION_TYPES.includes(type) || !value || value.length > 100) {
        throw new ApiError(400, "Valid option type and value are required");
      }
      const current = await profile();
      const { error } = await supabase
        .from("school_options")
        .upsert(
          { school_id: current.school_id, option_type: type, option_value: value },
          { onConflict: "school_id,option_type,option_value", ignoreDuplicates: true },
        );
      if (error) fail(error);
      return { ok: true };
    }

    case "roles": {
      if (!second) break;
      const department = second === "STAFF" ? str(body["department"]) : null;
      if (method === "POST" && third === "reset") {
        await rpc("reset_role_permissions", { p_role: second, p_department: department });
        return { ok: true };
      }
      if (method === "PUT") {
        const permissions = body["permissions"];
        if (!Array.isArray(permissions) || !permissions.every((item) => typeof item === "string")) {
          throw new ApiError(400, "permissions must be an array of permission strings");
        }
        const matrix = await rpc<{ permissions: string[] }>("get_school_role_matrix");
        const unknown = permissions.filter((item) => !matrix.permissions.includes(item));
        if (unknown.length) throw new ApiError(400, `Unknown permission(s): ${unknown.join(", ")}`);
        const current = await profile();
        const granted = new Set(permissions);
        await rpc("set_role_permissions", {
          p_school_id: current.school_id,
          p_role: second,
          p_department: department,
          p_permissions: Object.fromEntries(
            matrix.permissions.map((key) => [key, granted.has(key)]),
          ),
        });
        return { ok: true, permissions: [...granted] };
      }
      break;
    }

    case "leads":
      if (method === "POST" && second && third === "convert") {
        const schoolId = await rpc<string>("convert_lead", {
          p_lead_id: second,
          p_plan: str(body["plan"]) || "Basic",
          p_billing_cycle: str(body["billingCycle"]) || "MONTHLY",
        });
        return { schoolId };
      }
      if (method === "POST" && !str(body["schoolName"]).trim()) {
        throw new ApiError(400, "schoolName is required");
      }
      break;

    case "payments":
      if (method === "POST") {
        const id = await rpc<string>("record_payment", {
          p_school_id: body["schoolId"],
          p_amount: body["amount"],
          p_method: str(body["method"]) || "Manual",
          p_plan: body["plan"] ?? null,
          p_extends_days: typeof body["extendsDays"] === "number" ? body["extendsDays"] : 30,
        });
        return { id };
      }
      break;

    case "plans":
      if (method === "PUT" && second && third === "features") {
        const features = body["features"];
        if (!features || typeof features !== "object") {
          throw new ApiError(400, "features object is required");
        }
        const rows = FEATURE_KEYS.filter((key) => key in features).map((key) => ({
          plan_id: second,
          feature_key: key,
          enabled: Boolean((features as Row)[key]),
        }));
        if (rows.length) {
          const { error } = await supabase.from("plan_features").upsert(rows);
          if (error) fail(error);
        }
        return { ok: true };
      }
      break;

    case "attendance":
      if (method === "POST" && second === "bulk") {
        return rpc("mark_class_attendance", {
          p_class_id: body["classId"],
          p_date: body["date"],
          p_entries: body["entries"] ?? [],
        });
      }
      if (method === "POST" && !second) {
        const student = await selectOne("students", str(body["studentId"]), "id,class_id");
        const result = await rpc<{ saved: number; warning?: string }>("mark_class_attendance", {
          p_class_id: student["class_id"],
          p_date: body["date"],
          p_entries: [
            { studentId: body["studentId"], status: body["status"], remarks: body["remarks"] },
          ],
        });
        if (!result.saved) throw new ApiError(404, "Student not found");
        return { ok: true, ...(result.warning ? { warning: result.warning } : {}) };
      }
      if (method === "PATCH" && second) return correctAttendance("attendance", second, body);
      break;

    case "teacher-attendance":
    case "staff-attendance": {
      if (!isEmployeeResource(resource)) break;
      const cfg = EMPLOYEE[resource];
      if (method === "POST" && (second === "check-in" || second === "check-out")) {
        return rpc("employee_check", { p_kind: cfg.kind, p_action: second });
      }
      if (method === "POST" && (second === "bulk" || !second)) {
        const entries =
          second === "bulk"
            ? (body["entries"] ?? [])
            : [{ [cfg.idKey]: body[cfg.idKey], status: body["status"], remarks: body["remarks"] }];
        return rpc("mark_employee_attendance", {
          p_kind: cfg.kind,
          p_date: body["date"],
          p_entries: entries,
        });
      }
      if (method === "PATCH" && second) return correctAttendance(cfg.table, second, body);
      break;
    }

    case "results":
      if (method === "POST" && second === "bulk") {
        return rpc("save_exam_marks", {
          p_exam_id: body["examId"],
          p_entries: body["entries"] ?? [],
        });
      }
      if (method === "POST" && second === "exams" && third && fourth === "publish") {
        return rpc("publish_exam_results", { p_exam_id: third });
      }
      break;

    case "fees":
      if (method === "POST" && second && third === "pay") {
        return rpc("collect_fee_payment", { p_fee_id: second, p_body: body });
      }
      if (method === "POST" && second === "bulk") {
        // Monthly billing: one insert per batch, so a batch lands whole or not at all.
        // tg_fees_guard still validates every row against its student and fee structure.
        const items = Array.isArray(body["items"]) ? (body["items"] as Row[]) : [];
        if (!items.length) throw new ApiError(400, "Nothing to bill");
        const current = await profile();
        const rows = items.map((item) => ({
          ...pick(snakeObject(item) as Row, [
            "student_id",
            "fee_structure_id",
            "amount",
            "due_date",
            "description",
          ]),
          school_id: current.school_id,
        }));
        const { data, error } = await supabase.from("fees").insert(rows).select("id");
        if (error) fail(error);
        return { created: data?.length ?? 0 };
      }
      if (method === "PATCH" && second) {
        if (["paidAmount", "receiptNo", "paidOn"].some((key) => key in body)) {
          throw new ApiError(400, "Record payments through the payment endpoint");
        }
        const input = values();
        if ("concession" in input && !("discount" in input))
          input["discount"] = input["concession"];
        return updateRow(
          "fees",
          second,
          pick(input, ["discount", "fine", "due_date", "description"]),
        );
      }
      if (method === "POST" && !second) {
        const input = values();
        if ("concession" in input && !("discount" in input))
          input["discount"] = input["concession"];
        if (!str(input["student_id"])) throw new ApiError(400, "studentId is required");
        return insertRow(
          "fees",
          pick(input, [
            "student_id",
            "fee_structure_id",
            "amount",
            "fee_type",
            "due_date",
            "discount",
            "fine",
            "description",
          ]),
        );
      }
      break;

    case "salary-structures": {
      if (method === "POST") {
        const current = await profile();
        const input = values();
        const row = {
          school_id: current.school_id,
          employee_type: input["employee_type"],
          employee_id: input["employee_id"],
          basic_salary: input["basic_salary"],
          hra: input["hra"],
          special_allowance: input["special_allowance"],
          fixed_deductions: input["fixed_deductions"],
          effective_from: input["effective_from"],
          active: true,
          created_by: current.id,
          updated_by: current.id,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from("salary_structures")
          .upsert(row, { onConflict: "school_id,employee_type,employee_id,effective_from" })
          .select()
          .single();
        if (error) fail(error);
        return data;
      }
      break;
    }

    case "payroll": {
      const current = await profile();
      if (method === "POST" && second === "generate") {
        const count = await rpc<number>("generate_monthly_payroll", { p_month: body["month"] });
        return { count };
      }
      if (method === "PATCH" && second) {
        const action = str(body["action"]);
        const status =
          action === "review"
            ? "REVIEWED"
            : action === "approve"
              ? "APPROVED"
              : action === "hold"
                ? "ON_HOLD"
                : action === "release"
                  ? "APPROVED"
                  : action === "pay"
                    ? "PAID"
                    : "";
        if (!status) throw new ApiError(400, "Invalid payroll action");
        if (
          (action === "approve" || action === "hold" || action === "release") &&
          current.role !== "SCHOOL_ADMIN"
        )
          throw new ApiError(403, "School Admin approval is required");
        const update: Row = { status, updated_at: new Date().toISOString() };
        if (action === "review")
          Object.assign(update, { reviewed_by: current.id, reviewed_at: new Date().toISOString() });
        if (action === "approve" || action === "release")
          Object.assign(update, {
            approved_by: current.id,
            approved_at: new Date().toISOString(),
            hold_reason: null,
          });
        if (action === "hold") update["hold_reason"] = body["reason"] ?? "Held by School Admin";
        if (action === "pay")
          Object.assign(update, {
            paid_by: current.id,
            paid_at: new Date().toISOString(),
            payment_method: body["method"] ?? "Bank Transfer",
            payment_reference: body["reference"] ?? null,
          });
        return updateRow("payroll_items", second, update);
      }
      break;
    }

    case "homework-submissions":
      if (method === "POST") {
        return rpc("submit_homework", {
          p_homework_id: body["homeworkId"],
          p_file_name: body["fileName"] ?? null,
          p_note: body["note"] ?? null,
        });
      }
      if (method === "PATCH" && second) {
        return updateRow("homework_submissions", second, {
          feedback: body["feedback"] ?? null,
          grade: body["grade"] ?? null,
          status: "Reviewed",
        });
      }
      break;

    case "library":
      if (method === "POST" && second === "records") {
        return rpc("library_issue_book", {
          p_book_id: body["bookId"],
          p_student_id: body["studentId"],
        });
      }
      if (method === "PATCH" && second === "records" && third && fourth === "return") {
        return rpc("library_return_book", { p_record_id: third });
      }
      if (method === "POST" && second === "books") {
        const title = str(body["title"]).trim();
        const author = str(body["author"]).trim();
        if (!title) throw new ApiError(400, "title is required");
        if (title.length > 200 || author.length > 200) {
          throw new ApiError(400, "title and author must be at most 200 characters");
        }
        return insertRow("library_books", { title, author: author || null });
      }
      break;

    case "notices":
      if (method === "POST" && second && third === "read") {
        const current = await profile();
        const { error } = await supabase
          .from("notice_reads")
          .upsert(
            { user_id: current.id, notice_id: second },
            { onConflict: "user_id,notice_id", ignoreDuplicates: true },
          );
        if (error) fail(error);
        return { ok: true };
      }
      if (method === "POST" && !second) {
        const title = str(body["title"]).trim();
        if (!title) throw new ApiError(400, "title is required");
        const current = await profile();
        if (current.role === "TEACHER") {
          // Teachers post to their own classes: one class notice per chosen class. The database
          // stamps created_by/author and checks each class is one the teacher teaches.
          const classIds = body["classIds"];
          if (
            !Array.isArray(classIds) ||
            !classIds.length ||
            !classIds.every((id) => typeof id === "string")
          ) {
            throw new ApiError(400, "Choose at least one class");
          }
          const { data, error } = await supabase
            .from("notices")
            .insert(
              classIds.map((classId) => ({
                school_id: current.school_id,
                class_id: classId,
                title,
                description: body["description"] ?? null,
                category: body["category"] || "General",
                priority: body["priority"] || "Medium",
                audience: "All",
              })),
            )
            .select("id");
          if (error) fail(error);
          return { ids: (data ?? []).map((row) => row.id) };
        }
        return insertRow("notices", {
          title,
          description: body["description"] ?? null,
          category: body["category"] || "General",
          priority: body["priority"] || "Medium",
          audience: body["audience"] || "All",
          author: current.name,
        });
      }
      break;

    case "notifications":
      if (method === "PATCH") {
        const current = await profile();
        let query = supabase.from("notifications").update({ read: true }).eq("user_id", current.id);
        if (second !== "read-all") query = query.eq("id", second ?? "");
        const { data, error } = await query.select("id");
        if (error) fail(error);
        if (second !== "read-all" && !data?.length)
          throw new ApiError(404, "Notification not found");
        return { ok: true };
      }
      break;

    case "certificates":
      if (method === "POST") {
        const current = await profile();
        return insertRow("certificates", {
          student_id: body["studentId"],
          type: body["type"],
          issued_by: current.name,
        });
      }
      break;

    case "leave":
      if (method === "POST") return createLeave(body);
      if (method === "PATCH" && second) {
        const status = str(body["status"]);
        if (!["Approved", "Rejected"].includes(status)) {
          throw new ApiError(400, "status must be one of Approved, Rejected");
        }
        return updateRow("leave_requests", second, { status });
      }
      break;

    case "parents":
      if (method === "POST" && second && (third === "link" || third === "unlink")) {
        return third === "link"
          ? rpc("link_guardian", {
              p_parent_id: second,
              p_student_id: body["studentId"],
              p_relationship: str(body["relationship"]) || "Guardian",
              p_is_primary: body["isPrimary"] === true,
            })
          : rpc("unlink_guardian", { p_parent_id: second, p_student_id: body["studentId"] });
      }
      if (method === "POST" && !second) {
        const input = values();
        const name = str(input["name"]).trim();
        const email = str(input["email"]).trim().toLowerCase() || null;
        const phone = str(input["phone"]).trim() || null;
        if (!name || name.length > 150) throw new ApiError(400, "A valid name is required");
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new ApiError(400, "Invalid email address");
        if (email || phone) {
          const contacts = [
            email ? `email.ilike.${email.replace(/[,()]/g, "")}` : "",
            phone ? `phone.eq.${phone.replace(/[,()]/g, "")}` : "",
          ]
            .filter(Boolean)
            .join(",");
          const { data } = await supabase.from("parents").select("id").or(contacts).limit(1);
          if (data?.length)
            throw new ApiError(409, "A guardian with this email or phone already exists");
        }
        return insertRow("parents", { name, email, phone });
      }
      break;

    case "students":
      if (second === "me" && method === "PATCH") {
        const current = await profile();
        if (current.role !== "STUDENT" || !current.linked_student_id)
          throw new ApiError(403, "Students only");
        const update = pick(values(), [
          "email",
          "phone",
          "dob",
          "address",
          "photo_url",
          "blood_group",
        ]);
        if (!Object.keys(update).length) throw new ApiError(400, "No valid fields to update");
        return updateRow("students", current.linked_student_id, blanksToNull(update));
      }
      if (method === "DELETE" && second) return rpc("delete_student", { p_student_id: second });
      if (method === "POST" || method === "PATCH") return saveStudent(method, second, values());
      break;

    case "teachers":
    case "staff": {
      if (second === "me" && method === "PATCH") {
        const current = await profile();
        const linked =
          resource === "teachers" ? current.linked_teacher_id : current.linked_staff_id;
        if (!linked)
          throw new ApiError(403, resource === "teachers" ? "Teachers only" : "Staff only");
        const update = pick(values(), resource === "teachers" ? ["phone", "photo_url"] : ["phone"]);
        if (!Object.keys(update).length) throw new ApiError(400, "No valid fields to update");
        return updateRow(resource, linked, blanksToNull(update));
      }
      if (method === "DELETE" && second) {
        return rpc("delete_employee", {
          p_kind: resource === "teachers" ? "teacher" : "staff",
          p_id: second,
        });
      }
      if (method === "POST" || method === "PATCH")
        return saveEmployee(method, resource, second, values());
      break;
    }

    case "subjects":
      if (second === "mappings" && method === "POST") {
        const input = values();
        const { data: existing } = await supabase
          .from("class_subjects")
          .select("id")
          .eq("class_id", str(input["class_id"]))
          .eq("subject_id", str(input["subject_id"]))
          .maybeSingle();
        if (existing) {
          await updateRow("class_subjects", existing.id, {
            teacher_id: input["teacher_id"] || null,
          });
          return { id: existing.id, updated: true };
        }
        return insertRow("class_subjects", {
          class_id: input["class_id"],
          subject_id: input["subject_id"],
          teacher_id: input["teacher_id"] || null,
        });
      }
      break;

    case "admissions": {
      const result = await mutateAdmission(method, parts, body);
      if (result !== undefined) return result;
      break;
    }
  }

  return genericWrite(method, parts, values());
}

// Plain table CRUD for routes that are a single RLS-governed row write.
async function genericWrite(method: Method, parts: string[], values: Row) {
  const [resource, second, third] = parts;
  let table = resource ? TABLES[resource] : undefined;
  let id = second;
  if (resource === "subjects" && second === "mappings") {
    table = "class_subjects";
    id = third;
  }
  if (resource === "library") {
    table = second === "books" ? "library_books" : "library_records";
    id = third;
  }
  if (!table) throw new ApiError(404, `Unsupported backend route: ${method} /${parts.join("/")}`);
  // Credentials belong to Auth and the manage-user-login function, never to a data
  // table. Fail loudly rather than letting a mis-shaped path persist them as columns.
  if (["password", "current_password", "new_password"].some((field) => field in values)) {
    throw new ApiError(400, `Credentials cannot be written to ${table}`);
  }
  if (table === "events") {
    // Mirror of the read-side alias.
    for (const [alias, column] of [
      ["date", "event_date"],
      ["time", "event_time"],
    ] as const) {
      if (alias in values) {
        values[column] = values[alias];
        delete values[alias];
      }
    }
  }
  if (method === "POST") return insertRow(table, values);
  if (!id) throw new ApiError(400, `A record id is required for ${method} /${parts.join("/")}`);
  if (method === "DELETE") {
    const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
    if (error) fail(error);
    if (!data?.length) {
      throw new ApiError(404, "Record not found or you do not have permission to delete it");
    }
    return { ok: true };
  }
  return updateRow(table, id, values);
}

async function insertRow(table: string, values: Row) {
  if (!PLATFORM_TABLES.includes(table) && !("school_id" in values)) {
    const current = await profile();
    if (current.school_id) values["school_id"] = current.school_id;
  }
  const { data, error } = await supabase.from(table).insert(values).select().single();
  if (error) fail(error);
  return data as Row;
}

async function updateRow(table: string, id: string, values: Row) {
  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) fail(error);
  if (!data) throw new ApiError(404, "Record not found or you do not have permission to change it");
  return data as Row;
}

function pick(values: Row, keys: string[]) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key))) as Row;
}

function blanksToNull(values: Row) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === "" ? null : value]),
  ) as Row;
}

async function changePassword(values: Row) {
  const currentPassword = values["current_password"];
  const newPassword = values["new_password"];
  if (typeof currentPassword !== "string" || !currentPassword) {
    throw new ApiError(400, "Your current password is required");
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    throw new ApiError(400, "The new password must be at least 6 characters");
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) fail(authError, 401);
  if (!auth.user?.email) throw new ApiError(401, "Session expired, please sign in again");
  // Verify the current password even when the Auth server does not require it for updates.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: auth.user.email,
    password: currentPassword,
  });
  if (verifyError) fail(verifyError, 401);
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });
  if (error) fail(error);
  return { ok: true };
}

// Logins live in Supabase Auth, so every change goes through the manage-user-login function.
async function manageLogin(
  method: Method,
  resource: "users" | "school-admins",
  userId: string | undefined,
  action: string | undefined,
  values: Row,
) {
  if (resource === "school-admins") {
    if (method !== "PATCH" || !userId || action !== "status") {
      throw new ApiError(404, `Unsupported backend route: ${method} /school-admins`);
    }
    return invokeFunction("manage-user-login", {
      action: "set_status",
      user_id: userId,
      status: values["status"],
    });
  }

  if (method === "POST") {
    const current = await profile();
    if (!values["school_id"] && current.school_id) values["school_id"] = current.school_id;
    if (typeof values["name"] !== "string" || !values["name"].trim()) {
      const linkedTables: Record<string, string> = {
        TEACHER: "teachers",
        PARENT: "parents",
        STUDENT: "students",
        STAFF: "staff",
      };
      const linkedTable = linkedTables[String(values["role"])];
      if (linkedTable && typeof values["linked_id"] === "string") {
        const linked = await selectOne(linkedTable, values["linked_id"], "name");
        values["name"] = linked["name"];
      }
    }
    if (typeof values["name"] !== "string" || !values["name"].trim()) {
      throw new ApiError(400, "A name is required to create a login");
    }
    if (!values["school_id"]) throw new ApiError(400, "A school is required to create a login");
    const created = await invokeFunction("manage-user-login", { ...values, action: "create" });
    return { ...created, id: created["userId"] };
  }

  if (!userId) throw new ApiError(400, `A user id is required for ${method} /users`);
  if (method === "DELETE")
    return invokeFunction("manage-user-login", { action: "delete", user_id: userId });

  let result: Row = { ok: true };
  if (typeof values["password"] === "string") {
    if (values["password"].length < 6) {
      throw new ApiError(400, "The password must be at least 6 characters");
    }
    await invokeFunction("manage-user-login", {
      action: "set_password",
      user_id: userId,
      password: values["password"],
    });
  } else if (values["reset_password"] === true) {
    result = {
      ok: true,
      ...(await invokeFunction("manage-user-login", { action: "reset_password", user_id: userId })),
    };
  }
  if (typeof values["status"] === "string") {
    await invokeFunction("manage-user-login", {
      action: "set_status",
      user_id: userId,
      status: values["status"],
    });
  }
  if (
    typeof values["password"] !== "string" &&
    values["reset_password"] !== true &&
    typeof values["status"] !== "string"
  ) {
    throw new ApiError(400, "Nothing to update — pass status, resetPassword and/or password");
  }
  return result;
}

async function correctAttendance(table: string, id: string, body: Row) {
  const update: Row = {};
  if (body["status"] !== undefined) {
    const status = normalizeAttendanceStatus(str(body["status"]));
    if (!status) throw new ApiError(400, "status must be one of Present, Absent, Late, Leave");
    update["status"] = status;
  }
  if (body["remarks"] !== undefined) {
    const remarks = body["remarks"];
    if (remarks !== null && (typeof remarks !== "string" || remarks.length > 300)) {
      throw new ApiError(400, "remarks must be a string of at most 300 characters");
    }
    update["remarks"] = remarks;
  }
  if (!Object.keys(update).length) {
    throw new ApiError(400, "Nothing to update — pass status and/or remarks");
  }
  update["marked_by"] = (await profile()).id;
  await updateRow(table, id, update);
  return { ok: true };
}

async function createLeave(body: Row) {
  const current = await profile();
  const fromDate = str(body["fromDate"]);
  const toDate = str(body["toDate"]);
  const reason = str(body["reason"]).trim();
  let type: string;
  let requesterId: string | null;
  switch (current.role) {
    case "TEACHER":
      type = "TEACHER";
      requesterId = current.linked_teacher_id;
      break;
    case "STAFF":
      type = "STAFF";
      requesterId = current.id;
      break;
    case "STUDENT":
      type = "STUDENT";
      requesterId = current.linked_student_id;
      break;
    case "SCHOOL_ADMIN":
    case "PARENT":
      if (body["requesterType"] !== "STUDENT" || !str(body["studentId"])) {
        throw new ApiError(
          400,
          current.role === "PARENT"
            ? "requesterType 'STUDENT' and a valid studentId (your own child) are required"
            : "requesterType 'STUDENT' and studentId are required",
        );
      }
      type = "STUDENT";
      requesterId = str(body["studentId"]);
      break;
    default:
      throw new ApiError(403, "Not permitted to request leave");
  }
  if (!requesterId) throw new ApiError(409, "User account is not linked to a requester profile");
  if (!isDate(fromDate) || !isDate(toDate) || fromDate > toDate) {
    throw new ApiError(400, "A valid date range is required");
  }
  if (!reason || reason.length > 1000) {
    throw new ApiError(400, "reason is required and must be at most 1000 characters");
  }
  const row = await insertRow("leave_requests", {
    requester_type: type,
    requester_id: requesterId,
    from_date: fromDate,
    to_date: toDate,
    reason,
  });
  return { id: row["id"] };
}

// Students form: the class decides class_name/section/academic year (database trigger), and a
// chosen parent becomes the student's primary guardian link.
async function saveStudent(method: "POST" | "PATCH", id: string | undefined, input: Row) {
  const row = blanksToNull(
    pick(input, [
      "name",
      "admission_no",
      "class_id",
      "roll",
      "status",
      "admitted_on",
      "email",
      "phone",
      "dob",
      "address",
      "blood_group",
      "vehicle_id",
      "pickup_point",
      "drop_point",
      "gender",
      "previous_school",
    ]),
  );
  if ("name" in row) {
    const name = str(row["name"]).trim();
    if (!name || name.length > 150) throw new ApiError(400, "A valid name is required");
    row["name"] = name;
  }
  if (row["email"] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(row["email"]))) {
    throw new ApiError(400, "Invalid email address");
  }
  if (row["roll"] !== undefined && row["roll"] !== null) {
    const roll = Number(row["roll"]);
    if (!Number.isInteger(roll) || roll < 1)
      throw new ApiError(400, "Roll number must be a positive integer");
    row["roll"] = roll;
  }
  const parentId = "parent_id" in input ? str(input["parent_id"]) || null : undefined;

  if (method === "POST") {
    if (!("name" in row)) throw new ApiError(400, "A valid name is required");
    const created = await insertRow("students", row);
    if (parentId) {
      await rpc("link_guardian", {
        p_parent_id: parentId,
        p_student_id: created["id"],
        p_relationship: "Guardian",
        p_is_primary: true,
      });
    }
    return { id: created["id"] };
  }

  if (!id) throw new ApiError(400, "A student id is required");
  const existing = await selectOne("students", id, "id,parent_id");
  if (Object.keys(row).length) await updateRow("students", id, row);
  if (parentId !== undefined && parentId !== existing["parent_id"]) {
    if (typeof existing["parent_id"] === "string") {
      await rpc("unlink_guardian", { p_parent_id: existing["parent_id"], p_student_id: id }).catch(
        (err: unknown) => {
          if (!(err instanceof ApiError) || !err.message.includes("not found")) throw err;
        },
      );
    }
    if (parentId) {
      await rpc("link_guardian", {
        p_parent_id: parentId,
        p_student_id: id,
        p_relationship: "Guardian",
        p_is_primary: true,
      });
    }
  }
  return { ok: true };
}

type StaffExtras = {
  assignments?: { classes: string[]; subjects: string[] } | undefined;
  login?: { email?: unknown; password?: unknown } | undefined;
};

async function saveEmployee(
  method: "POST" | "PATCH",
  table: "teachers" | "staff",
  id: string | undefined,
  values: Row,
) {
  const extras = takeStaffExtras(table, values);
  if (extras.assignments && method === "POST") {
    const { classes, subjects } = extras.assignments;
    if (!classes.length && !subjects.length) extras.assignments = undefined;
  }
  const row = blanksToNull(
    pick(values, [
      "name",
      "department",
      "designation",
      "email",
      "phone",
      "employment_status",
      "joining_date",
      "employee_id",
      "photo_url",
    ]),
  );
  if (method === "POST") {
    const created = await insertRow(table, row);
    try {
      await applyStaffExtras(table, created, extras);
    } catch (err) {
      // Don't leave a half-created record behind that a retry would duplicate.
      await supabase.from(table).delete().eq("id", created["id"]);
      throw err;
    }
    return { id: created["id"] };
  }
  if (!id) throw new ApiError(400, `A record id is required for PATCH /${table}`);
  const updated = Object.keys(row).length
    ? await updateRow(table, id, row)
    : await selectOne(table, id);
  await applyStaffExtras(table, updated, extras);
  return { ok: true };
}

// The staff form sends what the previous backend handled outside the row: teaching
// assignments (now `class_subjects`, mirrored on read by addDerivedColumns) and an optional
// portal login. Pull them out so PostgREST doesn't reject them as unknown columns.
function takeStaffExtras(table: string, values: Row): StaffExtras {
  const extras: StaffExtras = {};
  const login = values["login"];
  if (login && typeof login === "object") extras.login = login as StaffExtras["login"];
  delete values["login"];

  // `employment_status` is an enum (ACTIVE / ON_LEAVE / INACTIVE); the form sends "Active".
  const status = values["employment_status"];
  if (typeof status === "string") {
    values["employment_status"] = status.trim().toUpperCase().replace(/\s+/g, "_");
  }

  const department = values["department"];
  if (table === "staff" && typeof department === "string") {
    const code = staffDepartmentCode(department);
    if (!code) {
      const allowed = Object.values(STAFF_DEPARTMENT_LABELS).join(", ");
      throw new ApiError(400, `Department must be one of: ${allowed}`);
    }
    values["department"] = code;
  }

  if (table === "teachers") {
    const classes = values["assigned_classes"];
    const subjects = values["assigned_subjects"];
    delete values["assigned_classes"];
    delete values["assigned_subjects"];
    if (classes !== undefined || subjects !== undefined) {
      if (!Array.isArray(classes) || !Array.isArray(subjects)) {
        throw new ApiError(400, "assignedClasses and assignedSubjects must be sent together");
      }
      const ids = (list: unknown[]) =>
        list.filter((item): item is string => typeof item === "string");
      extras.assignments = { classes: ids(classes), subjects: ids(subjects) };
    }
  }
  return extras;
}

async function applyStaffExtras(
  table: "teachers" | "staff",
  row: Row,
  { assignments, login }: StaffExtras,
) {
  if (assignments) {
    await rpc("set_teacher_assignments", {
      p_teacher_id: row["id"],
      p_class_ids: assignments.classes,
      p_subject_ids: assignments.subjects,
    });
  }
  if (login) {
    await invokeFunction("manage-user-login", {
      action: "create",
      role: table === "teachers" ? "TEACHER" : "STAFF",
      name: row["name"],
      email: login.email,
      password: login.password,
      school_id: row["school_id"],
      linked_id: row["id"],
      ...(table === "staff" ? { department: row["department"] ?? null } : {}),
    });
  }
}

// ---------------------------------------------------------------------------
// Admissions workflow
// ---------------------------------------------------------------------------

async function admissionDetail(admissionId: string) {
  const [documents, notes, history] = await Promise.all([
    supabase
      .from("admission_documents")
      .select("*")
      .eq("admission_id", admissionId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("admission_notes")
      .select("*")
      .eq("admission_id", admissionId)
      .order("created_at", { ascending: false }),
    supabase
      .from("admission_status_history")
      .select("*")
      .eq("admission_id", admissionId)
      .order("changed_at", { ascending: false }),
  ]);
  for (const result of [documents, notes, history]) if (result.error) fail(result.error);

  // Files live in the private Storage bucket; the UI previews and downloads via `file_data`.
  const documentsList = (documents.data ?? []) as Row[];
  const paths = documentsList
    .map((doc) => doc["storage_path"])
    .filter((path): path is string => typeof path === "string");
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage
      .from(ADMISSION_DOCUMENTS_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const item of data ?? [])
      if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
  }
  for (const doc of documentsList) {
    doc["file_data"] = signed.get(String(doc["storage_path"])) ?? null;
  }
  return { documentsList, notesList: notes.data ?? [], history: history.data ?? [] };
}

// Matches the previous backend's duplicate check: open applications, students and guardians
// sharing the contact phone or email.
async function findAdmissionDuplicates(phone: unknown, email: unknown) {
  const contact = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  const lookups = [
    ["contact_phone", "phone", contact(phone)],
    ["contact_email", "email", contact(email)],
  ] as const;
  const found = { admissions: new Map(), students: new Map(), parents: new Map() } as Record<
    "admissions" | "students" | "parents",
    Map<string, Row>
  >;
  await Promise.all(
    lookups.flatMap(([admissionColumn, column, value]) =>
      value
        ? (["admissions", "students", "parents"] as const).map(async (table) => {
            const { data, error } = await supabase
              .from(table)
              .select("*")
              .eq(table === "admissions" ? admissionColumn : column, value);
            if (error) fail(error);
            for (const row of (data ?? []) as Row[]) {
              found[table].set(String(row["id"]), row);
            }
          })
        : [],
    ),
  );
  return [
    ...[...found.admissions.values()]
      .filter((row) => row["stage"] !== "REJECTED" && row["stage"] !== "CONVERTED")
      .map((row) => ({
        type: "admission",
        id: String(row["id"]),
        label: `Application: ${String(row["applicant"])}`,
      })),
    ...[...found.students.values()].map((row) => ({
      type: "student",
      id: String(row["id"]),
      label: `Existing student: ${String(row["name"])}`,
    })),
    ...[...found.parents.values()].map((row) => ({
      type: "parent",
      id: String(row["id"]),
      label: `Existing guardian: ${String(row["name"])}`,
    })),
  ];
}

function normalizeAdmissionValues(values: Row) {
  // There is no academic_year_id column: the applied class already pins the year, and
  // `academic_year` keeps its name.
  delete values["academic_year_id"];
  const result = values["previous_percentage"];
  if (typeof result === "string") {
    const number = result.trim().replace(/%$/, "").trim();
    if (!number) {
      values["previous_percentage"] = null;
    } else if (!/^\d+(\.\d+)?$/.test(number) || Number(number) > 100) {
      throw new ApiError(400, "Previous result must be a percentage from 0 to 100, e.g. 88");
    } else {
      values["previous_percentage"] = Number(number);
    }
  }
}

async function requireAdmissionClass(admissionId: string, action: string) {
  const { data, error } = await supabase
    .from("admissions")
    .select("class_id_applied")
    .eq("id", admissionId)
    .single();
  if (error) fail(error, 404);
  if (!data.class_id_applied) {
    throw new ApiError(400, `Choose the class applied for before you ${action} this application`);
  }
}

async function addAdmissionNote(admissionId: string, note: string) {
  const current = await profile();
  const { data, error } = await supabase
    .from("admission_notes")
    .insert({
      school_id: current.school_id,
      admission_id: admissionId,
      author_id: current.id,
      author_name: current.name ?? null,
      note,
    })
    .select("id")
    .single();
  if (error) fail(error);
  return data.id as string;
}

// The previous backend exposed admissions as a small workflow API (duplicate check, stage
// transitions, conversion, documents, notes). Map those routes onto the tables, triggers and
// RPCs that now implement it. Returns undefined for routes the generic writer handles.
async function mutateAdmission(method: Method, parts: string[], body: unknown): Promise<unknown> {
  const [, admissionId, action, childId] = parts;
  const values = snakeObject(body ?? {}) as Row;
  const now = new Date().toISOString();

  if (!admissionId) {
    if (method !== "POST") return undefined;
    const force = values["force"] === true;
    delete values["force"];
    normalizeAdmissionValues(values);
    if (!force) {
      const duplicates = await findAdmissionDuplicates(
        values["contact_phone"],
        values["contact_email"],
      );
      if (duplicates.length) {
        throw new ApiError(409, "Possible duplicate application found", { duplicates });
      }
    }
    const current = await profile();
    const { data, error } = await supabase
      .from("admissions")
      .insert({
        ...values,
        school_id: current.school_id,
        created_by: current.id,
        created_by_name: current.name ?? null,
      })
      .select()
      .single();
    if (error) fail(error);
    return { ...data, applicationNo: data.application_no };
  }

  if (!action) {
    if (method === "DELETE") {
      const { data: documents } = await supabase
        .from("admission_documents")
        .select("storage_path")
        .eq("admission_id", admissionId);
      const { error } = await supabase
        .from("admissions")
        .delete()
        .eq("id", admissionId)
        .select("id")
        .single();
      if (error) {
        fail(
          error.code === "PGRST116"
            ? { message: "Converted applications cannot be deleted" }
            : error,
        );
      }
      const paths = (documents ?? [])
        .map((doc) => doc.storage_path)
        .filter((path): path is string => typeof path === "string");
      if (paths.length) await supabase.storage.from(ADMISSION_DOCUMENTS_BUCKET).remove(paths);
      return { ok: true };
    }
    normalizeAdmissionValues(values);
    const { data, error } = await supabase
      .from("admissions")
      .update({ ...values, updated_at: now })
      .eq("id", admissionId)
      .select()
      .single();
    // RLS hides converted applications from updates, which surfaces as "no rows".
    if (error)
      fail(
        error.code === "PGRST116"
          ? { message: "Converted applications can no longer be edited" }
          : error,
      );
    return data;
  }

  if (action === "transition" && method === "POST") {
    const toStage = values["to_stage"];
    if (typeof toStage !== "string" || !toStage)
      throw new ApiError(400, "A target stage is required");
    if (toStage === "APPROVED") await requireAdmissionClass(admissionId, "approve");
    // Database triggers validate the move and append the status-history row.
    const { error } = await supabase
      .from("admissions")
      .update({ stage: toStage, updated_at: now })
      .eq("id", admissionId)
      .select("id")
      .single();
    if (error)
      fail(
        error.code === "PGRST116"
          ? { message: "Converted applications can no longer change stage" }
          : error,
      );
    // History rows are insert-only and the trigger writes them without remarks, so keep
    // the reason as a note instead of losing it.
    const remarks = values["remarks"];
    if (typeof remarks === "string" && remarks.trim()) {
      await addAdmissionNote(admissionId, `Moved to ${toStage}: ${remarks.trim()}`);
    }
    return { ok: true };
  }

  if (action === "convert" && method === "POST") {
    await requireAdmissionClass(admissionId, "convert");
    const { data, error } = await supabase.rpc("convert_admission", {
      p_admission_id: admissionId,
    });
    if (error) fail(error);
    return { studentId: data.id, admissionNo: data.admission_no };
  }

  if (action === "notes" && method === "POST") {
    const note = typeof values["note"] === "string" ? values["note"].trim() : "";
    if (!note) throw new ApiError(400, "A note is required");
    return { id: await addAdmissionNote(admissionId, note) };
  }

  if (action === "documents") {
    if (method === "POST") {
      const name = typeof values["name"] === "string" ? values["name"].trim() : "";
      const fileData = values["file_data"];
      if (!name) throw new ApiError(400, "Document name is required");
      if (typeof fileData !== "string" || !fileData.startsWith("data:")) {
        throw new ApiError(400, "The document file could not be read");
      }
      const [header = "", base64 = ""] = fileData.split(",", 2);
      const mime =
        /^data:([^;,]+)/.exec(header)?.[1] ??
        (typeof values["file_mime"] === "string"
          ? values["file_mime"]
          : "application/octet-stream");
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const current = await profile();
      // The Storage policy requires the school id as the first path segment.
      const path = `${current.school_id}/${admissionId}/${crypto.randomUUID()}-${name.replace(/[^\w.-]+/g, "_")}`;
      const bucket = supabase.storage.from(ADMISSION_DOCUMENTS_BUCKET);
      const { error: uploadError } = await bucket.upload(path, bytes, { contentType: mime });
      if (uploadError) fail(uploadError);
      const { data, error } = await supabase
        .from("admission_documents")
        .insert({
          school_id: current.school_id,
          admission_id: admissionId,
          name,
          doc_type: values["doc_type"] ?? null,
          storage_path: path,
          file_mime: mime,
          file_size_bytes: bytes.length,
          uploaded_by: current.id,
          uploaded_by_name: current.name ?? null,
        })
        .select("id")
        .single();
      if (error) {
        await bucket.remove([path]);
        fail(error);
      }
      return { id: data.id };
    }
    if (!childId) throw new ApiError(400, "A document id is required");
    if (method === "DELETE") {
      const { data, error } = await supabase
        .from("admission_documents")
        .delete()
        .eq("id", childId)
        .eq("admission_id", admissionId)
        .select("storage_path")
        .single();
      if (error) fail(error, 404);
      if (data.storage_path) {
        await supabase.storage.from(ADMISSION_DOCUMENTS_BUCKET).remove([data.storage_path]);
      }
      return { ok: true };
    }
    const update: Row = {};
    if (typeof values["status"] === "string") {
      const current = await profile();
      update["status"] = values["status"];
      update["verified_by_name"] = current.name ?? null;
      update["verified_at"] = now;
    }
    if (typeof values["remarks"] === "string") update["remarks"] = values["remarks"];
    if (!Object.keys(update).length) throw new ApiError(400, "No document changes to save");
    const { error } = await supabase
      .from("admission_documents")
      .update(update)
      .eq("id", childId)
      .eq("admission_id", admissionId)
      .select("id")
      .single();
    if (error) fail(error, 404);
    return { ok: true };
  }

  throw new ApiError(404, `Unsupported admissions route: ${method} /${parts.join("/")}`);
}

export const api = {
  get,
  post: <T>(path: string, data?: unknown) => mutate<T>("POST", path, data),
  patch: <T>(path: string, data?: unknown) => mutate<T>("PATCH", path, data),
  put: <T>(path: string, data?: unknown) => mutate<T>("PUT", path, data),
  delete: <T>(path: string) => mutate<T>("DELETE", path),
};
