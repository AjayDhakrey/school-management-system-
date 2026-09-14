// Step 12 integration check: Homework & Submissions. Every fixture is stamped with
// Date.now() so the suite is safely rerunnable against the live Supabase DB (no shared
// fixed-name collisions across runs, matching the student-admission-check.mjs pattern).
const base = process.env.HOMEWORK_TEST_API_URL ?? "http://localhost:43142/api";
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

const stamp = Date.now();
const a = await login("everbright.admin@example.com"); // School A admin
const b = await login("riverside.admin@example.com"); // School B admin
const teacher = await login("everbright.teacher@example.com"); // School A teacher
const teacherB = await login("riverside.teacher@example.com"); // School B teacher (cross-school IDOR)
const studentToken = await login("everbright.student@example.com");
const parentToken = await login("everbright.parent@example.com");

// ---- resolve real, authoritative fixtures (no hardcoded IDs) ----
const student = (await req("/students/me", { token: studentToken })).data;
ok(student?.id && student?.class_id, "resolved demo student identity and class");

const teacherProfile = (await req("/teachers/me", { token: teacher })).data;
const jsonClassIds = JSON.parse(teacherProfile.assigned_classes || "[]");
const jsonSubjectIds = JSON.parse(teacherProfile.assigned_subjects || "[]");

const classesA = (await req("/classes", { token: a })).data;
const subjectsA = (await req("/subjects", { token: a })).data;
const classesB = (await req("/classes", { token: b })).data;

// Mirror the app's own authorization source exactly (helpers.ts classScopeForUser /
// teacherAssignedClasses / teacherAssignedSubjects): class_subjects rows take priority
// over the legacy JSON columns when present, and homeroom (class_teacher_id) is always
// unioned in. Re-deriving this independently from the JSON column alone is unreliable —
// this school's seed data has class_subjects rows that don't match the legacy JSON 1:1.
const mappings = (await req(`/subjects/mappings?teacherId=${teacherProfile.id}`, { token: a })).data;
const mappedClassIds = [...new Set(mappings.map((m) => m.class_id))];
const mappedSubjectIds = [...new Set(mappings.map((m) => m.subject_id))];
const homeroomClassIds = classesA.filter((c) => c.class_teacher_id === teacherProfile.id).map((c) => c.id);
const teacherClassIds = [...new Set([...(mappedClassIds.length ? mappedClassIds : jsonClassIds), ...homeroomClassIds])];
const teacherSubjectIds = mappedSubjectIds.length ? mappedSubjectIds : jsonSubjectIds;
ok(teacherClassIds.length && teacherSubjectIds.length, "teacher has authoritative class/subject assignments");

const teacherClassId = teacherClassIds[0];
const teacherSubjectName = subjectsA.find((s) => teacherSubjectIds.includes(s.id))?.name;
ok(teacherSubjectName, "resolved a subject name the teacher is authorized to teach");

const foreignClassId = classesA.find((c) => !teacherClassIds.includes(c.id))?.id;
ok(foreignClassId, "resolved a class the teacher is NOT assigned to (neither subject-taught nor homeroom)");
const foreignSubject = subjectsA.find((s) => !teacherSubjectIds.includes(s.id))?.name;
ok(foreignSubject, "resolved a subject the teacher does NOT teach");

const today = new Date().toISOString().slice(0, 10);
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

// ================= 1. Authorized creation (teacher, own class+subject) =================
const created = await req("/homework", {
  token: teacher,
  method: "POST",
  body: {
    classId: teacherClassId,
    subject: teacherSubjectName,
    title: `Step12 Teacher HW ${stamp}`,
    description: "Integration test fixture",
    dueDate: nextWeek,
  },
});
ok(created.status === 201, "authorized homework creation (own class + own subject)");
const teacherHwId = created.data.id;

const teacherList = await req("/homework", { token: teacher });
ok(
  teacherList.data.some((h) => h.id === teacherHwId),
  "teacher sees their own created homework in scoped list",
);
const createdRow = teacherList.data.find((h) => h.id === teacherHwId);
ok(createdRow.assigned_date === today, "assigned_date defaults to today when omitted");
ok(createdRow.subject_id, "subject_id resolved and stored alongside subject text");

// ================= 2. Unauthorized creation =================
ok(
  (
    await req("/homework", {
      token: teacher,
      method: "POST",
      body: { classId: foreignClassId, subject: teacherSubjectName, title: "Denied", dueDate: nextWeek },
    })
  ).status === 403,
  "teacher cannot create homework for a class they are not assigned to",
);
ok(
  (
    await req("/homework", {
      token: teacher,
      method: "POST",
      body: { classId: teacherClassId, subject: foreignSubject, title: "Denied", dueDate: nextWeek },
    })
  ).status === 403,
  "teacher cannot create homework for a subject they do not teach",
);
ok(
  (await req("/homework", { token: teacher, method: "POST", body: { classId: teacherClassId } })).status === 400,
  "title is required",
);

// ================= 8/7. Invalid relationships / validation =================
const foreignSchoolClassId = classesB[0].id;
ok(
  (
    await req("/homework", {
      token: a,
      method: "POST",
      body: { classId: foreignSchoolClassId, title: "Cross-school class", dueDate: nextWeek },
    })
  ).status === 400,
  "admin cannot create homework against another school's class (IDOR closed)",
);
ok(
  (
    await req("/homework", {
      token: a,
      method: "POST",
      body: { classId: teacherClassId, subject: `Nonexistent Subject ${stamp}`, title: "Bad subject", dueDate: nextWeek },
    })
  ).status === 400,
  "unknown subject name is rejected",
);
ok(
  (
    await req("/homework", {
      token: a,
      method: "POST",
      body: { classId: teacherClassId, title: "Bad date", dueDate: "not-a-date" },
    })
  ).status === 400,
  "invalid due date format is rejected",
);
ok(
  (
    await req("/homework", {
      token: a,
      method: "POST",
      body: { classId: teacherClassId, title: "Due before assigned", assignedDate: nextWeek, dueDate: today },
    })
  ).status === 400,
  "due date before assigned date is rejected",
);

// Admin-created homework targeting the demo student's own class (teacher_id stays NULL).
// due_date is compared against `new Date()` server-side (existing, preserved logic) so a
// same-day due date can already read as "past" depending on time-of-day/UTC — use a due
// date unambiguously in the future so this on-time submission isn't a false Late.
const adminHw = await req("/homework", {
  token: a,
  method: "POST",
  body: {
    classId: student.class_id,
    title: `Step12 Admin HW ${stamp}`,
    description: "Admin-assigned fixture",
    dueDate: nextWeek,
    assignedDate: today,
  },
});
ok(adminHw.status === 201, "school admin can create homework directly");
const adminHwId = adminHw.data.id;

// ================= 3. Teacher scope: cannot touch homework that isn't theirs =================
ok(
  (await req(`/homework/${adminHwId}`, { token: teacher, method: "PATCH", body: { title: "Hijack" } })).status === 403,
  "teacher cannot PATCH homework they do not own (teacher_id mismatch)",
);
ok(
  (await req(`/homework/${adminHwId}`, { token: teacher, method: "DELETE" })).status === 403,
  "teacher cannot DELETE homework they do not own",
);

// ================= 4. Student visibility =================
const studentList = await req("/homework", { token: studentToken });
ok(
  studentList.data.some((h) => h.id === adminHwId),
  "student sees homework assigned to their own class immediately (no hidden publish gate)",
);
ok(
  !studentList.data.some((h) => h.id === teacherHwId) || teacherClassId === student.class_id,
  "student does not see homework for a class that is not their own",
);

// ================= 5/6. Submission + ownership + late detection + resubmission =================
const submit1 = await req("/homework-submissions", {
  token: studentToken,
  method: "POST",
  body: { homeworkId: adminHwId, fileName: "essay.pdf", note: "first attempt" },
});
ok(submit1.status === 201, "student submits their own homework");
ok(submit1.data.status === "Submitted", "on-time submission is marked Submitted, not Late");

const resubmit = await req("/homework-submissions", {
  token: studentToken,
  method: "POST",
  body: { homeworkId: adminHwId, fileName: "essay-v2.pdf", note: "revised" },
});
ok(resubmit.status === 200 && resubmit.data.id === submit1.data.id, "resubmission replaces the same row (existing intended behavior)");

const dupCheck = await req(`/homework-submissions?homeworkId=${adminHwId}`, { token: a });
ok(
  dupCheck.data.filter((s) => s.student_id === student.id).length === 1,
  "UNIQUE(homework_id, student_id) — exactly one row per student even after resubmission",
);

const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const lateHw = await req("/homework", {
  token: a,
  method: "POST",
  body: { classId: student.class_id, title: `Step12 Overdue HW ${stamp}`, dueDate: yesterday, assignedDate: yesterday },
});
ok(lateHw.status === 201, "admin creates a fixture already past its due date");
const lateSubmit = await req("/homework-submissions", {
  token: studentToken,
  method: "POST",
  body: { homeworkId: lateHw.data.id, fileName: "late.pdf" },
});
ok(lateSubmit.data.status === "Late", "submitting after the due date is marked Late");
await req(`/homework/${lateHw.data.id}`, { token: a, method: "DELETE" });

const otherClassId = classesA.find((c) => c.id !== student.class_id)?.id;
ok(otherClassId, "resolved a class distinct from the demo student's own class");
const foreignClassHw = await req("/homework", {
  token: a,
  method: "POST",
  body: { classId: otherClassId, title: `Step12 Foreign Class HW ${stamp}`, dueDate: nextWeek },
});
ok(foreignClassHw.status === 201, "admin creates homework in a class other than the student's own (fixture for next check)");
ok(
  (
    await req("/homework-submissions", {
      token: studentToken,
      method: "POST",
      body: { homeworkId: foreignClassHw.data.id, fileName: "wrong-class.pdf" },
    })
  ).status === 403,
  "student cannot submit to homework outside their own class",
);
await req(`/homework/${foreignClassHw.data.id}`, { token: a, method: "DELETE" });

// ================= 7. Review / grading (teacher scope enforced) =================
ok(
  (
    await req(`/homework-submissions/${submit1.data.id}`, {
      token: teacher,
      method: "PATCH",
      body: { feedback: "Hijack attempt", grade: "F" },
    })
  ).status === 403,
  "a teacher who does not own the homework cannot grade its submissions",
);
const review = await req(`/homework-submissions/${submit1.data.id}`, {
  token: a,
  method: "PATCH",
  body: { feedback: "Well done", grade: "A" },
});
ok(review.status === 200, "school admin can review/grade any submission in their school");
const afterReview = await req(`/homework-submissions?homeworkId=${adminHwId}`, { token: a });
const graded = afterReview.data.find((s) => s.id === submit1.data.id);
ok(graded.status === "Reviewed" && graded.grade === "A" && graded.feedback === "Well done", "grade/feedback persisted and status set to Reviewed");

// ================= 9. Invalid IDs =================
const bogus = "00000000-0000-0000-0000-000000000000";
ok((await req(`/homework/${bogus}`, { token: a, method: "PATCH", body: { title: "x" } })).status === 404, "PATCH on a non-existent homework id returns 404");
ok((await req(`/homework/${bogus}`, { token: a, method: "DELETE" })).status === 404, "DELETE on a non-existent homework id returns 404");
ok(
  (await req("/homework-submissions", { token: studentToken, method: "POST", body: { homeworkId: bogus, fileName: "x" } })).status === 404,
  "submitting against a non-existent homework id returns 404",
);
ok((await req(`/homework-submissions/${bogus}`, { token: a, method: "PATCH", body: { grade: "A" } })).status === 404, "reviewing a non-existent submission id returns 404");

// ================= 10/11. School isolation + cross-school IDOR =================
ok((await req(`/homework/${adminHwId}`, { token: b, method: "PATCH", body: { title: "Hijack" } })).status === 404, "School B admin cannot PATCH School A homework by ID");
ok((await req(`/homework/${adminHwId}`, { token: b, method: "DELETE" })).status === 404, "School B admin cannot DELETE School A homework by ID");
ok(
  (await req(`/homework-submissions?homeworkId=${adminHwId}`, { token: teacherB })).status === 404,
  "School B teacher cannot list submissions for a School A homework id",
);
const listB = await req("/homework", { token: b });
ok(!listB.data.some((h) => h.id === adminHwId || h.id === teacherHwId), "School B's homework list never contains School A rows");

// ================= Parent access (if the app exposes it) =================
const parentRow = (await req("/parents", { token: parentToken })).data[0];
const parentChildren = (await req(`/parents/${parentRow.id}/children`, { token: parentToken })).data;
ok(parentChildren.length > 0, "parent has at least one linked child");
const targetChildId = parentChildren.some((c) => c.id === student.id) ? student.id : parentChildren[0].id;
const parentHw = await req(`/homework?studentId=${targetChildId}`, { token: parentToken });
ok(parentHw.status === 200, "parent can view homework for their own linked child");

// ================= 13. Refresh persistence (re-fetch reflects the same server state) =================
const reread = await req(`/homework-submissions?homeworkId=${adminHwId}`, { token: a });
const stillGraded = reread.data.find((s) => s.id === submit1.data.id);
ok(stillGraded?.grade === "A" && stillGraded?.status === "Reviewed", "re-fetching after the actions above returns the same persisted state (refresh-safe)");

// ================= 14. Transaction: deleting homework atomically removes its submissions =================
const del = await req(`/homework/${adminHwId}`, { token: a, method: "DELETE" });
ok(del.status === 200, "school admin deletes homework with existing submissions");
const afterDelete = await req(`/homework-submissions?homeworkId=${adminHwId}`, { token: a });
ok(afterDelete.status === 404, "homework and its submissions are gone together (transactional cascade, no orphaned rows)");

await req(`/homework/${teacherHwId}`, { token: teacher, method: "DELETE" });

console.log("Homework & submissions integration verification complete.");
