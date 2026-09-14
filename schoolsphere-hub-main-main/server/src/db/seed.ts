import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { closeDatabase, db, initializeDatabase } from "./client.js";
import { FEATURE_KEYS } from "../routes/helpers.js";
import { config } from "../config.js";

const DEMO_PASSWORD = "password123";
const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

interface SchoolSeed {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  session: string;
  status: string;
  plan: string;
  billingCycle: string;
  paymentStatus: string;
  subscriptionExpiresAt: string;
}

const PLANS = [
  { name: "Basic", price: 4999, billingCycle: "MONTHLY" },
  { name: "Standard", price: 9999, billingCycle: "MONTHLY" },
  { name: "Professional", price: 19999, billingCycle: "MONTHLY" },
  { name: "Enterprise", price: 199999, billingCycle: "YEARLY" },
];

const SCHOOLS: SchoolSeed[] = [
  {
    id: "SCH-0001",
    name: "Everbright International School",
    shortName: "Everbright",
    tagline: "Nurturing Tomorrow's Leaders",
    session: "2026-2027",
    status: "ACTIVE",
    plan: "Enterprise",
    billingCycle: "YEARLY",
    paymentStatus: "PAID",
    subscriptionExpiresAt: "2027-07-31",
  },
  {
    id: "SCH-0002",
    name: "Riverside Public School",
    shortName: "Riverside",
    tagline: "Learn. Grow. Excel.",
    session: "2026-2027",
    status: "ACTIVE",
    plan: "Standard",
    billingCycle: "MONTHLY",
    paymentStatus: "PAID",
    subscriptionExpiresAt: "2026-09-05",
  },
  {
    id: "SCH-0003",
    name: "Sunrise Academy",
    shortName: "Sunrise",
    tagline: "Every Child, A Bright Future",
    session: "2026-2027",
    status: "TRIAL",
    plan: "Basic",
    billingCycle: "MONTHLY",
    paymentStatus: "PENDING",
    subscriptionExpiresAt: "2026-08-27",
  },
];

const FIRST_NAMES = ["Aarav", "Vivaan", "Aditya", "Ishaan", "Ananya", "Diya", "Myra", "Sara", "Kabir", "Reyansh", "Anika", "Riya"];
const LAST_NAMES = ["Sharma", "Verma", "Patel", "Gupta", "Singh", "Kumar", "Reddy", "Nair", "Iyer", "Rao"];
const CLASSES = ["6", "7", "8", "9", "10"];
const SECTIONS = ["A", "B"];

function randomName(seedOffset: number) {
  const first = FIRST_NAMES[(seedOffset * 7) % FIRST_NAMES.length];
  const last = LAST_NAMES[(seedOffset * 13) % LAST_NAMES.length];
  return `${first} ${last}`;
}

function seedPlans() {
  for (const p of PLANS) {
    db.prepare("INSERT INTO plans (id, name, price, billing_cycle) VALUES (?, ?, ?, ?)").run(
      randomUUID(),
      p.name,
      p.price,
      p.billingCycle,
    );
  }
}

async function seedSchool(school: SchoolSeed) {
  db.prepare(
    `INSERT INTO schools (id, name, short_name, tagline, session, status, plan, billing_cycle, payment_status, subscription_started_at, subscription_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?)`,
  ).run(
    school.id,
    school.name,
    school.shortName,
    school.tagline,
    school.session,
    school.status,
    school.plan,
    school.billingCycle,
    school.paymentStatus,
    school.subscriptionExpiresAt,
  );

  const slug = school.shortName.toLowerCase().replace(/\s+/g, "");
  const academicYearId = `${school.id}-AY-${school.session}`;
  const [startYear, endYear] = school.session.split("-");
  db.prepare(
    "INSERT INTO academic_years (id, school_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
  ).run(academicYearId, school.id, school.session, `${startYear}-04-01`, `${endYear}-03-31`);

  // Classes + subjects
  const classIds: string[] = [];
  for (const c of CLASSES) {
    for (const s of SECTIONS) {
      const id = randomUUID();
      classIds.push(id);
      db.prepare("INSERT INTO classes (id, school_id, name, section, academic_year_id) VALUES (?, ?, ?, ?, ?)").run(id, school.id, c, s, academicYearId);
    }
  }

  const subjectDefs = [
    { name: "Mathematics", code: "MAT-101", type: "Core", credits: 4, desc: "Foundational mathematics and algebra" },
    { name: "Science", code: "SCI-101", type: "Core", credits: 4, desc: "Physics, chemistry, and biology fundamentals" },
    { name: "English", code: "ENG-101", type: "Language", credits: 3, desc: "English literature and language communication" },
    { name: "Social Studies", code: "SST-101", type: "Core", credits: 3, desc: "History, civics, and geography" },
    { name: "Computer Science", code: "CSC-101", type: "Elective", credits: 3, desc: "Information technology and coding" },
    { name: "Fine Arts", code: "ART-101", type: "Elective", credits: 2, desc: "Visual and studio arts" },
    { name: "Physical Education", code: "PED-101", type: "Elective", credits: 2, desc: "Sports and health education" },
    { name: "Spanish", code: "SPA-101", type: "Language", credits: 3, desc: "Second language conversational Spanish" },
  ];
  const subjectNames = subjectDefs.map((s) => s.name);
  const subjectIds: string[] = [];
  for (const sub of subjectDefs) {
    const id = randomUUID();
    subjectIds.push(id);
    db.prepare(
      "INSERT INTO subjects (id, school_id, name, code, type, credits, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, school.id, sub.name, sub.code, sub.type, sub.credits, sub.desc);
  }

  // Teachers (+ one login user each, only the first is a demo login)
  const DESIGNATIONS = ["PGT", "TGT", "PRT", "Senior Teacher", "Subject Coordinator"];
  const teacherIds: string[] = [];
  for (let i = 0; i < 6; i++) {
    const id = randomUUID();
    teacherIds.push(id);
    const name = randomName(i + 1);
    const assignedClasses = [classIds[i % classIds.length], classIds[(i + 1) % classIds.length]];
    const assignedSubjects = [subjectIds[i % subjectIds.length]];
    db.prepare(
      `INSERT INTO teachers (id, school_id, name, department, email, phone, assigned_classes, assigned_subjects, designation, joining_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '-2 years'))`,
    ).run(
      id,
      school.id,
      name,
      subjectDefs[i % subjectDefs.length].name,
      `${slug}.teacher${i}@example.com`,
      "9000000000",
      JSON.stringify(assignedClasses),
      JSON.stringify(assignedSubjects),
      DESIGNATIONS[i % DESIGNATIONS.length],
    );
  }
  // Demo teacher (teacherIds[0]) is also the Class Teacher of their first assigned class.
  db.prepare("UPDATE classes SET class_teacher_id = ? WHERE id = ?").run(teacherIds[0], classIds[0]);

  // Seed Class-Subject-Teacher mappings (class_subjects)
  for (let cIdx = 0; cIdx < classIds.length; cIdx++) {
    const cid = classIds[cIdx];
    // Assign core subjects to each class, distributed across teachers
    for (let sIdx = 0; sIdx < Math.min(5, subjectIds.length); sIdx++) {
      const sid = subjectIds[sIdx];
      const tid = teacherIds[(cIdx + sIdx) % teacherIds.length];
      db.prepare(
        "INSERT INTO class_subjects (id, school_id, class_id, subject_id, teacher_id) VALUES (?, ?, ?, ?, ?)",
      ).run(randomUUID(), school.id, cid, sid, tid);
    }
  }

  // Fee Structures
  const defaultStructures = [
    { feeType: "Tuition Fee", amount: 15000 },
    { feeType: "Computer Lab Fee", amount: 2000 },
    { feeType: "Library & Resource Fee", amount: 1200 },
    { feeType: "Sports & Activity Fee", amount: 1500 },
    { feeType: "Examination Fee", amount: 2500 },
    { feeType: "Transport Fee", amount: 3500 },
  ];
  for (const s of defaultStructures) {
    db.prepare("INSERT INTO fee_structures (id, school_id, fee_type, amount, session) VALUES (?, ?, ?, ?, ?)").run(
      randomUUID(),
      school.id,
      s.feeType,
      s.amount,
      school.session,
    );
  }

  // Parents (created after students below need parent linkage; pre-create then link)
  const parentIds: string[] = [];
  for (let i = 0; i < 13; i++) {
    const id = randomUUID();
    parentIds.push(id);
    db.prepare("INSERT INTO parents (id, school_id, name, email, phone, linked_student_ids) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      school.id,
      randomName(i + 20),
      `${slug}.parent${i}@example.com`,
      "9111111111",
      "[]",
    );
  }

  // Students: 25 total across parents, assigned round-robin across classes
  const studentIds: string[] = [];
  let studentCounter = 0;
  for (let pIdx = 0; pIdx < parentIds.length && studentCounter < 25; pIdx++) {
    const parentId = parentIds[pIdx];
    const linked: string[] = [];
    const countForParent = studentCounter === 24 ? 1 : 2;
    for (let j = 0; j < countForParent && studentCounter < 25; j++) {
      const id = randomUUID();
      studentIds.push(id);
      linked.push(id);
      const classIdx = studentCounter % classIds.length;
      const className = CLASSES[Math.floor(classIdx / SECTIONS.length)];
      const section = SECTIONS[classIdx % SECTIONS.length];
      db.prepare(
        `INSERT INTO students (id, school_id, name, admission_no, class_id, academic_year_id, class_name, section, roll, parent_id, status, attendance, fee_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
      ).run(
        id,
        school.id,
        randomName(studentCounter + 40),
        `${school.id}-ADM-${1000 + studentCounter}`,
        classIds[classIdx],
        academicYearId,
        className,
        section,
        (studentCounter % 40) + 1,
        parentId,
        85 + (studentCounter % 15),
        studentCounter % 3 === 0 ? "Pending" : "Paid",
      );
      db.prepare(`INSERT INTO student_guardians (id, school_id, student_id, parent_id, relationship, is_primary)
        VALUES (?, ?, ?, ?, 'Guardian', 1)`).run(randomUUID(), school.id, id, parentId);
      studentCounter++;
    }
    db.prepare("UPDATE parents SET linked_student_ids = ? WHERE id = ?").run(JSON.stringify(linked), parentId);
  }

  // Staff (non-teaching)
  const departments = ["ADMIN", "ACCOUNTS", "LIBRARY", "TRANSPORT"] as const;
  const staffIds: Record<string, string> = {};
  departments.forEach((dept, i) => {
    const id = randomUUID();
    staffIds[dept] = id;
    db.prepare("INSERT INTO staff (id, school_id, name, department, email, phone) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      school.id,
      randomName(i + 60),
      dept,
      `${slug}.staff.${dept.toLowerCase()}@example.com`,
      "9222222222",
    );
  });

  // Demo login users: 1 school admin, 1 teacher, 1 staff per dept, 1 parent, 1 student
  const users: Array<[string, string, string | null, string | null, string | null, string | null, string | null, string]> = [
    [`${slug}.admin@example.com`, "SCHOOL_ADMIN", null, null, null, null, null, `${school.shortName} Admin`],
    [`${slug}.teacher@example.com`, "TEACHER", null, teacherIds[0], null, null, null, "Demo Teacher"],
    [`${slug}.staff@example.com`, "STAFF", "ADMIN", null, null, null, staffIds["ADMIN"], "Demo Staff (Admin)"],
    [`${slug}.parent@example.com`, "PARENT", null, null, parentIds[0], null, null, "Demo Parent"],
    [`${slug}.student@example.com`, "STUDENT", null, null, null, studentIds[0], null, "Demo Student"],
  ];

  for (const [email, role, department, linkedTeacherId, linkedParentId, linkedStudentId, linkedStaffId, name] of users) {
    db.prepare(
      `INSERT INTO users (id, school_id, role, department, name, email, password_hash, linked_teacher_id, linked_parent_id, linked_student_id, linked_staff_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), school.id, role, department, name, email, passwordHash, linkedTeacherId, linkedParentId, linkedStudentId, linkedStaffId);
  }

  // A little notice-board content
  db.prepare(
    `INSERT INTO notices (id, school_id, title, description, category, priority, audience, date, author)
     VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?)`,
  ).run(randomUUID(), school.id, "Welcome to the new session", `${school.name} academic session ${school.session} has begun.`, "General", "Medium", "All", "Principal");

  // Fees: one per student for all 25 students
  studentIds.forEach((sid, i) => {
    db.prepare(
      `INSERT INTO fees (id, school_id, student_id, amount, status, due_date, paid_on, fee_type)
       VALUES (?, ?, ?, ?, ?, date('now', '+15 days'), ?, 'Tuition Fee')`,
    ).run(randomUUID(), school.id, sid, 12000 + (i % 5) * 1000, i % 3 === 0 ? "Pending" : "Paid", i % 3 === 0 ? null : "date('now')");
  });

  // Exams + results: one exam per (class, term, subject) so each student gets a full
  // subject-wise mark sheet for Term 1, Term 2 and the Final exam.
  function gradeFor(marks: number): string {
    if (marks >= 90) return "A+";
    if (marks >= 80) return "A";
    if (marks >= 70) return "B+";
    if (marks >= 60) return "B";
    if (marks >= 50) return "C";
    if (marks >= 40) return "D";
    return "F";
  }

  const TERMS = [
    { name: "Term 1", offsetDays: -120 },
    { name: "Term 2", offsetDays: -30 },
    { name: "Final", offsetDays: 20 },
  ];
  // examId per (class, term, subject)
  const examIdByClassTermSubject: Record<string, string> = {};
  classIds.forEach((cid) => {
    TERMS.forEach((term) => {
      subjectNames.forEach((subject) => {
        const examId = randomUUID();
        examIdByClassTermSubject[`${cid}|${term.name}|${subject}`] = examId;
        const status = term.offsetDays <= -30 ? "Completed" : term.offsetDays < 0 ? "Completed" : "Scheduled";
        db.prepare(
          "INSERT INTO exams (id, school_id, subject, class_id, date, status, term) VALUES (?, ?, ?, ?, date('now', ?), ?, ?)",
        ).run(examId, school.id, subject, cid, `${term.offsetDays} days`, status, term.name);
      });
    });
  });
  const studentRows = await db.prepare("SELECT id, class_id FROM students WHERE school_id = ?").all(school.id) as {
    id: string;
    class_id: string;
  }[];
  studentRows.forEach((s, i) => {
    TERMS.forEach((term, ti) => {
      // Only seed results for terms that have already happened (Term 1 & Term 2); Final stays upcoming.
      if (term.offsetDays > 0) return;
      subjectNames.forEach((subject, si) => {
        const examId = examIdByClassTermSubject[`${s.class_id}|${term.name}|${subject}`];
        if (!examId) return;
        const marks = 55 + ((i * 7 + si * 11 + ti * 5) % 45);
        db.prepare(
          "INSERT INTO results (id, school_id, student_id, exam_id, marks, max_marks, grade, published_at) VALUES (?, ?, ?, ?, ?, 100, ?, datetime('now'))",
        ).run(randomUUID(), school.id, s.id, examId, marks, gradeFor(marks));
      });
    });
  });

  // Homework, one per class
  classIds.forEach((cid, i) => {
    db.prepare(
      "INSERT INTO homework (id, school_id, class_id, subject, title, description, due_date, teacher_id) VALUES (?, ?, ?, ?, ?, ?, date('now', '+5 days'), ?)",
    ).run(
      randomUUID(),
      school.id,
      cid,
      subjectNames[i % subjectNames.length],
      `Chapter ${i + 1} exercises`,
      `Complete all questions from Chapter ${i + 1} and submit your working.`,
      teacherIds[i % teacherIds.length],
    );
  });

  // Student attendance — a few recent days for the first ten students of each school.
  // academic_year_id is set at insert time (the schema backfill only touches pre-existing rows).
  const attnStatus = (n: number) => (n % 9 === 0 ? "Absent" : n % 7 === 0 ? "Late" : n % 11 === 0 ? "Leave" : "Present");
  studentRows.slice(0, 10).forEach((s, i) => {
    for (let d = 1; d <= 4; d++) {
      db.prepare(
        `INSERT INTO attendance (id, school_id, student_id, class_id, academic_year_id, date, status, marked_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, date('now', ?), ?, NULL, datetime('now'), datetime('now'))`,
      ).run(randomUUID(), school.id, s.id, s.class_id, academicYearId, `-${d} days`, attnStatus(i + d));
    }
  });

  // Teacher + staff daily attendance for the last few working days.
  for (let d = 1; d <= 4; d++) {
    teacherIds.forEach((tid, i) => {
      db.prepare(
        `INSERT INTO teacher_attendance (id, school_id, teacher_id, date, status, updated_at)
         VALUES (?, ?, ?, date('now', ?), ?, datetime('now'))`,
      ).run(randomUUID(), school.id, tid, `-${d} days`, attnStatus(i + d + 3));
    });
    Object.values(staffIds).forEach((sid, i) => {
      db.prepare(
        `INSERT INTO staff_attendance (id, school_id, staff_id, date, status, updated_at)
         VALUES (?, ?, ?, date('now', ?), ?, datetime('now'))`,
      ).run(randomUUID(), school.id, sid, `-${d} days`, attnStatus(i + d + 5));
    });
  }

  // Timetable: 3 periods/day for 2 days, per class
  classIds.slice(0, 4).forEach((cid, ci) => {
    ["Monday", "Tuesday"].forEach((day) => {
      for (let period = 1; period <= 3; period++) {
        db.prepare(
          "INSERT INTO timetable_slots (id, school_id, class_id, day, period, subject, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(randomUUID(), school.id, cid, day, period, subjectNames[(ci + period) % subjectNames.length], teacherIds[(ci + period) % teacherIds.length]);
      }
    });
  });

  // Library books + one issued record
  const bookIds: string[] = [];
  ["Wings of Fire", "The Alchemist", "A Brief History of Time", "Panchatantra Tales"].forEach((title) => {
    const id = randomUUID();
    bookIds.push(id);
    db.prepare("INSERT INTO library_books (id, school_id, title, author, status) VALUES (?, ?, ?, ?, 'Available')").run(
      id,
      school.id,
      title,
      "Various",
    );
  });
  db.prepare("INSERT INTO library_records (id, school_id, book_id, student_id, issued_on) VALUES (?, ?, ?, ?, date('now'))").run(
    randomUUID(),
    school.id,
    bookIds[0],
    studentIds[0],
  );
  db.prepare("UPDATE library_books SET status = 'Issued' WHERE id = ?").run(bookIds[0]);

  // Transport — assign the demo student to the school bus so Transport isn't empty on first login.
  const vehicleId = randomUUID();
  db.prepare(
    "INSERT INTO vehicles (id, school_id, number, route, driver, driver_phone, pickup_time, drop_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(vehicleId, school.id, `${school.id}-BUS-01`, "Route 1 - City Center", "Ramesh Yadav", "9333333333", "07:30 AM", "03:45 PM");
  db.prepare("UPDATE students SET vehicle_id = ?, pickup_point = ?, drop_point = ? WHERE id = ?").run(
    vehicleId,
    "Maple Crescent Stop",
    "School Main Gate",
    studentIds[0],
  );

  // Profile fields + a demo homework submission for the demo student.
  db.prepare(
    "UPDATE students SET email = ?, phone = ?, dob = ?, address = ?, blood_group = ?, admitted_on = date('now', '-2 years') WHERE id = ?",
  ).run(`${slug}.student@example.com`, "9444444444", "2012-04-18", "12 Willow Street, Riverdale", "O+", studentIds[0]);

  const firstHomework = await db.prepare("SELECT id FROM homework WHERE school_id = ? LIMIT 1").get(school.id) as { id: string } | undefined;
  if (firstHomework) {
    db.prepare(
      "INSERT INTO homework_submissions (id, school_id, homework_id, student_id, file_name, note, status) VALUES (?, ?, ?, ?, ?, ?, 'Submitted')",
    ).run(randomUUID(), school.id, firstHomework.id, studentIds[0], "assignment.pdf", "Completed all exercises.");
  }

  // Holidays
  const HOLIDAYS: Array<[string, string, string]> = [
    ["Independence Day", "2026-08-15", "National Holiday"],
    ["Winter Break Begins", "2026-12-20", "Vacation"],
    ["Republic Day", "2027-01-26", "National Holiday"],
  ];
  for (const [name, date, type] of HOLIDAYS) {
    db.prepare("INSERT INTO holidays (id, school_id, name, date, day, type, session) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      randomUUID(),
      school.id,
      name,
      date,
      new Date(date).toLocaleDateString("en-US", { weekday: "long" }),
      type,
      school.session,
    );
  }

  // Admissions
  db.prepare("INSERT INTO admissions (id, school_id, applicant, class_applied, applied_on, status) VALUES (?, ?, ?, ?, date('now'), 'Pending')").run(
    randomUUID(),
    school.id,
    randomName(99),
    "6",
  );
}

async function seedPlatformData() {
  // All plans start with every feature enabled.
  const planRows = await db.prepare("SELECT id FROM plans").all() as { id: string }[];
  for (const p of planRows) {
    for (const key of FEATURE_KEYS) {
      db.prepare("INSERT INTO plan_features (plan_id, feature_key, enabled) VALUES (?, ?, 1)").run(p.id, key);
    }
  }

  const schoolRows = await db.prepare("SELECT id, plan FROM schools").all() as { id: string; plan: string }[];
  for (const s of schoolRows) {
    db.prepare("INSERT INTO payments (id, school_id, amount, method, plan, paid_on) VALUES (?, ?, ?, ?, ?, date('now', '-20 days'))").run(
      randomUUID(),
      s.id,
      9999,
      "Card",
      s.plan,
    );
  }

  const LEADS: Array<[string, string, string, string, string, string]> = [
    ["Greenfield High School", "Meera Joshi", "meera@greenfield.edu", "9876543210", "Website", "NEW"],
    ["Lakeside Public School", "Arjun Rao", "arjun@lakeside.edu", "9876500000", "Referral", "CONTACTED"],
    ["St. Xavier's Academy", "Neha Kapoor", "neha@stxaviers.edu", "9812345678", "Demo Request", "DEMO_SCHEDULED"],
  ];
  for (const [schoolName, contactName, email, phone, source, status] of LEADS) {
    db.prepare(
      `INSERT INTO leads (id, school_name, contact_name, email, phone, source, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), schoolName, contactName, email, phone, source, status);
  }

  const firstSchoolId = schoolRows[0]?.id;
  if (firstSchoolId) {
    db.prepare(
      `INSERT INTO support_tickets (id, school_id, subject, message, priority, status) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), firstSchoolId, "Unable to generate fee receipts", "PDF export fails for the Fees module.", "HIGH", "OPEN");
    db.prepare(
      `INSERT INTO support_tickets (id, school_id, subject, message, priority, status) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), firstSchoolId, "Add a new academic session", "Need help rolling over to the next session.", "NORMAL", "RESOLVED");
  }

  db.prepare("INSERT INTO announcements (id, title, body, audience) VALUES (?, ?, ?, ?)").run(
    randomUUID(),
    "Scheduled maintenance this weekend",
    "The platform will be briefly unavailable for upgrades on Saturday night.",
    "ALL",
  );
}

function seedSuperAdmin() {
  db.prepare(
    `INSERT INTO users (id, school_id, role, department, name, email, password_hash)
     VALUES (?, NULL, 'SUPER_ADMIN', NULL, 'Platform Owner', 'superadmin@example.com', ?)`,
  ).run(randomUUID(), passwordHash);
}

async function main() {
  if (config.nodeEnv !== "development" && config.nodeEnv !== "test") {
    throw new Error("Seed is restricted to NODE_ENV=development or NODE_ENV=test");
  }

  await initializeDatabase();
  const existingDemo = await db.prepare("SELECT 1 FROM users WHERE email = ?").get("superadmin@example.com");
  if (existingDemo) {
    console.log("Seed already applied; no changes made.");
    await closeDatabase();
    return;
  }

  const existingFoundation = await db.prepare(
    "SELECT (SELECT COUNT(*) FROM schools) + (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM plans) AS count",
  ).get() as { count: number };
  if (existingFoundation.count > 0) {
    throw new Error("Refusing to seed a non-empty database. Existing data was not changed.");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    seedPlans();
    for (const school of SCHOOLS) await seedSchool(school);
    seedSuperAdmin();
    await seedPlatformData();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  console.log(`Seed complete. Demo password for all accounts: "${DEMO_PASSWORD}"`);
  console.log("Demo logins:");
  console.log("  superadmin@example.com (SUPER_ADMIN)");
  for (const school of SCHOOLS) {
    const slug = school.shortName.toLowerCase().replace(/\s+/g, "");
    console.log(`  ${slug}.admin@example.com (SCHOOL_ADMIN, ${school.id})`);
    console.log(`  ${slug}.teacher@example.com (TEACHER, ${school.id})`);
    console.log(`  ${slug}.staff@example.com (STAFF/ADMIN, ${school.id})`);
    console.log(`  ${slug}.parent@example.com (PARENT, ${school.id})`);
    console.log(`  ${slug}.student@example.com (STUDENT, ${school.id})`);
  }
  closeDatabase();
}

try {
  await main();
} catch (error) {
  console.error("Seed failed:", error);
  await closeDatabase();
  process.exitCode = 1;
}
