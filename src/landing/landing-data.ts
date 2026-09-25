import {
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  GraduationCap,
  HeartHandshake,
  IndianRupee,
  Presentation,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
// Content for the public marketing landing page. Kept separate from the
// components so copy can be edited without touching layout code.
import studentIcon from "@/icons/add-student-icon.png";
import attendanceIcon from "@/icons/mark-attendance-icon.png";
import feesIcon from "@/icons/pay-fees-icon.png";
import examIcon from "@/icons/exam-icon.png";
import resultIcon from "@/icons/result-icon.png";
import timetableIcon from "@/icons/time-table-icon.png";
import homeworkIcon from "@/icons/homework-icon.png";
import libraryIcon from "@/icons/library-icon.png";
import transportIcon from "@/icons/transport-icon.png";
import staffIcon from "@/icons/Add-staff-icon.png";
import leaveIcon from "@/icons/staff-leave-icon.png";
import noticeIcon from "@/icons/add-notice-icon.png";

import loginShot from "./assets/login.webp";
import adminShot from "./assets/admin-dashboard.webp";
import teacherShot from "./assets/teacher.webp";
import studentShot from "./assets/student.webp";
import attendanceShot from "./assets/attendance.webp";
import transportShot from "./assets/transport.webp";

export const BRAND = {
  name: "EduNex",
  tagline: "Smart School Management",
};

export const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "App tour", href: "#apps" },
  { label: "How it works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
];

export const SHOTS = {
  login: loginShot,
  admin: adminShot,
  teacher: teacherShot,
  student: studentShot,
  attendance: attendanceShot,
  transport: transportShot,
};

export const ROLES = [
  "Super Admin",
  "School Admin",
  "Teacher",
  "Student",
  "Parent",
  "Accountant",
  "Librarian",
  "Transport Manager",
  "Office Staff",
];

/** Icon, gradient and one-liner per role — shared by the role strip and the day timeline. */
export const ROLE_META: Record<string, { icon: LucideIcon; tone: string; text: string }> = {
  "Super Admin": { icon: ShieldCheck, tone: "from-[#6366F1] to-[#4338CA]", text: "All schools, one console" },
  "School Admin": { icon: Building2, tone: "from-[#5F9AF8] to-[#2F5FC4]", text: "Runs the whole campus" },
  Teacher: { icon: Presentation, tone: "from-[#14B8A6] to-[#0F766E]", text: "Attendance, homework, marks" },
  Student: { icon: GraduationCap, tone: "from-[#F59E0B] to-[#D97706]", text: "Timetable, results, fees" },
  Parent: { icon: HeartHandshake, tone: "from-[#EC4899] to-[#BE185D]", text: "Stays in the loop daily" },
  Accountant: { icon: IndianRupee, tone: "from-[#22C55E] to-[#15803D]", text: "Fees, receipts, payroll" },
  Librarian: { icon: BookOpen, tone: "from-[#A855F7] to-[#7E22CE]", text: "Issues, returns, fines" },
  "Transport Manager": { icon: Bus, tone: "from-[#F97316] to-[#C2410C]", text: "Routes, drivers, vehicles" },
  "Office Staff": { icon: Briefcase, tone: "from-[#0EA5E9] to-[#0369A1]", text: "Admissions & front desk" },
};

export const FEATURES = [
  {
    icon: studentIcon,
    title: "Students & Admissions",
    text: "Enquiry-to-enrolment pipeline, student profiles, documents, siblings and class allocation.",
  },
  {
    icon: attendanceIcon,
    title: "Smart Attendance",
    text: "One-tap P / A / L / Leave register per class. Parents are notified the moment it is saved.",
  },
  {
    icon: feesIcon,
    title: "Fees & Payments",
    text: "Fee structures, discounts, online payments, instant receipts and pending-dues tracking.",
  },
  {
    icon: examIcon,
    title: "Examinations",
    text: "Schedule exams, assign invigilators and publish date sheets to every class at once.",
  },
  {
    icon: resultIcon,
    title: "Results & Report Cards",
    text: "Enter marks, auto-calculate grades and share report cards with students and parents.",
  },
  {
    icon: timetableIcon,
    title: "Timetable",
    text: "Clash-free class and teacher timetables. Everyone sees today's periods on their home screen.",
  },
  {
    icon: homeworkIcon,
    title: "Homework",
    text: "Teachers post assignments with due dates; students and parents track what is pending.",
  },
  {
    icon: libraryIcon,
    title: "Library",
    text: "Book catalogue, issue and return, due dates and overdue tracking for your librarian.",
  },
  {
    icon: transportIcon,
    title: "Transport",
    text: "Vehicles, routes, drivers, bus attendance, maintenance logs and transport fees.",
  },
  {
    icon: staffIcon,
    title: "Staff & Payroll",
    text: "Teaching and non-teaching staff records, staff attendance and monthly salary processing.",
  },
  {
    icon: leaveIcon,
    title: "Leave Management",
    text: "Students, teachers and staff apply for leave in the app; approvers act in one click.",
  },
  {
    icon: noticeIcon,
    title: "Notices & Alerts",
    text: "Priority-tagged circulars, announcements and in-app notifications to the right audience.",
  },
];

export type Portal = {
  id: string;
  label: string;
  title: string;
  text: string;
  points: string[];
  image: string;
};

export const PORTALS: Portal[] = [
  {
    id: "admin",
    label: "Admin",
    title: "The whole school on one home screen",
    text: "School admins get every module one tap away — students, staff, fees, classes, exams, leave and library — plus a live notice board with priority tags.",
    points: [
      "Quick-access tiles for every department",
      "Notice board with High / Medium priority",
      "Search anything from the top bar",
    ],
    image: adminShot,
  },
  {
    id: "teacher",
    label: "Teacher",
    title: "Everything a teacher needs before the bell",
    text: "Teachers see their assigned classes, total students, homework given and today's timetable the moment they log in.",
    points: [
      "Assigned classes and student lists",
      "Post homework and enter results",
      "Apply for and approve class leave",
    ],
    image: teacherShot,
  },
  {
    id: "student",
    label: "Student & Parent",
    title: "Parents and students always in the loop",
    text: "Attendance percentage, pending homework, pending fees and unread notifications — all on one friendly dashboard.",
    points: [
      "Timetable, exams, results and holidays",
      "Pay fees online and download receipts",
      "Track the school bus and transport",
    ],
    image: studentShot,
  },
  {
    id: "attendance",
    label: "Attendance",
    title: "Mark a full class in under a minute",
    text: "A daily register with live counters for present, absent, late, leave and unmarked — built for one-thumb use on a phone.",
    points: [
      "P / A / L / Lv toggles with remarks",
      "Live present / absent summary",
      "Attendance feeds reports automatically",
    ],
    image: attendanceShot,
  },
  {
    id: "transport",
    label: "Transport",
    title: "A dedicated desk for your fleet",
    text: "Transport managers run vehicles, drivers, bus attendance, maintenance, complaints and transport fees from their own portal.",
    points: [
      "Vehicles on route at a glance",
      "Driver and attendant records",
      "Maintenance and complaint logs",
    ],
    image: transportShot,
  },
  {
    id: "login",
    label: "Secure login",
    title: "One login, the right dashboard",
    text: "Every user signs in on the same page. EduNex detects their role and opens only the modules they are allowed to use.",
    points: [
      "Role-based access for 8+ user types",
      "Each school's data stays separate",
      "Works in any browser, on any device",
    ],
    image: loginShot,
  },
];

export const ONBOARDING_STEPS = [
  {
    title: "Book a free demo",
    text: "Tell us about your school. We walk you through EduNex live and answer every question.",
  },
  {
    title: "We set up your school",
    text: "Classes, sections, subjects, fee structures and your student and staff data are imported for you.",
  },
  {
    title: "Everyone gets a login",
    text: "Admins, teachers, staff, parents and students sign in with their own ID and land on their own dashboard.",
  },
  {
    title: "Run your school daily",
    text: "Attendance, homework, fees, exams and notices flow through one app — with reports ready anytime.",
  },
];

export const DAY_FLOW = [
  {
    time: "7:30 AM",
    role: "Transport Manager",
    text: "Buses leave on their routes. Bus attendance is marked as students board.",
  },
  {
    time: "9:00 AM",
    role: "Teacher",
    text: "Class attendance is marked on the phone. Parents of absent students are notified.",
  },
  {
    time: "12:30 PM",
    role: "Teacher",
    text: "Homework is posted with a due date and shows up for every student in the class.",
  },
  {
    time: "3:00 PM",
    role: "Parent",
    text: "Pays the term fee online and downloads the receipt. Dues update instantly.",
  },
  {
    time: "5:00 PM",
    role: "School Admin",
    text: "Reviews today's attendance, fee collection and notices from a single dashboard.",
  },
];

export const FAQS = [
  {
    q: "Do I need to install anything?",
    a: "No. EduNex runs in any modern browser on phones, tablets and computers. Just open the link and log in.",
  },
  {
    q: "Who can log in to EduNex?",
    a: "Super admins, school admins, teachers, staff (accounts, library, transport, office), parents and students. Each role sees only its own dashboard and permissions.",
  },
  {
    q: "Can you import our existing student and staff data?",
    a: "Yes. During onboarding our team helps you bring in students, staff, classes and fee structures so you can start using the app from day one.",
  },
  {
    q: "Is our school's data secure?",
    a: "Every request is checked against the user's role, and each school's records are isolated from every other school on the platform.",
  },
  {
    q: "How long does the demo take?",
    a: "About 30 minutes. We tailor the walkthrough to your school's size and the modules you care about most.",
  },
];

export const STUDENT_BANDS = ["Under 300", "300 – 800", "800 – 1,500", "1,500 – 3,000", "3,000+"];

export const CONTACT_ROLES = [
  "Owner / Trustee",
  "Principal",
  "School Administrator",
  "Teacher",
  "Other",
];
