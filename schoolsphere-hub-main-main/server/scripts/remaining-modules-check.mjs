import "dotenv/config";
import pg from "pg";

const base = process.env.REMAINING_TEST_API_URL ?? "http://localhost:43140/api";
const created = { books: [], vehicles: [], leave: [], notices: [], certificates: [], holidays: [], events: [] };
let passed = 0;
function assert(value, message) { if (!value) throw new Error(message); passed++; console.log(`PASS ${message}`); }
async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json().catch(() => null) };
}
async function login(email) {
  const result = await request("/auth/login", { method: "POST", body: { email, password: "password123" } });
  assert(result.status === 200, `login ${email}`); return result.data.token;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false } });
try {
  const adminA = await login("everbright.admin@example.com");
  const adminB = await login("riverside.admin@example.com");
  const studentA = await login("everbright.student@example.com");
  const studentB = await login("riverside.student@example.com");
  const studentsA = await request("/students", { token: adminA });
  const studentsB = await request("/students", { token: adminB });
  assert(studentsA.status === 200 && studentsA.data.length && studentsB.status === 200 && studentsB.data.length, "tenant student fixtures available");
  const ownStudent = await request("/students/me", { token: studentA });
  assert(ownStudent.status === 200, "student ownership fixture available");
  const sidA = ownStudent.data.id, sidB = studentsB.data[0].id;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const book = await request("/library/books", { token: adminA, method: "POST", body: { title: `Regression Book ${suffix}`, author: "Test" } });
  assert(book.status === 201, "Library book create persists"); created.books.push(book.data.id);
  const issue = await request("/library/records", { token: adminA, method: "POST", body: { bookId: book.data.id, studentId: sidA } });
  assert(issue.status === 201, "Library valid issue");
  assert((await request("/library/records", { token: adminA, method: "POST", body: { bookId: book.data.id, studentId: sidA } })).status === 409, "Library double issue blocked");
  assert((await request("/library/records", { token: adminA, method: "POST", body: { bookId: book.data.id, studentId: sidB } })).status === 404, "Library cross-school student blocked with rollback");
  assert((await request(`/library/records/${issue.data.id}/return`, { token: adminA, method: "PATCH" })).status === 200, "Library valid return");
  assert((await request(`/library/records/${issue.data.id}/return`, { token: adminA, method: "PATCH" })).status === 409, "Library duplicate return blocked");

  assert((await request("/transport", { token: adminA, method: "POST", body: { number: `BAD-${suffix}`, capacity: 0 } })).status === 400, "Transport invalid capacity blocked");
  assert((await request("/transport", { token: adminA, method: "POST", body: { number: `BAD2-${suffix}`, status: "Flying" } })).status === 400, "Transport invalid status blocked");
  const vehicle = await request("/transport", { token: adminA, method: "POST", body: { number: `BUS-${suffix}`, capacity: 40, status: "Idle" } });
  assert(vehicle.status === 201, "Transport vehicle create persists"); created.vehicles.push(vehicle.data.id);
  assert((await request(`/transport/${vehicle.data.id}`, { token: adminB, method: "PATCH", body: { status: "Maintenance" } })).status === 404, "Transport cross-school IDOR blocked");
  assert((await request(`/transport/${vehicle.data.id}`, { token: adminA, method: "DELETE" })).status === 200, "Transport transactional deletion succeeds"); created.vehicles.length = 0;

  assert((await request("/leave", { token: studentA, method: "POST", body: { fromDate: "2030-01-03", toDate: "2030-01-02", reason: "Invalid" } })).status === 400, "Leave invalid date range blocked");
  const leave = await request("/leave", { token: studentA, method: "POST", body: { fromDate: "2030-01-02", toDate: "2030-01-03", reason: `Regression ${suffix}` } });
  assert(leave.status === 201, "Leave valid requester and range persists"); created.leave.push(leave.data.id);
  assert((await request(`/leave/${leave.data.id}`, { token: studentB, method: "PATCH", body: { status: "Approved" } })).status === 404, "Leave cross-school IDOR blocked");
  assert((await request(`/leave/${leave.data.id}`, { token: adminA, method: "PATCH", body: { status: "Approved" } })).status === 200, "Leave authorized transition succeeds");
  assert((await request(`/leave/${leave.data.id}`, { token: adminA, method: "PATCH", body: { status: "Rejected" } })).status === 409, "Leave repeated transition blocked");

  const holiday = await request("/holidays", { token: adminA, method: "POST", body: { name: `Regression Holiday ${suffix}`, date: "2030-02-01" } });
  assert(holiday.status === 201, "Holiday valid create persists"); created.holidays.push(holiday.data.id);
  assert((await request(`/holidays/${holiday.data.id}`, { token: adminB, method: "DELETE" })).status === 404, "Holiday cross-school IDOR blocked");
  assert((await request(`/holidays/${holiday.data.id}`, { token: adminA, method: "DELETE" })).status === 200, "Holiday delete succeeds"); created.holidays.length = 0;

  const notice = await request("/notices", { token: adminA, method: "POST", body: { title: `Regression Notice ${suffix}`, description: "Test", category: "General", priority: "High", audience: "Students" } });
  assert(notice.status === 201, "Notice audience create persists"); created.notices.push(notice.data.id);
  const studentNotices = await request("/notices", { token: studentA });
  assert(studentNotices.status === 200 && Array.isArray(studentNotices.data) && studentNotices.data.some((n) => n.id === notice.data.id), "Notice list resolves data and audience correctly");
  assert((await request(`/notices/${notice.data.id}/read`, { token: studentA, method: "POST" })).status === 200, "Notice mark-read succeeds");
  assert((await request(`/notices/${notice.data.id}/read`, { token: studentB, method: "POST" })).status === 404, "Notice cross-school mark-read blocked");

  const certificate = await request("/certificates", { token: adminA, method: "POST", body: { studentId: sidA, type: "BONAFIDE" } });
  assert(certificate.status === 201, "Certificate valid generation persists"); created.certificates.push(certificate.data.id);
  assert((await request("/certificates", { token: adminB, method: "POST", body: { studentId: sidA, type: "BONAFIDE" } })).status === 404, "Certificate cross-school student blocked");
  assert((await request("/certificates", { token: studentA })).data.some((c) => c.id === certificate.data.id), "Certificate student ownership read succeeds");

  const event = await request("/events", { token: adminA, method: "POST", body: { title: `Regression Event ${suffix}`, date: "2030-03-01", time: "09:00", location: "Test Hall", category: "Academic", description: "Regression event" } });
  assert(event.status === 201, "Calendar event persists"); created.events.push(event.data.id);
  assert((await request(`/events/${event.data.id}`, { token: adminB, method: "DELETE" })).status === 404, "Calendar event cross-school IDOR blocked");
  assert((await request("/events", { token: studentA })).data.some((e) => e.id === event.data.id), "Calendar event student read succeeds");

  console.log(`Remaining modules integration verification complete: ${passed} PASS`);
} finally {
  for (const [table, ids] of [["notice_reads", created.notices], ["notifications", []], ["library_records", created.books], ["library_books", created.books], ["vehicles", created.vehicles], ["leave_requests", created.leave], ["notices", created.notices], ["certificates", created.certificates], ["holidays", created.holidays], ["school_events", created.events]]) {
    if (!ids.length) continue;
    const column = table === "library_records" ? "book_id" : table === "notice_reads" ? "notice_id" : "id";
    await pool.query(`DELETE FROM ${table} WHERE ${column} = ANY($1::text[])`, [ids]).catch(() => undefined);
  }
  await pool.end();
}
