import addStudentIcon from "../icons/add-student-icon.png";
import addStaffIcon from "../icons/Add-staff-icon.png";
import addFeesIcon from "../icons/Add-fees-icon.png";
import addSubjectIcon from "../icons/add-subject-icon.png";
import addClassIcon from "../icons/add-class-icon.png";
import markAttendanceIcon from "../icons/mark-attendance-icon.png";
import staffLeaveIcon from "../icons/staff-leave-icon.png";
import libraryIcon from "../icons/library-icon.png";
import examIcon from "../icons/exam-icon.png";

export const SCHOOL = {
  name: "Edunex public school",
  shortName: "Edunex",
  tagline: "Learn • Lead • Inspire",
  session: "2026 – 2027",
  address: "42 Maple Crescent, Riverdale, Springfield 62704",
  phone: "+1 (555) 240-7788",
  email: "office@everbright.edu",
  principal: "Dr. Helena Marsh",
};

export const SITE_METADATA = {
  titleDefault: "Everbright School ERP",
  titleTemplate: "%s — Everbright School ERP",
  description:
    "Everbright International School management dashboard with quick actions, academic calendar, notice board and daily school activity.",
  authorName: SCHOOL.name,
  favicon: "/favicon.ico",
  erpShortName: "Everbright ERP",
};

export const SOCIAL_LINKS: { label: string; href: string }[] = [];

export type QuickActionAsset = {
  label: string;
  icon: string;
  to: string;
  tone: "gold" | "navy" | "info";
};

export const QUICK_ACTION_ASSETS: QuickActionAsset[] = [
  { label: "Students", icon: addStudentIcon, to: "/students", tone: "navy" },
  { label: "Staff", icon: addStaffIcon, to: "/teaching-staff", tone: "info" },
  { label: "Fees", icon: addFeesIcon, to: "/fees/collection", tone: "gold" },
  { label: "Subjects", icon: addSubjectIcon, to: "/subjects", tone: "navy" },
  { label: "Classes", icon: addClassIcon, to: "/classes", tone: "navy" },
  { label: "Attendance", icon: markAttendanceIcon, to: "/attendance", tone: "gold" },
  { label: "Examinations", icon: examIcon, to: "/examinations", tone: "gold" },
  { label: "Leave", icon: staffLeaveIcon, to: "/leave/teachers", tone: "info" },
  { label: "Library", icon: libraryIcon, to: "/library", tone: "info" },
];
