// Step 6 — Attendance Management integration verification.
// Student / Teacher / Staff attendance: load, mark, bulk, correct, summary, scope, isolation, dates.
const base = process.env.ATTENDANCE_TEST_API_URL ?? "http://localhost:43260/api";
async function r(path, { token, method = "GET", body } = {}) {
  const x = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: x.status, data: await x.json().catch(() => null) };
}
function ok(v, m) {
  if (!v) throw new Error(m);
  console.log(`PASS ${m}`);
}
async function login(email, password = "password123") {
  const x = await r("/auth/login", { method: "POST", body: { email, password } });
  ok(x.status === 200, `login ${email}`);
  return x.data.token;
}
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const TODAY = iso(0);
const YESTERDAY = iso(-1);

const a = await login("everbright.admin@example.com");
const b = await login("riverside.admin@example.com");
const teacher = await login("everbright.teacher@example.com");
const staffTok = await login("everbright.staff@example.com");
const parentTok = await login("everbright.parent@example.com");
const studentTok = await login("everbright.student@example.com");
const superTok = await login("superadmin@example.com");

// ---------------------------------------------------------------- STUDENT ATTENDANCE
const classesA = (await r("/classes", { token: a })).data;
const classesB = (await r("/classes", { token: b })).data;
const teacherProfile = (await r("/teachers/me", { token: teacher })).data;
const myClass = classesA.find((c) => c.class_teacher_id === teacherProfile.id); // demo teacher's class
ok(Boolean(myClass), "demo teacher is a Class Teacher of a real class");
const otherClass = classesA.find((c) => c.id !== myClass.id);
const classB = classesB[0];

// roster load
let roster = await r(`/attendance/roster?classId=${myClass.id}&date=${TODAY}`, { token: a });
ok(roster.status === 200 && Array.isArray(roster.data.students) && roster.data.students.length > 0, "admin loads class roster with enrolled students");
ok(roster.data.academicYearId === myClass.academic_year_id, "roster reports the class academic year");
const students = roster.data.students;

// bulk mark all present
let bulk = await r("/attendance/bulk", {
  token: a,
  method: "POST",
  body: { classId: myClass.id, date: TODAY, entries: students.map((s) => ({ studentId: s.id, status: "Present" })) },
});
ok(bulk.status === 200 && bulk.data.saved === students.length, "bulk mark-all-present saves every student");

// adjust two
const [s1, s2, s3] = students;
bulk = await r("/attendance/bulk", {
  token: a,
  method: "POST",
  body: {
    classId: myClass.id,
    date: TODAY,
    entries: [
      { studentId: s1.id, status: "Absent", remarks: "No intimation" },
      { studentId: s2.id, status: "Late" },
      ...students.slice(2).map((s) => ({ studentId: s.id, status: "Present" })),
    ],
  },
});
ok(bulk.status === 200, "bulk re-save with adjustments succeeds");

roster = await r(`/attendance/roster?classId=${myClass.id}&date=${TODAY}`, { token: a });
const byId = Object.fromEntries(roster.data.students.map((s) => [s.id, s]));
ok(byId[s1.id].status === "Absent" && byId[s1.id].remarks === "No intimation", "reload shows persisted Absent + remark");
ok(byId[s2.id].status === "Late" && byId[s3.id].status === "Present", "reload shows persisted Late / Present");

// no duplicates after repeated saves
const all = (await r(`/attendance?classId=${myClass.id}&date=${TODAY}`, { token: a })).data;
const dupes = all.filter((x, i, arr) => arr.findIndex((y) => y.student_id === x.student_id) !== i);
ok(all.length === students.length && dupes.length === 0, "one attendance row per student/date after repeated saves");
ok(all.every((x) => x.academic_year_id === myClass.academic_year_id), "every attendance row carries the academic year");

// single correction Absent -> Present
let corr = await r("/attendance", { token: a, method: "POST", body: { studentId: s1.id, date: TODAY, status: "Present" } });
ok(corr.status === 200, "single POST corrects an existing record (200, not 201)");
roster = await r(`/attendance/roster?classId=${myClass.id}&date=${TODAY}`, { token: a });
ok(roster.data.students.find((s) => s.id === s1.id).status === "Present", "correction persisted");
const s1rows = (await r(`/attendance?studentId=${s1.id}&date=${TODAY}`, { token: a })).data;
ok(s1rows.length === 1, "correction did not create a duplicate row");

// PATCH correction
corr = await r(`/attendance/${s1rows[0].id}`, { token: a, method: "PATCH", body: { status: "Late", remarks: "Bus late" } });
ok(corr.status === 200, "PATCH correction succeeds");
ok((await r(`/attendance?studentId=${s1.id}&date=${TODAY}`, { token: a })).data[0].status === "Late", "PATCH correction persisted");

// summary
const summ = (await r(`/attendance/summary?classId=${myClass.id}&from=${TODAY}&to=${TODAY}`, { token: a })).data;
ok(summ.present + summ.absent + summ.late + summ.leave === students.length, "summary counts reconcile to class size");
ok(typeof summ.percentage === "number" && summ.eligible === summ.present + summ.late + summ.absent, "summary uses the documented eligible-days formula");

// date validation
ok((await r("/attendance", { token: a, method: "POST", body: { studentId: s1.id, date: "2026-13-40", status: "Present" } })).status === 400, "impossible date rejected");
ok((await r("/attendance", { token: a, method: "POST", body: { studentId: s1.id, date: "not-a-date", status: "Present" } })).status === 400, "malformed date rejected");
ok((await r("/attendance", { token: a, method: "POST", body: { studentId: s1.id, date: iso(10), status: "Present" } })).status === 400, "future date rejected");
ok((await r("/attendance", { token: a, method: "POST", body: { studentId: s1.id, date: TODAY, status: "Nonsense" } })).status === 400, "invalid status rejected");
ok([200, 201].includes((await r("/attendance", { token: a, method: "POST", body: { studentId: s1.id, date: iso(-6), status: "Present" } })).status), "historical (past) date allowed for correction");

// bulk transaction safety — a bad status in the batch writes nothing
const before = (await r(`/attendance?classId=${myClass.id}&date=${iso(-2)}`, { token: a })).data.length;
const badBulk = await r("/attendance/bulk", {
  token: a,
  method: "POST",
  body: { classId: myClass.id, date: iso(-2), entries: [{ studentId: s1.id, status: "Present" }, { studentId: s2.id, status: "BOGUS" }] },
});
ok(badBulk.status === 400, "bulk with an invalid entry is rejected");
ok((await r(`/attendance?classId=${myClass.id}&date=${iso(-2)}`, { token: a })).data.length === before, "rejected bulk wrote nothing (transaction safety)");

// bulk ignores a studentId not in the class (never trusts arbitrary ids)
const foreignStudent = (await r("/students", { token: b })).data[0];
const mixed = await r("/attendance/bulk", {
  token: a,
  method: "POST",
  body: { classId: myClass.id, date: TODAY, entries: [{ studentId: foreignStudent.id, status: "Present" }, { studentId: s1.id, status: "Present" }] },
});
ok(mixed.status === 200 && mixed.data.skipped >= 1, "bulk skips a student not enrolled in the class");
ok((await r(`/attendance?studentId=${foreignStudent.id}`, { token: a })).data.length === 0, "no attendance row created for the foreign student");

// ---------------------------------------------------------------- MULTI-SCHOOL / IDOR (student attendance)
ok((await r(`/attendance/roster?classId=${classB.id}&date=${TODAY}`, { token: a })).status === 404, "School A cannot load a School B class roster");
ok((await r("/attendance", { token: a, method: "POST", body: { studentId: foreignStudent.id, date: TODAY, status: "Present" } })).status === 404, "School A cannot mark a School B student");
const bRoster = await r(`/attendance/roster?classId=${classB.id}&date=${TODAY}`, { token: b });
const bBulk = await r("/attendance/bulk", { token: b, method: "POST", body: { classId: classB.id, date: TODAY, entries: bRoster.data.students.map((s) => ({ studentId: s.id, status: "Present" })) } });
ok(bBulk.status === 200, "School B admin marks its own class");
const bRow = (await r(`/attendance?classId=${classB.id}&date=${TODAY}`, { token: b })).data[0];
ok((await r(`/attendance/${bRow.id}`, { token: a, method: "PATCH", body: { status: "Absent" } })).status === 404, "School A cannot PATCH a School B attendance record");

// ---------------------------------------------------------------- TEACHER SCOPE (student attendance)
ok((await r(`/attendance/roster?classId=${myClass.id}&date=${TODAY}`, { token: teacher })).status === 200, "Class Teacher loads their own class roster");
ok((await r(`/attendance/roster?classId=${otherClass.id}&date=${TODAY}`, { token: teacher })).status === 403, "teacher denied roster for a class they are not Class Teacher of");
ok((await r("/attendance/bulk", { token: teacher, method: "POST", body: { classId: myClass.id, date: TODAY, entries: [{ studentId: s1.id, status: "Present" }] } })).status === 200, "Class Teacher bulk-marks their own class");
ok((await r("/attendance/bulk", { token: teacher, method: "POST", body: { classId: otherClass.id, date: TODAY, entries: [] } })).status === 403, "teacher cannot bulk-mark an unrelated class");
ok((await r("/attendance", { token: teacher, method: "POST", body: { studentId: byId[Object.keys(byId)[0]].id, date: TODAY, status: "Present" } })).status === 200, "Class Teacher single-marks a student in their class");
ok((await r(`/attendance/roster?classId=${classB.id}&date=${TODAY}`, { token: teacher })).status === 404, "teacher denied a School B class roster");

// ---------------------------------------------------------------- STUDENT / PARENT SCOPE
const ownAttendance = await r("/attendance", { token: studentTok });
ok(ownAttendance.status === 200 && ownAttendance.data.every((x) => x.student_id === ownAttendance.data[0].student_id), "student sees only their own attendance");
ok((await r(`/attendance?studentId=${foreignStudent.id}`, { token: studentTok })).data.length === 0, "student cannot read another student's attendance by id");
ok((await r("/attendance/summary", { token: studentTok })).status === 200, "student reads their own summary");

const myKids = (await r("/parents", { token: parentTok })).data;
const parentChildren = (await r(`/parents/${myKids[0].id}/children`, { token: a })).data ?? [];
const childA = (await r("/students", { token: a })).data.find((s) => s.parent_id === myKids[0].id) ?? (await r("/students", { token: a })).data[0];
const parentView = await r(`/attendance?studentId=${childA.id}`, { token: parentTok });
ok(parentView.status === 200, "parent reads a linked child's attendance");
ok(parentView.data.every((x) => x.student_id === childA.id), "parent child attendance is scoped to that child");
ok((await r(`/attendance?studentId=${foreignStudent.id}`, { token: parentTok })).data.length === 0, "parent cannot read an unrelated child's attendance");
ok((await r(`/attendance/summary?studentId=${foreignStudent.id}`, { token: parentTok })).data.total === 0, "parent summary for an unrelated child returns nothing");

// ---------------------------------------------------------------- TEACHER ATTENDANCE
let tRoster = await r(`/teacher-attendance/roster?date=${TODAY}`, { token: a });
ok(tRoster.status === 200 && tRoster.data.people.length > 0, "admin loads the teacher attendance roster");
ok(tRoster.data.people.every((p) => ["ACTIVE", "ON_LEAVE"].includes(p.employment_status)), "roster excludes inactive/archived teachers");
let tBulk = await r("/teacher-attendance/bulk", { token: a, method: "POST", body: { date: TODAY, entries: tRoster.data.people.map((p, i) => ({ teacherId: p.id, status: i === 0 ? "Absent" : "Present" })) } });
ok(tBulk.status === 200 && tBulk.data.saved === tRoster.data.people.length, "bulk teacher attendance saves");
tRoster = await r(`/teacher-attendance/roster?date=${TODAY}`, { token: a });
ok(tRoster.data.people[0].status === "Absent", "teacher attendance reload shows persisted status");
const tRec = (await r(`/teacher-attendance?date=${TODAY}&teacherId=${tRoster.data.people[0].id}`, { token: a })).data[0];
ok((await r(`/teacher-attendance/${tRec.id}`, { token: a, method: "PATCH", body: { status: "Leave" } })).status === 200, "teacher attendance correction via PATCH");
ok((await r("/teacher-attendance", { token: a, method: "POST", body: { teacherId: tRoster.data.people[0].id, date: TODAY, status: "Present" } })).status === 200, "repeated teacher POST upserts (200)");
const tCount = (await r(`/teacher-attendance?date=${TODAY}&teacherId=${tRoster.data.people[0].id}`, { token: a })).data.length;
ok(tCount === 1, "one teacher attendance row per teacher/date");
ok((await r("/teacher-attendance", { token: a, method: "POST", body: { teacherId: tRoster.data.people[0].id, date: iso(9), status: "Present" } })).status === 400, "future teacher attendance rejected");
ok((await r("/teacher-attendance", { token: teacher, method: "POST", body: { teacherId: teacherProfile.id, date: TODAY, status: "Present" } })).status === 403, "a teacher cannot manage teacher attendance");
const tSelf = await r("/teacher-attendance", { token: teacher });
ok(tSelf.status === 200 && tSelf.data.every((x) => x.teacher_id === teacherProfile.id), "teacher self-service sees only their own attendance");
const teachersB = (await r("/teachers", { token: b })).data;
ok((await r("/teacher-attendance", { token: a, method: "POST", body: { teacherId: teachersB[0].id, date: TODAY, status: "Present" } })).status === 404, "School A cannot mark a School B teacher");

// ---------------------------------------------------------------- STAFF ATTENDANCE
let sRoster = await r(`/staff-attendance/roster?date=${TODAY}`, { token: a });
ok(sRoster.status === 200 && sRoster.data.people.length > 0, "admin loads the staff attendance roster");
const adminDept = await r(`/staff-attendance/roster?date=${TODAY}&department=ADMIN`, { token: a });
ok(adminDept.data.people.every((p) => p.department === "ADMIN") && adminDept.data.people.length > 0, "staff roster department filter uses canonical codes");
let sBulk = await r("/staff-attendance/bulk", { token: a, method: "POST", body: { date: TODAY, entries: sRoster.data.people.map((p) => ({ staffId: p.id, status: "Present" })) } });
ok(sBulk.status === 200, "bulk staff attendance saves");
const sRec = (await r(`/staff-attendance?date=${TODAY}`, { token: a })).data[0];
ok((await r(`/staff-attendance/${sRec.id}`, { token: a, method: "PATCH", body: { status: "Late" } })).status === 200, "staff attendance correction");
const staffSelf = await r("/staff-attendance", { token: staffTok });
ok(staffSelf.status === 200 && staffSelf.data.every((x) => x.staff_id === staffSelf.data[0].staff_id), "staff self-service sees only their own attendance");
const staffB = (await r("/staff", { token: b })).data;
ok((await r("/staff-attendance", { token: a, method: "POST", body: { staffId: staffB[0].id, date: TODAY, status: "Present" } })).status === 404, "School A cannot mark School B staff");

// archived staff: history survives, new marking blocked
const archStaff = await r("/staff", { token: a, method: "POST", body: { name: "Attn Archive Staff", department: "LIBRARY" } });
await r("/staff-attendance", { token: a, method: "POST", body: { staffId: archStaff.data.id, date: YESTERDAY, status: "Present" } });
await r(`/staff/${archStaff.data.id}`, { token: a, method: "PATCH", body: { employmentStatus: "ARCHIVED" } });
ok((await r(`/staff-attendance?staffId=${archStaff.data.id}`, { token: a })).data.length === 1, "archived staff historical attendance is preserved");
ok((await r("/staff-attendance", { token: a, method: "POST", body: { staffId: archStaff.data.id, date: TODAY, status: "Present" } })).status === 409, "archived staff cannot receive new attendance");
ok((await r(`/staff-attendance/roster?date=${TODAY}`, { token: a })).data.people.every((p) => p.id !== archStaff.data.id), "archived staff absent from the roster");

// ---------------------------------------------------------------- AUDIT
const audit = (await r("/audit", { token: superTok })).data;
ok(audit.some((x) => x.action === "attendance.bulk_marked"), "bulk student attendance is audited");
ok(audit.some((x) => x.action === "attendance.corrected"), "attendance corrections are audited");
ok(audit.some((x) => x.action === "teacher_attendance.bulk_marked"), "bulk teacher attendance is audited");

// ---------------------------------------------------------------- RBAC (super admin never school-scoped)
ok((await r("/attendance", { token: superTok })).status === 403, "super admin is not treated as a school attendance user");
ok((await r(`/attendance/roster?classId=${myClass.id}&date=${TODAY}`, { token: superTok })).status === 403, "super admin cannot load a school roster");

console.log(`__ATTN_IDS__ ${JSON.stringify({ classId: myClass.id, studentId: s1.id, teacherId: teacherProfile.id, date: TODAY })}`);
console.log("Attendance integration verification complete.");
