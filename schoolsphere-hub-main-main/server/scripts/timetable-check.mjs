// Step 13 integration check: Timetable. Every fixture is stamped with Date.now() /
// picked from an empty (day, period) slot so the suite is safely rerunnable against the
// live Supabase DB (matches the student-admission-check.mjs / homework-check.mjs pattern).
const base = process.env.TIMETABLE_TEST_API_URL ?? "http://localhost:43144/api";
async function req(path, { token, method = "GET", body } = {}) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
function ok(value, message) {
  if (!value) throw new Error(message);
  console.log(`PASS ${message}`);
}
async function login(email) {
  const r = await req("/auth/login", { method: "POST", body: { email, password: "password123" } });
  ok(r.status === 200, `login ${email}`);
  return r.data.token;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const stamp = Date.now();
const a = await login("everbright.admin@example.com"); // School A admin
const b = await login("riverside.admin@example.com"); // School B admin
const teacher = await login("everbright.teacher@example.com");
const studentToken = await login("everbright.student@example.com");
const parentToken = await login("everbright.parent@example.com");
const superToken = await login("superadmin@example.com");

// ---- resolve real, authoritative fixtures (no hardcoded IDs) ----
const classesA = (await req("/classes", { token: a })).data;
const subjectsA = (await req("/subjects", { token: a })).data;
const teachersA = (await req("/teachers", { token: a })).data;
const roomsA = (await req("/rooms", { token: a })).data;
const classesB = (await req("/classes", { token: b })).data;
const student = (await req("/students/me", { token: studentToken })).data;
ok(student?.id && student?.class_id, "resolved demo student identity and class");
ok(classesA.length >= 2 && subjectsA.length >= 1 && teachersA.length >= 1, "resolved enough school-A fixtures to test with");

// Conflict detection is keyed on (day, period) per class/teacher/room independently, so a
// fixture slot must be free across ALL THREE dimensions at once — checking class-level
// usage alone (as an earlier version of this script did) can pick a day/period where the
// chosen teacher or room is already booked elsewhere, causing a false 409 on the very first
// "authorized create" call.
const existing = await req("/timetable", { token: a });
const usedByClass = new Map();
const usedByTeacher = new Map();
const usedByRoom = new Map();
for (const s of existing.data) {
  if (s.class_id) {
    if (!usedByClass.has(s.class_id)) usedByClass.set(s.class_id, new Set());
    usedByClass.get(s.class_id).add(`${s.day}|${s.period}`);
  }
  if (s.teacher_id) {
    if (!usedByTeacher.has(s.teacher_id)) usedByTeacher.set(s.teacher_id, new Set());
    usedByTeacher.get(s.teacher_id).add(`${s.day}|${s.period}`);
  }
  if (s.room) {
    if (!usedByRoom.has(s.room)) usedByRoom.set(s.room, new Set());
    usedByRoom.get(s.room).add(`${s.day}|${s.period}`);
  }
}
function markUsed(classId, teacherId, room, day, period) {
  const key = `${day}|${period}`;
  if (classId) (usedByClass.get(classId) ?? usedByClass.set(classId, new Set()).get(classId)).add(key);
  if (teacherId) (usedByTeacher.get(teacherId) ?? usedByTeacher.set(teacherId, new Set()).get(teacherId)).add(key);
  if (room) (usedByRoom.get(room) ?? usedByRoom.set(room, new Set()).get(room)).add(key);
}
function freeSlot({ classId, teacherId, room } = {}) {
  const classUsed = usedByClass.get(classId) ?? new Set();
  const teacherUsed = teacherId ? (usedByTeacher.get(teacherId) ?? new Set()) : new Set();
  const roomUsed = room ? (usedByRoom.get(room) ?? new Set()) : new Set();
  for (const day of DAYS) {
    for (let period = 1; period <= 9; period++) {
      const key = `${day}|${period}`;
      if (!classUsed.has(key) && !teacherUsed.has(key) && !roomUsed.has(key)) return { day, period };
    }
  }
  throw new Error("No free slot found across class/teacher/room — seed data too dense to test against");
}

const classX = classesA[0];
const classY = classesA.find((c) => c.id !== classX.id);
ok(classY, "resolved a second class distinct from the first (for cross-class conflict checks)");
const teacherT = teachersA[0];
const subjectName = subjectsA[0].name;
const otherSubjectName = subjectsA.find((s) => s.name !== subjectName)?.name ?? subjectName;
const roomName = roomsA[0]?.name;

const slot1 = freeSlot({ classId: classX.id, teacherId: teacherT.id, room: roomName });
markUsed(classX.id, teacherT.id, roomName, slot1.day, slot1.period);

// ================= 1. Authorized create (SCHOOL_ADMIN) =================
const created = await req("/timetable", {
  token: a,
  method: "POST",
  body: { classId: classX.id, day: slot1.day, period: slot1.period, subject: subjectName, teacherId: teacherT.id, room: roomName },
});
ok(created.status === 201, "authorized timetable slot creation (school admin)");
const slotId = created.data.id;

const listA = await req("/timetable", { token: a });
const createdRow = listA.data.find((s) => s.id === slotId);
ok(!!createdRow, "created slot appears in admin's school-wide list");
ok(createdRow.subject_id, "subject_id resolved and stored alongside subject text");
if (roomName) ok(createdRow.room_id, "room_id resolved and stored alongside room text");

// ================= 2. Unauthorized creation (role) =================
ok(
  (await req("/timetable", { token: teacher, method: "POST", body: { classId: classX.id, day: "Monday", period: 9, subject: subjectName } })).status === 403,
  "teacher (view-only role) cannot create timetable entries",
);
ok(
  (await req("/timetable", { token: studentToken, method: "POST", body: { classId: classX.id, day: "Monday", period: 9, subject: subjectName } })).status === 403,
  "student cannot create timetable entries",
);

// ================= Invalid relationships / validation =================
ok(
  (await req("/timetable", { token: a, method: "POST", body: { classId: classesB[0].id, day: "Monday", period: 8, subject: subjectName } })).status === 400,
  "admin cannot create a timetable entry against another school's class (IDOR closed)",
);
ok(
  (await req("/timetable", { token: a, method: "POST", body: { classId: classX.id, day: "Funday", period: 1 } })).status === 400,
  "invalid day name is rejected",
);
ok(
  (await req("/timetable", { token: a, method: "POST", body: { classId: classX.id, day: "Monday", period: 0 } })).status === 400,
  "period below 1 is rejected",
);
ok(
  (await req("/timetable", { token: a, method: "POST", body: { classId: classX.id, day: "Monday", period: 1.5 } })).status === 400,
  "non-integer period is rejected",
);
ok(
  (await req("/timetable", { token: a, method: "POST", body: { classId: classX.id, day: "Monday", period: 8, subject: `Nonexistent Subject ${stamp}` } })).status === 400,
  "unknown subject name is rejected",
);
{
  const foreignTeacher = (await req("/teachers", { token: b })).data[0];
  ok(
    (await req("/timetable", { token: a, method: "POST", body: { classId: classX.id, day: "Monday", period: 8, teacherId: foreignTeacher.id } })).status === 400,
    "teacher from another school is rejected",
  );
}

// ================= 3. Conflict detection =================
// CLASS conflict: same class, same day+period, different subject/teacher.
const classConflict = await req("/timetable", {
  token: a,
  method: "POST",
  body: { classId: classX.id, day: slot1.day, period: slot1.period, subject: otherSubjectName },
});
ok(classConflict.status === 409, "class/section conflict rejected (same class already has a period there)");

// TEACHER conflict: different class, same day+period, same teacher.
const teacherConflict = await req("/timetable", {
  token: a,
  method: "POST",
  body: { classId: classY.id, day: slot1.day, period: slot1.period, teacherId: teacherT.id },
});
ok(teacherConflict.status === 409, "teacher conflict rejected (one teacher cannot teach two classes at once)");

// ROOM conflict: a third class, same day+period as slot1, same room, no teacher (isolates
// the assertion to the room mechanism specifically rather than also risking a class/teacher hit).
if (roomName) {
  const classZ = classesA.find(
    (c) => c.id !== classX.id && c.id !== classY.id && !(usedByClass.get(c.id) ?? new Set()).has(`${slot1.day}|${slot1.period}`),
  );
  if (classZ) {
    const roomConflict = await req("/timetable", {
      token: a,
      method: "POST",
      body: { classId: classZ.id, day: slot1.day, period: slot1.period, room: roomName },
    });
    ok(roomConflict.status === 409, "room conflict rejected (one room cannot host two classes at once)");
  } else {
    console.log("SKIP room conflict check — no free third class available at slot1's day/period");
  }
}

// A DIFFERENT day/period for classY with the same teacher must succeed (proves the conflict
// check is scoped to day+period, not a blanket "teacher already used anywhere" rule).
const slot2 = freeSlot({ classId: classY.id, teacherId: teacherT.id });
markUsed(classY.id, teacherT.id, null, slot2.day, slot2.period);
const nonConflicting = await req("/timetable", {
  token: a,
  method: "POST",
  body: { classId: classY.id, day: slot2.day, period: slot2.period, teacherId: teacherT.id, subject: subjectName },
});
ok(nonConflicting.status === 201, "same teacher at a different day/period is allowed (no false-positive conflict)");
const slot2Id = nonConflicting.data.id;

// UPDATE also enforces the conflict check: moving slot2 onto slot1's day/period for classY
// collides with the teacher conflict created above.
const patchConflict = await req(`/timetable/${slot2Id}`, {
  token: a,
  method: "PATCH",
  body: { day: slot1.day, period: slot1.period },
});
ok(patchConflict.status === 409, "PATCH into an occupied day/period is rejected (update path enforces conflicts too)");

// ================= 4. Read/update/delete + refresh persistence =================
const patched = await req(`/timetable/${slotId}`, { token: a, method: "PATCH", body: { room: null } });
ok(patched.status === 200, "authorized update (clearing room) succeeds");
const afterPatch = (await req("/timetable", { token: a })).data.find((s) => s.id === slotId);
ok(afterPatch.room === null && afterPatch.room_id === null, "cleared room persists as null (refresh-safe re-fetch)");

// ================= 5. Teacher / Student / Parent visibility =================
const teacherProfile = (await req("/teachers/me", { token: teacher })).data;
const mappings = (await req(`/subjects/mappings?teacherId=${teacherProfile.id}`, { token: a })).data;
const mappedClassIds = [...new Set(mappings.map((m) => m.class_id))];
const jsonClassIds = JSON.parse(teacherProfile.assigned_classes || "[]");
const homeroomClassIds = classesA.filter((c) => c.class_teacher_id === teacherProfile.id).map((c) => c.id);
const teacherClassIds = [...new Set([...(mappedClassIds.length ? mappedClassIds : jsonClassIds), ...homeroomClassIds])];

const teacherView = await req("/timetable", { token: teacher });
ok(
  teacherView.data.every((s) => s.class_id === null || teacherClassIds.includes(s.class_id)),
  "teacher only sees timetable entries for classes they are authoritatively associated with",
);

const studentView = await req("/timetable", { token: studentToken });
ok(
  studentView.data.every((s) => s.class_id === student.class_id),
  "student only sees timetable entries for their own class",
);

const parentRow = (await req("/parents", { token: parentToken })).data[0];
const parentChildren = (await req(`/parents/${parentRow.id}/children`, { token: parentToken })).data;
ok(parentChildren.length > 0, "parent has at least one linked child");
const targetChildId = parentChildren.some((c) => c.id === student.id) ? student.id : parentChildren[0].id;
const parentView = await req(`/timetable?studentId=${targetChildId}`, { token: parentToken });
ok(parentView.status === 200, "parent can view timetable for their own linked child");

// ================= 6. Invalid IDs =================
const bogus = "00000000-0000-0000-0000-000000000000";
ok((await req(`/timetable/${bogus}`, { token: a, method: "PATCH", body: { room: "X" } })).status === 404, "PATCH on a non-existent slot id returns 404");
ok((await req(`/timetable/${bogus}`, { token: a, method: "DELETE" })).status === 404, "DELETE on a non-existent slot id returns 404");

// ================= 7. School isolation + cross-school IDOR =================
ok((await req(`/timetable/${slotId}`, { token: b, method: "PATCH", body: { room: "Hijack" } })).status === 404, "School B admin cannot PATCH School A's timetable slot by ID");
ok((await req(`/timetable/${slotId}`, { token: b, method: "DELETE" })).status === 404, "School B admin cannot DELETE School A's timetable slot by ID");
const listB = await req("/timetable", { token: b });
ok(!listB.data.some((s) => s.id === slotId || s.id === slot2Id), "School B's timetable list never contains School A rows");

// ================= 8. Audit events =================
const auditRows = (await req(`/audit?action=timetable.created`, { token: superToken })).data;
ok(auditRows.some((r) => r.target === slotId), "timetable.created audit event recorded for this run's slot");
const auditUpdate = (await req(`/audit?action=timetable.updated`, { token: superToken })).data;
ok(auditUpdate.some((r) => r.target === slotId), "timetable.updated audit event recorded");

// ================= cleanup =================
ok((await req(`/timetable/${slotId}`, { token: a, method: "DELETE" })).status === 200, "cleanup: delete first fixture slot");
ok((await req(`/timetable/${slot2Id}`, { token: a, method: "DELETE" })).status === 200, "cleanup: delete second fixture slot");
const auditDelete = (await req(`/audit?action=timetable.deleted`, { token: superToken })).data;
ok(auditDelete.some((r) => r.target === slotId), "timetable.deleted audit event recorded");

console.log("Timetable integration verification complete.");
