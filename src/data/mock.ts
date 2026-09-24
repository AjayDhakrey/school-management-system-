
import { SCHOOL } from "@/lib/siteData";
export { SCHOOL } from "@/lib/siteData";

export type Status = "Active" | "Inactive" | "Pending" | "Approved" | "Rejected" | "Suspended";

export const CLASSES = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
export const SECTIONS = ["A", "B", "C"];

export type Student = {
  id: string;
  name: string;
  admissionNo: string;
  className: string;
  section: string;
  roll: number;
  gender: "Male" | "Female";
  dob: string;
  bloodGroup: string;
  parent: string;
  parentId: string;
  contact: string;
  email: string;
  address: string;
  status: "Active" | "Inactive";
  attendance: number;
  feeStatus: "Paid" | "Pending" | "Overdue";
  admittedOn: string;
  house: string;
};

const firstNames = [
  "Aarav","Sofia","Liam","Ananya","Noah","Mia","Ethan","Zara","Kabir","Elena",
  "Rohan","Chloe","Ayaan","Maya","Lucas","Ishita","Daniel","Nora","Vihaan","Amara",
  "Arjun","Freya","Samuel","Priya","Oliver","Leah","Karan","Hannah","Devansh","Ruby",
];
const lastNames = [
  "Mehta","Alvarez","Bennett","Sharma","Whitfield","Kapoor","Osei","Lindqvist","Rahman","Costa",
];

function pick<T>(arr: T[], i: number) {
  return arr[i % arr.length] as T;
}

export const students: Student[] = Array.from({ length: 48 }, (_, i) => {
  const first = pick(firstNames, i * 7 + 3);
  const last = pick(lastNames, i * 3 + 1);
  const className = pick(CLASSES, i);
  const section = pick(SECTIONS, i * 2);
  return {
    id: `STU-${(1024 + i).toString()}`,
    name: `${first} ${last}`,
    admissionNo: `ADM/2025/${(310 + i).toString()}`,
    className,
    section,
    roll: (i % 24) + 1,
    gender: i % 2 === 0 ? "Male" : "Female",
    dob: `${2010 + (i % 4)}-0${(i % 9) + 1}-1${i % 9}`,
    bloodGroup: pick(["A+", "B+", "O+", "AB+", "O-"], i),
    parent: `${pick(["Rahul", "Marta", "David", "Neha", "Samuel", "Aisha"], i)} ${last}`,
    parentId: `PAR-${(200 + (i % 24)).toString()}`,
    contact: `+1 (555) 2${(100 + i).toString().padStart(3, "0")}-${( + i * 3).toString().slice(0, 4)}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@everbright.edu`,
    address: `${12 + i} ${pick(["Maple", "Cedar", "Birch", "Willow"], i)} Street, Riverdale`,
    status: i % 13 === 0 ? "Inactive" : "Active",
    attendance: 72 + ((i * 5) % 27),
    feeStatus: pick(["Paid", "Paid", "Pending", "Overdue"], i) as Student["feeStatus"],
    admittedOn: `2025-0${(i % 8) + 1}-1${i % 9}`,
    house: pick(["Ruby", "Emerald", "Sapphire", "Topaz"], i),
  };
});

export type Teacher = {
  id: string;
  name: string;
  designation: string;
  department: string;
  subjects: string[];
  classes: string[];
  email: string;
  contact: string;
  joinedOn: string;
  status: "Active" | "On Leave" | "Inactive";
  qualification: string;
  experience: string;
  type: "Teaching" | "Non-Teaching";
};

export const DEPARTMENTS = [
  "Mathematics",
  "Science",
  "Languages",
  "Humanities",
  "Computer Science",
  "Sports",
  "Administration",
];

export const teachers: Teacher[] = Array.from({ length: 24 }, (_, i) => {
  const first = pick(
    ["Helena","Marcus","Priyanka","Tobias","Grace","Adeel","Ingrid","Felix","Nadia","Omar","Clara","Victor"],
    i * 5 + 2,
  );
  const last = pick(lastNames, i * 7 + 4);
  const nonTeaching = i > 18;
  return {
    id: `EMP-${(4100 + i).toString()}`,
    name: `${first} ${last}`,
    designation: nonTeaching
      ? pick(["Accountant", "Librarian", "Lab Assistant", "Office Executive", "Transport Manager"], i)
      : pick(["Senior Teacher", "Class Teacher", "Head of Department", "Assistant Teacher"], i),
    department: nonTeaching ? "Administration" : pick(DEPARTMENTS, i),
    subjects: nonTeaching ? [] : [pick(["Mathematics", "Physics", "English", "History", "Biology", "Computer Science"], i)],
    classes: nonTeaching ? [] : [`${pick(CLASSES, i)} ${pick(SECTIONS, i)}`, `${pick(CLASSES, i + 1)} ${pick(SECTIONS, i + 1)}`],
    email: `${first.toLowerCase()}.${last.toLowerCase()}@everbright.edu`,
    contact: `+1 (555) 3${(200 + i).toString().padStart(3, "0")}-${(2200 + i * 7).toString().slice(0, 4)}`,
    joinedOn: `20${16 + (i % 9)}-0${(i % 9) + 1}-0${(i % 8) + 1}`,
    status: i % 9 === 0 ? "On Leave" : i % 17 === 0 ? "Inactive" : "Active",
    qualification: pick(["M.Sc, B.Ed", "M.A, B.Ed", "Ph.D", "B.Tech, M.Ed"], i),
    experience: `${3 + (i % 15)} years`,
    type: nonTeaching ? "Non-Teaching" : "Teaching",
  };
});

export type Parent = {
  id: string;
  name: string;
  relation: "Father" | "Mother" | "Guardian";
  occupation: string;
  email: string;
  contact: string;
  address: string;
  children: string[];
  status: "Active" | "Inactive";
};

export const parents: Parent[] = Array.from({ length: 24 }, (_, i) => {
  const kid = students[i * 2]!;
  const kid2 = students[i * 2 + 1]!;
  return {
    id: `PAR-${(200 + i).toString()}`,
    name: kid.parent,
    relation: i % 3 === 0 ? "Mother" : i % 7 === 0 ? "Guardian" : "Father",
    occupation: pick(["Architect", "Doctor", "Engineer", "Entrepreneur", "Professor", "Designer"], i),
    email: `parent${200 + i}@mail.com`,
    contact: kid.contact,
    address: kid.address,
    children: i % 4 === 0 ? [kid.id, kid2.id] : [kid.id],
    status: i % 11 === 0 ? "Inactive" : "Active",
  };
});

export type ClassRoom = {
  id: string;
  name: string;
  sections: string[];
  classTeacher: string;
  students: number;
  capacity: number;
  room: string;
  academicYear: string;
};

export const classes: ClassRoom[] = CLASSES.flatMap((c, i) =>
  [0].map(() => ({
    id: `CLS-${i + 1}`,
    name: c,
    sections: SECTIONS,
    classTeacher: teachers[i]!.name,
    students: 62 + i * 9,
    capacity: 90,
    room: `Block ${pick(["A", "B", "C"], i)} · Room ${101 + i * 4}`,
    academicYear: SCHOOL.session,
  })),
);

export type Subject = {
  id: string;
  name: string;
  code: string;
  className: string;
  teacher: string;
  type: "Core" | "Elective" | "Language";
  credits: number;
  status: "Active" | "Inactive";
};

export const SUBJECT_NAMES = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Geography",
  "Computer Science",
  "Physical Education",
  "Art & Design",
];

export const subjects: Subject[] = SUBJECT_NAMES.flatMap((name, i) =>
  CLASSES.slice(0, 3).map((c, j) => ({
    id: `SUB-${i}${j}`,
    name,
    code: `${name.slice(0, 3).toUpperCase()}-${100 + i * 10 + j}`,
    className: c,
    teacher: teachers[(i + j) % 18]!.name,
    type: (i < 5 ? "Core" : i < 8 ? "Elective" : "Language") as Subject["type"],
    credits: 3 + ((i + j) % 3),
    status: (i * j) % 17 === 5 ? "Inactive" : "Active",
  })),
);

// Attendance is fully database-driven (Step 6) — no mock attendance rows.

export type Payment = {
  id: string;
  student: string;
  studentId: string;
  className: string;
  term: string;
  amount: number;
  paid: number;
  method: "Card" | "Bank Transfer" | "Cash" | "UPI";
  date: string;
  dueDate: string;
  status: "Paid" | "Pending" | "Overdue" | "Partial";
};

export const payments: Payment[] = students.slice(0, 30).map((s, i) => {
  const amount = 1200 + (i % 5) * 250;
  const status = pick(["Paid", "Paid", "Pending", "Overdue", "Partial"], i) as Payment["status"];
  return {
    id: `INV-2026-${(500 + i).toString()}`,
    student: s.name,
    studentId: s.id,
    className: `${s.className} ${s.section}`,
    term: pick(["Term I", "Term II", "Term III"], i),
    amount,
    paid: status === "Paid" ? amount : status === "Partial" ? Math.round(amount * 0.6) : 0,
    method: pick(["Card", "Bank Transfer", "Cash", "UPI"], i) as Payment["method"],
    date: `2026-0${(i % 8) + 1}-${(10 + (i % 18)).toString()}`,
    dueDate: `2026-0${(i % 8) + 2}-05`,
    status,
  };
});

export const feeBreakdown = [
  { head: "Tuition Fee", amount: 820 },
  { head: "Laboratory Fee", amount: 140 },
  { head: "Library Fee", amount: 60 },
  { head: "Transport Fee", amount: 180 },
  { head: "Sports & Activities", amount: 90 },
  { head: "Examination Fee", amount: 110 },
];

export type Exam = {
  id: string;
  name: string;
  type: "Unit Test" | "Mid Term" | "Final Term" | "Practical";
  className: string;
  subject: string;
  date: string;
  start: string;
  end: string;
  room: string;
  maxMarks: number;
  passMarks: number;
  status: "Scheduled" | "Ongoing" | "Completed";
};

export const exams: Exam[] = Array.from({ length: 18 }, (_, i) => ({
  id: `EXM-${(90 + i).toString()}`,
  name: pick(["Mid Term Assessment", "Unit Test II", "Final Term Examination", "Practical Assessment"], i),
  type: pick(["Unit Test", "Mid Term", "Final Term", "Practical"], i) as Exam["type"],
  className: pick(CLASSES, i),
  subject: pick(SUBJECT_NAMES, i),
  date: `2026-0${(i % 8) + 1}-${(8 + (i % 20)).toString().padStart(2, "0")}`,
  start: pick(["09:00 AM", "10:30 AM", "01:00 PM"], i),
  end: pick(["11:00 AM", "12:30 PM", "03:00 PM"], i),
  room: `Hall ${pick(["A", "B", "C"], i)}-${2 + (i % 5)}`,
  maxMarks: 100,
  passMarks: 35,
  status: pick(["Scheduled", "Ongoing", "Completed", "Scheduled"], i) as Exam["status"],
}));

export type Result = {
  studentId: string;
  student: string;
  className: string;
  section: string;
  exam: string;
  total: number;
  obtained: number;
  percentage: number;
  grade: string;
  rank: number;
  status: "Pass" | "Fail";
};

export function gradeFor(pct: number) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 35) return "D";
  return "F";
}

export const results: Result[] = students.slice(0, 32).map((s, i) => {
  const total = 600;
  const obtained = 210 + ((i * 37) % 360);
  const percentage = Math.round((obtained / total) * 1000) / 10;
  return {
    studentId: s.id,
    student: s.name,
    className: s.className,
    section: s.section,
    exam: pick(["Mid Term Assessment", "Unit Test II", "Final Term Examination"], i),
    total,
    obtained,
    percentage,
    grade: gradeFor(percentage),
    rank: (i % 20) + 1,
    status: percentage >= 35 ? "Pass" : "Fail",
  };
});

export const reportCardSubjects = [
  { subject: "Mathematics", max: 100, pass: 35, obtained: 92 },
  { subject: "Physics", max: 100, pass: 35, obtained: 86 },
  { subject: "Chemistry", max: 100, pass: 35, obtained: 78 },
  { subject: "English", max: 100, pass: 35, obtained: 88 },
  { subject: "History", max: 100, pass: 35, obtained: 74 },
  { subject: "Computer Science", max: 100, pass: 35, obtained: 95 },
];

export const PERIODS = [
  { period: 1, time: "08:15 – 09:00" },
  { period: 2, time: "09:05 – 09:50" },
  { period: 3, time: "09:55 – 10:40" },
  { period: 4, time: "11:00 – 11:45" },
  { period: 5, time: "11:50 – 12:35" },
  { period: 6, time: "01:15 – 02:00" },
  { period: 7, time: "02:05 – 02:50" },
];

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Slot = { subject: string; teacher: string; room: string };

export const timetable: Record<string, Slot[]> = Object.fromEntries(
  DAYS.map((d, di) => [
    d,
    PERIODS.map((p, pi) => {
      const idx = di * 3 + pi;
      if (pi === 3 && di % 2 === 0) return { subject: "Break", teacher: "—", room: "—" };
      return {
        subject: pick(SUBJECT_NAMES, idx),
        teacher: teachers[idx % 18]!.name,
        room: `R-${201 + (idx % 12)}`,
      };
    }),
  ]),
);

export type Homework = {
  id: string;
  title: string;
  subject: string;
  className: string;
  section: string;
  teacher: string;
  assigned: string;
  due: string;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "Submitted" | "Graded" | "Late";
  description: string;
  attachment: string;
  marks?: string | undefined;
  feedback?: string | undefined;
};

export const homework: Homework[] = Array.from({ length: 14 }, (_, i) => ({
  id: `HW-${(320 + i).toString()}`,
  title: pick(
    [
      "Quadratic Equations Worksheet",
      "Photosynthesis Lab Report",
      "Essay: The Industrial Revolution",
      "Periodic Table Assignment",
      "Python Loops Practice Set",
      "Map Work: Rivers of Asia",
      "Poetry Analysis — Frost",
    ],
    i,
  ),
  subject: pick(SUBJECT_NAMES, i),
  className: pick(CLASSES, i),
  section: pick(SECTIONS, i),
  teacher: teachers[i % 18]!.name,
  assigned: `2026-08-${(2 + (i % 9)).toString().padStart(2, "0")}`,
  due: `2026-08-${(12 + (i % 14)).toString().padStart(2, "0")}`,
  priority: pick(["High", "Medium", "Low"], i) as Homework["priority"],
  status: pick(["Pending", "Submitted", "Graded", "Late"], i) as Homework["status"],
  description:
    "Complete all listed exercises in your notebook, show every step of your working, and submit a scanned copy before the due date.",
  attachment: pick(["worksheet-04.pdf", "lab-template.docx", "reading-list.pdf"], i),
  marks: i % 4 === 2 ? `${14 + (i % 6)}/20` : undefined,
  feedback: i % 4 === 2 ? "Neat presentation. Watch the sign errors in step 3." : undefined,
}));

export type Notice = {
  id: string;
  title: string;
  description: string;
  date: string;
  priority: "High" | "Medium" | "Low";
  category: "Event" | "Examination" | "Holiday" | "General" | "Meeting";
  author: string;
  read: boolean;
};

export const notices: Notice[] = [
  {
    id: "NTC-01",
    title: "Annual Sports Day 2026",
    description:
      "Track & field events begin at 8:00 AM on the main ground. Students must report in house uniform.",
    date: "2026-08-18",
    priority: "High",
    category: "Event",
    author: "Sports Department",
    read: false,
  },
  {
    id: "NTC-02",
    title: "Parent Teacher Meeting",
    description: "Grade 6–10 parents are invited for the term review from 9:30 AM to 1:00 PM.",
    date: "2026-08-22",
    priority: "High",
    category: "Meeting",
    author: "Academic Office",
    read: false,
  },
  {
    id: "NTC-03",
    title: "Mid Term Examination Schedule",
    description: "The detailed datesheet for all grades has been published on the notice board.",
    date: "2026-08-25",
    priority: "Medium",
    category: "Examination",
    author: "Examination Cell",
    read: true,
  },
  {
    id: "NTC-04",
    title: "Independence Day Celebration",
    description: "Flag hoisting at 7:45 AM followed by cultural performances in the auditorium.",
    date: "2026-08-15",
    priority: "Medium",
    category: "Event",
    author: "Cultural Committee",
    read: true,
  },
  {
    id: "NTC-05",
    title: "Library Membership Renewal",
    description: "All students must renew their library cards before the end of this month.",
    date: "2026-08-10",
    priority: "Low",
    category: "General",
    author: "Library",
    read: true,
  },
  {
    id: "NTC-06",
    title: "Mid Term Break",
    description: "School remains closed from 1 September to 5 September for the autumn break.",
    date: "2026-09-01",
    priority: "Low",
    category: "Holiday",
    author: "Principal's Office",
    read: false,
  },
];

export type SchoolEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  category: "Sports" | "Academic" | "Meeting" | "Holiday" | "Cultural";
  description: string;
};

export const events: SchoolEvent[] = [
  {
    id: "EVT-1",
    title: "Annual Sports Day",
    date: "2026-08-18",
    time: "08:00 AM – 02:00 PM",
    location: "Main Ground",
    category: "Sports",
    description: "Inter-house athletics meet with track, field and relay events for all grades.",
  },
  {
    id: "EVT-2",
    title: "Parent Teacher Meeting",
    date: "2026-08-22",
    time: "09:30 AM – 01:00 PM",
    location: "Respective Classrooms",
    category: "Meeting",
    description: "Term progress discussion with class teachers and subject faculty.",
  },
  {
    id: "EVT-3",
    title: "Mathematics Examination",
    date: "2026-08-12",
    time: "09:00 AM – 11:00 AM",
    location: "Examination Hall A",
    category: "Academic",
    description: "Mid term mathematics paper for Grades 8 to 10.",
  },
  {
    id: "EVT-4",
    title: "Independence Day",
    date: "2026-08-15",
    time: "07:45 AM",
    location: "Assembly Quadrangle",
    category: "Holiday",
    description: "Flag hoisting ceremony followed by patriotic cultural performances.",
  },
  {
    id: "EVT-5",
    title: "Staff Meeting",
    date: "2026-08-27",
    time: "03:30 PM – 05:00 PM",
    location: "Conference Room",
    category: "Meeting",
    description: "Faculty review of term assessment outcomes and upcoming calendar.",
  },
  {
    id: "EVT-6",
    title: "Annual Function Rehearsal",
    date: "2026-08-29",
    time: "11:00 AM – 01:00 PM",
    location: "Auditorium",
    category: "Cultural",
    description: "Full dress rehearsal for the annual day production.",
  },
];

export type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  total: number;
  available: number;
  shelf: string;
  issuedTo?: string | undefined;
  dueDate?: string | undefined;
};

const bookSeed: [string, string, string][] = [
  ["The Silent Atlas", "M. Halloran", "Fiction"],
  ["Foundations of Algebra", "R. Nakamura", "Mathematics"],
  ["Living Systems", "P. Oduya", "Science"],
  ["A Short History of Empires", "L. Fernandes", "History"],
  ["Introduction to Python", "S. Kaur", "Computer Science"],
  ["Poems for the Restless", "T. Bergman", "Literature"],
  ["World Atlas 2026", "Cartogram Press", "Geography"],
  ["Chemistry in Everyday Life", "N. Haddad", "Science"],
  ["The Grammar Companion", "E. Whitfield", "Languages"],
  ["Sports Science Basics", "D. Oyelaran", "Physical Education"],
  ["Art Through the Ages", "C. Bellini", "Art"],
  ["Data Structures Simplified", "A. Rahman", "Computer Science"],
];

export const books: Book[] = bookSeed.map(([title, author, category], i) => ({
  id: `BK-${(700 + i).toString()}`,
  title,
  author,
  isbn: `978-3-16-${(148410 + i * 7).toString()}-0`,
  category,
  total: 8 + (i % 10),
  available: i % 5 === 0 ? 0 : 2 + (i % 6),
  shelf: `${pick(["A", "B", "C", "D"], i)}-${10 + i}`,
  issuedTo: i % 3 === 0 ? students[i]!.name : undefined,
  dueDate: i % 3 === 0 ? `2026-08-${(15 + (i % 12)).toString()}` : undefined,
}));

export type Vehicle = {
  id: string;
  number: string;
  route: string;
  driver: string;
  driverContact: string;
  capacity: number;
  occupied: number;
  status: "On Route" | "Idle" | "Maintenance";
  stops: { name: string; time: string }[];
};

export const vehicles: Vehicle[] = Array.from({ length: 6 }, (_, i) => ({
  id: `VEH-${(30 + i).toString()}`,
  number: `SPR-${1200 + i * 11}`,
  route: `Route ${i + 1} · ${pick(["Riverdale", "North Hills", "Elm Park", "Lakeside", "Old Town", "Green Valley"], i)}`,
  driver: pick(["Victor Blake", "Samir Haque", "Tom Ellery", "Grace Mumo", "Ivan Petrov", "Leo Barros"], i),
  driverContact: `+1 (555) 7${(100 + i).toString()}-88${i}0`,
  capacity: 40 + i * 2,
  occupied: 22 + i * 3,
  status: pick(["On Route", "Idle", "Maintenance"], i) as Vehicle["status"],
  stops: [
    { name: "School Campus", time: "06:50 AM" },
    { name: `${pick(["Maple", "Cedar", "Birch"], i)} Junction`, time: "07:05 AM" },
    { name: `${pick(["Lakeview", "Hill Road", "Market Square"], i)}`, time: "07:20 AM" },
    { name: `${pick(["Riverside Gate", "Central Park", "Old Mill"], i)}`, time: "07:35 AM" },
    { name: "School Campus (Arrival)", time: "08:00 AM" },
  ],
}));

export type LeaveRequest = {
  id: string;
  person: string;
  role: "Student" | "Teacher" | "Staff";
  type: "Sick Leave" | "Casual Leave" | "Earned Leave" | "Emergency";
  from: string;
  to: string;
  days: number;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  appliedOn: string;
};

export const leaves: LeaveRequest[] = Array.from({ length: 16 }, (_, i) => ({
  id: `LV-${(150 + i).toString()}`,
  person: i % 3 === 0 ? teachers[i % 18]!.name : students[i * 2]!.name,
  role: (i % 3 === 0 ? "Teacher" : i % 5 === 0 ? "Staff" : "Student") as LeaveRequest["role"],
  type: pick(["Sick Leave", "Casual Leave", "Earned Leave", "Emergency"], i) as LeaveRequest["type"],
  from: `2026-08-${(4 + (i % 20)).toString().padStart(2, "0")}`,
  to: `2026-08-${(6 + (i % 20)).toString().padStart(2, "0")}`,
  days: 1 + (i % 4),
  reason: pick(
    [
      "Recovering from seasonal fever, advised rest by physician.",
      "Attending a family wedding out of town.",
      "Medical check-up scheduled at city hospital.",
      "Personal emergency at home.",
    ],
    i,
  ),
  status: pick(["Pending", "Approved", "Rejected", "Approved"], i) as LeaveRequest["status"],
  appliedOn: `2026-08-${(1 + (i % 10)).toString().padStart(2, "0")}`,
}));

export type Admission = {
  id: string;
  applicant: string;
  parent: string;
  classApplied: string;
  appliedOn: string;
  contact: string;
  email: string;
  previousSchool: string;
  status: "New" | "Pending" | "Approved" | "Rejected";
  documents: { name: string; status: "Verified" | "Pending" | "Missing" }[];
};

export const admissions: Admission[] = Array.from({ length: 18 }, (_, i) => ({
  id: `APP-${(900 + i).toString()}`,
  applicant: `${pick(firstNames, i * 3)} ${pick(lastNames, i * 5)}`,
  parent: `${pick(["Rahul", "Marta", "David", "Neha", "Samuel", "Aisha"], i)} ${pick(lastNames, i * 5)}`,
  classApplied: pick(CLASSES, i),
  appliedOn: `2026-07-${(3 + (i % 25)).toString().padStart(2, "0")}`,
  contact: `+1 (555) 9${(100 + i).toString()}-33${i}1`,
  email: `applicant${900 + i}@mail.com`,
  previousSchool: pick(["Northgate Public School", "St. Aloysius", "Greenfield Academy", "Home Schooled"], i),
  status: pick(["New", "Pending", "Approved", "Rejected"], i) as Admission["status"],
  documents: [
    { name: "Birth Certificate", status: "Verified" },
    { name: "Previous Report Card", status: i % 3 === 0 ? "Pending" : "Verified" },
    { name: "Transfer Certificate", status: i % 4 === 0 ? "Missing" : "Verified" },
    { name: "Passport Photograph", status: "Verified" },
  ],
}));

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  category: "Attendance" | "Fees" | "Results" | "Homework" | "Exams" | "Events" | "Notices";
  time: string;
  read: boolean;
};

export const notifications: AppNotification[] = [
  { id: "N1", title: "Attendance marked", body: "Grade 9 A attendance submitted by Marcus Alvarez.", category: "Attendance", time: "8 min ago", read: false },
  { id: "N2", title: "Fee payment received", body: "INV-2026-514 · ₹1,450 paid by card.", category: "Fees", time: "42 min ago", read: false },
  { id: "N3", title: "Results published", body: "Mid Term Assessment results are now available for Grade 10.", category: "Results", time: "2 hours ago", read: false },
  { id: "N4", title: "New homework assigned", body: "Physics — Motion & Forces worksheet due 18 Aug.", category: "Homework", time: "5 hours ago", read: true },
  { id: "N5", title: "Exam schedule updated", body: "Chemistry practical moved to Hall B-3.", category: "Exams", time: "Yesterday", read: true },
  { id: "N6", title: "Event reminder", body: "Annual Sports Day rehearsal at 3:30 PM today.", category: "Events", time: "Yesterday", read: true },
  { id: "N7", title: "New notice published", body: "Library membership renewal window opens today.", category: "Notices", time: "2 days ago", read: true },
];

export const recentAdmissions = admissions.slice(0, 5);

export const recentActivities = [
  { id: "A1", text: "Nadia Rahman marked attendance for Grade 8 B", time: "10 min ago", type: "Attendance" },
  { id: "A2", text: "Invoice INV-2026-521 generated for Aarav Mehta", time: "35 min ago", type: "Fees" },
  { id: "A3", text: "New admission application received for Grade 6", time: "1 hour ago", type: "Admission" },
  { id: "A4", text: "Mid Term datesheet published by Examination Cell", time: "3 hours ago", type: "Exam" },
  { id: "A5", text: "Library issued 'Foundations of Algebra' to Mia Bennett", time: "5 hours ago", type: "Library" },
];

export const users = teachers.slice(0, 12).map((t, i) => ({
  id: `USR-${(60 + i).toString()}`,
  name: t.name,
  email: t.email,
  role: pick(
    ["Super Admin", "School Admin", "Teacher", "Accountant", "Librarian", "Transport Manager"],
    i,
  ),
  lastActive: pick(["2 min ago", "1 hour ago", "Yesterday", "3 days ago"], i),
  status: (i % 7 === 0 ? "Suspended" : "Active") as "Active" | "Suspended",
}));

export const permissionMatrix = [
  { module: "Students", view: true, create: true, edit: true, remove: false },
  { module: "Attendance", view: true, create: true, edit: true, remove: false },
  { module: "Fees & Finance", view: true, create: false, edit: false, remove: false },
  { module: "Examinations", view: true, create: true, edit: false, remove: false },
  { module: "Library", view: true, create: false, edit: false, remove: false },
  { module: "Transport", view: true, create: false, edit: false, remove: false },
  { module: "Reports", view: true, create: false, edit: false, remove: false },
  { module: "Settings", view: false, create: false, edit: false, remove: false },
];

export const stats = {
  students: students.length * 27,
  teachers: 86,
  staff: 42,
  classes: 32,
  pendingAdmissions: admissions.filter((a) => a.status === "Pending" || a.status === "New").length,
};
