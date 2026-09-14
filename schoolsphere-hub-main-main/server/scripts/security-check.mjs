import jwt from "jsonwebtoken";

const base = process.env.SECURITY_TEST_API_URL ?? "http://localhost:43128/api";
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function containsSensitiveKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    ["password", "password_hash", "passwordHash"].includes(key) || containsSensitiveKey(child),
  );
}

const accounts = {
  superAdmin: "superadmin@example.com",
  schoolA: "everbright.admin@example.com",
  schoolB: "riverside.admin@example.com",
  teacher: "everbright.teacher@example.com",
  staff: "everbright.staff@example.com",
  parent: "everbright.parent@example.com",
  student: "everbright.student@example.com",
};

async function login(email, password = "password123") {
  return request("/auth/login", { method: "POST", body: { email, password } });
}

const sessions = {};
for (const [role, email] of Object.entries(accounts)) {
  const response = await login(email);
  assert(response.status === 200 && typeof response.data?.token === "string", `${role} valid login`);
  assert(!containsSensitiveKey(response.data), `${role} login response excludes password fields`);
  sessions[role] = response.data;
}

const badPassword = await login(accounts.schoolA, "definitely-wrong");
const unknownUser = await login("unknown-user@example.com", "definitely-wrong");
assert(badPassword.status === 401 && unknownUser.status === 401, "invalid and unknown credentials return 401");
assert(JSON.stringify(badPassword.data) === JSON.stringify(unknownUser.data), "credential failures use the same generic response");
assert((await request("/students")).status === 401, "missing token is rejected");
assert((await request("/students", { token: "not-a-jwt" })).status === 401, "invalid token is rejected");

const expiredToken = jwt.sign({ id: sessions.schoolA.user.id }, secret, {
  algorithm: "HS256",
  expiresIn: -1,
  issuer: "schoolsphere-api",
  audience: "schoolsphere-web",
});
assert((await request("/students", { token: expiredToken })).status === 401, "expired token is rejected");

assert((await request("/schools", { token: sessions.superAdmin.token })).status === 200, "Super Admin reaches platform route");
assert((await request("/students", { token: sessions.superAdmin.token })).status === 403, "Super Admin is not treated as a school user");
assert((await request("/students", { token: sessions.teacher.token })).status === 200, "Teacher receives authorized student scope");
assert((await request("/students", { token: sessions.staff.token })).status === 200, "Admin-department Staff receives authorized scope");
assert((await request("/students", { token: sessions.parent.token })).status === 200, "Parent receives authorized child scope");
assert((await request("/students", { token: sessions.student.token })).status === 403, "Student cannot list school students");
assert((await request("/students/me", { token: sessions.student.token })).status === 200, "Student can read own profile");
assert((await request("/students", { token: sessions.teacher.token, method: "POST", body: { name: "Denied" } })).status === 403, "Teacher cannot create students");

const listA = await request("/students", { token: sessions.schoolA.token });
const listB = await request("/students", { token: sessions.schoolB.token });
assert(listA.status === 200 && listA.data.length > 0, "School A admin reads School A resources");
assert(listB.status === 200 && listB.data.length > 0, "School B admin reads School B resources");
const studentA = listA.data[0];
const studentB = listB.data[0];
assert((await request(`/students/${studentB.id}`, { token: sessions.schoolA.token })).status === 404, "School A cannot GET School B resource");
assert((await request(`/students/${studentA.id}`, { token: sessions.schoolB.token })).status === 404, "School B cannot GET School A resource");
assert((await request(`/students/${studentB.id}`, { token: sessions.schoolA.token, method: "PATCH", body: { name: "Blocked" } })).status === 404, "School A cannot PATCH School B resource");
assert((await request(`/students/${studentB.id}`, { token: sessions.schoolA.token, method: "DELETE" })).status === 404, "School A cannot DELETE School B resource");

const parentsB = await request("/parents", { token: sessions.schoolB.token });
assert(parentsB.status === 200 && parentsB.data.length > 0, "School B parent fixture is available");
assert((await request("/students", {
  token: sessions.schoolA.token,
  method: "POST",
  body: { name: "Cross Tenant Attempt", parentId: parentsB.data[0].id },
})).status === 400, "School A cannot POST a relationship to School B");

const created = await request("/students", { token: sessions.schoolA.token, method: "POST", body: { name: "Security Test Student" } });
assert(created.status === 201, "School A can POST its own resource");
assert((await request(`/students/${created.data.id}`, { token: sessions.schoolA.token, method: "PATCH", body: { name: "Security Test Updated" } })).status === 200, "School A can PATCH its own resource");
assert((await request(`/students/${created.data.id}`, { token: sessions.schoolA.token, method: "DELETE" })).status === 200, "School A can DELETE its own resource");

const createdUser = await request("/users", {
  token: sessions.schoolA.token,
  method: "POST",
  body: { role: "SCHOOL_ADMIN", name: "Session Test Admin", email: "session-test-admin@example.com", password: "TemporaryPass123!" },
});
assert(createdUser.status === 201, "School Admin can create a hashed login account");
const createdSession = await login("session-test-admin@example.com", "TemporaryPass123!");
assert(createdSession.status === 200 && !containsSensitiveKey(createdSession.data), "new account authenticates without hash exposure");
assert((await request(`/users/${createdUser.data.id}`, { token: sessions.schoolA.token, method: "PATCH", body: { status: "SUSPENDED" } })).status === 200, "account can be suspended");
assert((await request("/auth/me", { token: createdSession.data.token })).status === 401, "suspended account token is immediately invalidated");
assert((await request(`/users/${createdUser.data.id}`, { token: sessions.schoolA.token, method: "DELETE" })).status === 200, "temporary security-test account removed");

const me = await request("/auth/me", { token: sessions.schoolA.token });
assert(me.status === 200 && me.data.user.name && me.data.user.email, "session refresh returns safe current user context");
assert(!containsSensitiveKey(me.data), "current-user response excludes password fields");

const audit = await request("/audit", { token: sessions.superAdmin.token });
assert(audit.status === 200 && audit.data.some((row) => row.action === "auth.login_succeeded"), "security-important authentication events are audited");

console.log("Security integration verification complete.");
