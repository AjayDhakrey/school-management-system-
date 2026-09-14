const base = process.env.ACADEMIC_TEST_API_URL ?? "http://localhost:43130/api";
async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(uniqueFixture(body)) } : {}) });
  return { status: response.status, data: await response.json().catch(() => null) };
}
function assert(value, message) { if (!value) throw new Error(message); console.log(`PASS ${message}`); }
async function login(email) { const result = await request("/auth/login", { method: "POST", body: { email, password: "password123" } }); assert(result.status === 200, `login ${email}`); return result.data.token; }
const runId = `${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 6)}`;
const schoolCode = `EVB-${runId}`, yearName = `2028-2029 Step3 ${runId}`;
const roomAName = `Step3 Science Lab ${runId}`, roomBName = `Step3 Room B ${runId}`;
const roomANumber = `S3A-${runId}`, roomBNumber = `S3B-${runId}`, className = `Class 10 Step3 ${runId}`;
const subjectAName = `Step3 Mathematics ${runId}`, subjectA2Name = `Step3 Physics ${runId}`;
const subjectACode = `S3M-${runId}`, subjectA2Code = `S3P-${runId}`;
const fixtureValues = new Map([
  ["EVB-STEP3", schoolCode], ["2028-2029 Step3", yearName], ["2028-2029", `2028-2029 ${runId}`],
  ["Step3 Science Lab", roomAName], ["step3 science lab", roomAName.toLowerCase()],
  ["Step3 Room B", roomBName], ["S3-101", roomANumber], ["S3-B", roomBNumber],
  ["Class 10 Step3", className], ["Step3 Mathematics", subjectAName],
  ["step3 mathematics", subjectAName.toLowerCase()], ["Step3 Physics", subjectA2Name],
  ["S3-MATH", subjectACode], ["S3-PHY", subjectA2Code],
]);
function uniqueFixture(value) {
  if (typeof value === "string") return fixtureValues.get(value) ?? value;
  if (Array.isArray(value)) return value.map(uniqueFixture);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, uniqueFixture(v)]));
  return value;
}

const a = await login("everbright.admin@example.com");
const b = await login("riverside.admin@example.com");
const teacher = await login("everbright.teacher@example.com");
const parent = await login("everbright.parent@example.com");
const superAdmin = await login("superadmin@example.com");

const profile = await request("/school-profile", { token: a });
assert(profile.status === 200, "School A profile loads");
assert((await request("/school-profile", { token: a, method: "PATCH", body: { code: "EVB-STEP3", website: "https://example.edu", board: "CBSE", affiliation: "AFF-001", principal: "Academic Test Principal" } })).status === 200, "School A profile updates");
assert((await request("/school-profile", { token: b })).data.code !== "EVB-STEP3", "School B profile is isolated from School A update");
assert((await request("/school-profile", { token: teacher, method: "PATCH", body: { code: "DENIED" } })).status === 403, "Teacher cannot update school profile");

const initialYears = await request("/academic-years", { token: a });
assert(initialYears.status === 200 && initialYears.data.some((year) => year.status === "ACTIVE"), "legacy school session migrated to active academic year");
assert((await request("/academic-years", { token: a, method: "POST", body: { name: "Invalid", startDate: "2028-04-01", endDate: "2028-03-31" } })).status === 400, "invalid academic date range rejected");
const yearA = await request("/academic-years", { token: a, method: "POST", body: { name: "2028-2029 Step3", startDate: "2028-04-01", endDate: "2029-03-31" } });
const yearB = await request("/academic-years", { token: b, method: "POST", body: { name: "2028-2029 Step3", startDate: "2028-04-01", endDate: "2029-03-31" } });
assert(yearA.status === 201 && yearB.status === 201, "school-specific academic years created for both schools");
assert((await request("/academic-years", { token: a, method: "POST", body: { name: "2028-2029 Step3", startDate: "2028-04-01", endDate: "2029-03-31" } })).status === 409, "duplicate academic year rejected within school");
assert((await request(`/academic-years/${yearA.data.id}`, { token: a, method: "PATCH", body: { name: "2028-2029", status: "ACTIVE" } })).status === 200, "academic year updated and activated");
assert((await request(`/academic-years/${yearA.data.id}`, { token: b })).status === 404, "academic year direct-ID isolation enforced");
assert((await request(`/academic-years/${yearA.data.id}`, { token: a, method: "DELETE" })).status === 409, "active academic year deletion blocked");
assert((await request("/academic-years", { token: teacher })).status === 200, "teacher can read academic years");
assert((await request("/academic-years", { token: teacher, method: "POST", body: { name: "Denied", startDate: "2030-01-01", endDate: "2031-01-01" } })).status === 403, "teacher cannot manage academic years");
assert((await request("/academic-years", { token: parent })).status === 200, "parent has read-only academic-year access");
assert((await request("/academic-years", { token: superAdmin })).status === 403, "Super Admin is not implicitly treated as school-scoped");

const roomA = await request("/rooms", { token: a, method: "POST", body: { name: "Step3 Science Lab", number: "S3-101", type: "LAB", capacity: 40 } });
const roomB = await request("/rooms", { token: b, method: "POST", body: { name: "Step3 Room B", number: "S3-B", capacity: 35 } });
assert(roomA.status === 201 && roomB.status === 201, "rooms created for both schools");
assert((await request("/rooms", { token: a, method: "POST", body: { name: "step3 science lab" } })).status === 409, "duplicate room rejected case-insensitively");
assert((await request(`/rooms/${roomA.data.id}`, { token: a })).status === 200, "room read-single works");
assert((await request(`/rooms/${roomA.data.id}`, { token: a, method: "PATCH", body: { capacity: 42 } })).status === 200, "room update works");
assert((await request(`/rooms/${roomB.data.id}`, { token: a })).status === 404, "room GET direct-ID isolation enforced");
assert((await request(`/rooms/${roomB.data.id}`, { token: a, method: "PATCH", body: { name: "Denied" } })).status === 404, "room PATCH direct-ID isolation enforced");
assert((await request(`/rooms/${roomB.data.id}`, { token: a, method: "DELETE" })).status === 404, "room DELETE direct-ID isolation enforced");

const teachersA = await request("/teachers", { token: a }); const teachersB = await request("/teachers", { token: b });
const teacherAId = teachersA.data[0].id, teacherBId = teachersB.data[0].id;
const classA = await request("/classes", { token: a, method: "POST", body: { name: "Class 10 Step3", section: "A", academicYearId: yearA.data.id, roomId: roomA.data.id, classTeacherId: teacherAId } });
const classB = await request("/classes", { token: b, method: "POST", body: { name: "Class 10 Step3", section: "A", academicYearId: yearB.data.id, roomId: roomB.data.id, classTeacherId: teacherBId } });
assert(classA.status === 201 && classB.status === 201, "class-section offerings created for both schools");
assert((await request("/classes", { token: a, method: "POST", body: { name: "Class 10 Step3", section: "A", academicYearId: yearA.data.id } })).status === 409, "duplicate class-section rejected in academic year");
assert((await request("/classes", { token: a, method: "POST", body: { name: "Cross School", section: "A", academicYearId: yearA.data.id, classTeacherId: teacherBId } })).status === 400, "cross-school class-teacher relationship rejected");
assert((await request("/classes", { token: a, method: "POST", body: { name: "Cross School", section: "A", academicYearId: yearB.data.id } })).status === 400, "cross-school academic-year relationship rejected");
assert((await request(`/classes/${classB.data.id}`, { token: a })).status === 404, "class GET direct-ID isolation enforced");
assert((await request(`/classes/${classB.data.id}`, { token: a, method: "PATCH", body: { name: "Denied" } })).status === 404, "class PATCH direct-ID isolation enforced");
assert((await request(`/classes/${classB.data.id}`, { token: a, method: "DELETE" })).status === 404, "class DELETE direct-ID isolation enforced");
assert((await request(`/classes/${classA.data.id}`, { token: a, method: "PATCH", body: { section: "Alpha", classTeacherId: teacherAId, roomId: roomA.data.id } })).status === 200, "section, class teacher and room assignments update");

const subjectA = await request("/subjects", { token: a, method: "POST", body: { name: "Step3 Mathematics", code: "S3-MATH", type: "Core", credits: 5 } });
const subjectA2 = await request("/subjects", { token: a, method: "POST", body: { name: "Step3 Physics", code: "S3-PHY", type: "Core", credits: 4 } });
const subjectB = await request("/subjects", { token: b, method: "POST", body: { name: "Step3 Mathematics", code: "S3-MATH", type: "Core", credits: 5 } });
assert(subjectA.status === 201 && subjectA2.status === 201 && subjectB.status === 201, "school-specific subjects created");
assert((await request("/subjects", { token: a, method: "POST", body: { name: "step3 mathematics", code: "OTHER" } })).status === 409, "duplicate subject rejected within school");
assert((await request(`/subjects/${subjectA.data.id}`, { token: a })).status === 200, "subject read-single works");
const map1 = await request("/subjects/mappings", { token: a, method: "POST", body: { classId: classA.data.id, subjectId: subjectA.data.id, teacherId: teacherAId } });
const map2 = await request("/subjects/mappings", { token: a, method: "POST", body: { classId: classA.data.id, subjectId: subjectA2.data.id, teacherId: teacherAId } });
assert(map1.status === 201 && map2.status === 201, "teacher assigned to multiple subjects in one class-section");
assert((await request("/subjects/mappings", { token: a, method: "POST", body: { classId: classA.data.id, subjectId: subjectA.data.id, teacherId: teacherBId } })).status === 400, "cross-school teacher assignment rejected");
assert((await request("/subjects/mappings", { token: a, method: "POST", body: { classId: classB.data.id, subjectId: subjectA.data.id, teacherId: teacherAId } })).status === 400, "cross-school class assignment rejected");
assert((await request("/subjects/mappings", { token: a, method: "POST", body: { classId: classA.data.id, subjectId: subjectB.data.id, teacherId: teacherAId } })).status === 400, "cross-school subject assignment rejected");
assert((await request(`/subjects/${subjectA.data.id}`, { token: a, method: "DELETE" })).status === 409, "assigned subject deletion blocked");
assert((await request(`/classes/${classA.data.id}`, { token: a, method: "DELETE" })).status === 409, "referenced class-section deletion blocked");
assert((await request(`/rooms/${roomA.data.id}`, { token: a, method: "DELETE" })).status === 409, "assigned room deletion blocked");

const verifyClass = await request(`/classes/${classA.data.id}`, { token: a });
const verifyMappings = await request(`/subjects/mappings?classId=${classA.data.id}`, { token: a });
assert(verifyClass.data.section === "Alpha" && verifyClass.data.room_id === roomA.data.id && verifyClass.data.class_teacher_id === teacherAId, "class-section relationships read back correctly");
assert(verifyMappings.data.length === 2, "class-subject-teacher relationships read back correctly");
console.log("Academic integration verification complete.");
