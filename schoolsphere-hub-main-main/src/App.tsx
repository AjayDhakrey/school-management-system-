import { useState, type ReactElement } from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "@/lib/app-context";
import { AuthProvider, useAuth, DASHBOARD_PATH_FOR_ROLE } from "@/lib/auth-context";
import { ParentChildProvider } from "@/lib/parent-child-context";
import { RequireRole } from "@/components/auth/RequireRole";
import { Navigate } from "react-router-dom";
import { ROUTE_ROLES } from "@/lib/navigation";
import { ROLES } from "@/lib/app-context";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/pages/ErrorFallback";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import StudentsPage from "@/pages/StudentsPage";
import StudentProfile from "@/pages/StudentProfile";
import SubjectsPage from "@/pages/SubjectsPage";
import NotFound from "@/pages/NotFound";

import Admissions from "@/app/admissions";
import Attendance from "@/app/attendance";
import Classes from "@/app/classes";
import Events from "@/app/events";
import Examinations from "@/app/examinations";
import Fees from "@/app/fees";
import Homework from "@/app/homework";
import Leave from "@/app/leave";
import Library from "@/app/library";
import Notices from "@/app/notices";
import Announcements from "@/app/announcements";
import Notifications from "@/app/notifications";
import Parents from "@/app/parents";
import Reports from "@/app/reports";
import Results from "@/app/results";
import RolesPage from "@/app/roles";
import SettingsPage from "@/app/settings";
import Teachers from "@/app/teachers";
import Certificates from "@/app/certificates";
import Timetable from "@/app/timetable";
import Transport from "@/app/transport";
import Users from "@/app/users";
import Profile from "@/app/profile";
import MySubjects from "@/app/my-subjects";
import MyLeave from "@/app/my-leave";
import Holidays from "@/app/holidays";
import MyFees from "@/app/my-fees";
import TeacherProfile from "@/app/teacher/profile";
import TeacherClasses from "@/app/teacher/classes";
import TeacherStudents from "@/app/teacher/students";
import TeacherSubjects from "@/app/teacher/subjects";
import TeacherMyAttendance from "@/app/teacher/my-attendance";
import TeacherClassLeave from "@/app/teacher/class-leave";
import StaffMyAttendance from "@/app/my-attendance";

import ParentDashboard from "@/app/parent/dashboard";
import ParentChildProfile from "@/app/parent/children/child-profile";
import ParentAttendance from "@/app/parent/children/attendance";
import ParentTimetable from "@/app/parent/children/timetable";
import ParentHomework from "@/app/parent/children/homework";
import ParentExams from "@/app/parent/children/exams";
import ParentResults from "@/app/parent/children/results";
import ParentFeeDetails from "@/app/parent/fees/fee-details";
import ParentPayFees from "@/app/parent/fees/pay-fees";
import ParentPaymentHistory from "@/app/parent/fees/payment-history";
import ParentLeave from "@/app/parent/leave";
import ParentTransport from "@/app/parent/transport";

import SuperAdminSchools from "@/app/super-admin/schools/schools";
import SuperAdminSchoolDetail from "@/app/super-admin/schools/school-detail";
import SuperAdminSubscriptions from "@/app/super-admin/subscriptions";
import SuperAdminPlans from "@/app/super-admin/plans";
import SuperAdminSettings from "@/app/super-admin/settings";
import SuperAdminSchoolAdmins from "@/app/super-admin/school-admins";
import SuperAdminLeads from "@/app/super-admin/leads";
import SuperAdminRevenue from "@/app/super-admin/revenue";
import SuperAdminRenewals from "@/app/super-admin/renewals";
import SuperAdminSupport from "@/app/super-admin/support";
import SuperAdminAnnouncements from "@/app/super-admin/announcements";
import SuperAdminFeatures from "@/app/super-admin/features";
import SuperAdminSecurity from "@/app/super-admin/security";

function guarded(path: string, element: ReactElement) {
  return (
    <RequireRole roles={ROUTE_ROLES[path] ?? ROLES}>
      {element}
    </RequireRole>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={DASHBOARD_PATH_FOR_ROLE[user.role]} replace />;
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<RootRedirect />} />

              <Route element={<AppShell />}>
                {/* Role-prefixed dashboard entry points, per login redirection spec */}
                <Route path="/super-admin/dashboard" element={<RequireRole roles={["Super Admin"]}><Dashboard /></RequireRole>} />
                <Route path="/school-admin/dashboard" element={<RequireRole roles={["School Admin"]}><Dashboard /></RequireRole>} />
                <Route path="/teacher/dashboard" element={<RequireRole roles={["Teacher"]}><Dashboard /></RequireRole>} />
                <Route path="/staff/dashboard" element={<RequireRole roles={["Staff", "Accountant", "Librarian", "Transport Manager"]}><Dashboard /></RequireRole>} />
                <Route path="/student/dashboard" element={<RequireRole roles={["Student"]}><Dashboard /></RequireRole>} />

                {/* Parent Portal — child-switcher state is scoped to just this route subtree */}
                <Route element={<RequireRole roles={["Parent"]}><ParentChildProvider><Outlet /></ParentChildProvider></RequireRole>}>
                  <Route path="/parent/dashboard" element={<ParentDashboard />} />
                  <Route path="/parent/children/profile" element={<ParentChildProfile />} />
                  <Route path="/parent/children/attendance" element={<ParentAttendance />} />
                  <Route path="/parent/children/timetable" element={<ParentTimetable />} />
                  <Route path="/parent/children/homework" element={<ParentHomework />} />
                  <Route path="/parent/children/exams" element={<ParentExams />} />
                  <Route path="/parent/children/results" element={<ParentResults />} />
                  <Route path="/parent/fees/details" element={<ParentFeeDetails />} />
                  <Route path="/parent/fees/pay" element={<ParentPayFees />} />
                  <Route path="/parent/fees/history" element={<ParentPaymentHistory />} />
                  <Route path="/parent/leave" element={<ParentLeave />} />
                  <Route path="/parent/transport" element={<ParentTransport />} />
                </Route>

                <Route path="/students" element={guarded("/students", <StudentsPage />)} />
                <Route path="/students/:id" element={guarded("/students", <StudentProfile />)} />
                <Route path="/subjects" element={guarded("/subjects", <SubjectsPage />)} />
                <Route path="/admissions" element={guarded("/admissions", <Admissions />)} />
                <Route path="/attendance" element={guarded("/attendance", <Attendance />)} />
                <Route path="/classes" element={guarded("/classes", <Classes />)} />
                <Route path="/events" element={guarded("/events", <Events />)} />
                <Route path="/examinations" element={guarded("/examinations", <Examinations />)} />
                <Route path="/fees/structure" element={guarded("/fees/structure", <Fees tab="structure" />)} />
                <Route path="/fees/collection" element={guarded("/fees/collection", <Fees tab="collection" />)} />
                <Route path="/fees/pending" element={guarded("/fees/pending", <Fees tab="pending" />)} />
                <Route path="/fees/reports" element={guarded("/fees/reports", <Fees tab="reports" />)} />
                <Route path="/homework" element={guarded("/homework", <Homework />)} />
                <Route path="/leave/students" element={guarded("/leave/students", <Leave type="STUDENT" />)} />
                <Route path="/leave/teachers" element={guarded("/leave/teachers", <Leave type="TEACHER" />)} />
                <Route path="/leave/staff" element={guarded("/leave/staff", <Leave type="STAFF" />)} />
                <Route path="/library" element={guarded("/library", <Library />)} />
                <Route path="/notices" element={guarded("/notices", <Notices />)} />
                <Route path="/announcements" element={guarded("/announcements", <Announcements />)} />
                <Route path="/certificates" element={guarded("/certificates", <Certificates />)} />
                <Route path="/notifications" element={guarded("/notifications", <Notifications />)} />
                <Route path="/parents" element={guarded("/parents", <Parents />)} />
                <Route path="/reports" element={guarded("/reports", <Reports />)} />
                <Route path="/results" element={guarded("/results", <Results />)} />
                <Route path="/roles" element={guarded("/roles", <RolesPage />)} />
                <Route path="/settings" element={guarded("/settings", <SettingsPage />)} />
                <Route path="/teaching-staff" element={guarded("/teaching-staff", <Teachers mode="Teaching" />)} />
                <Route path="/non-teaching-staff" element={guarded("/non-teaching-staff", <Teachers mode="Non-Teaching" />)} />
                <Route path="/timetable" element={guarded("/timetable", <Timetable />)} />
                <Route path="/transport" element={guarded("/transport", <Transport />)} />
                <Route path="/users" element={guarded("/users", <Users />)} />
                <Route path="/profile" element={guarded("/profile", <Profile />)} />
                <Route path="/my-subjects" element={guarded("/my-subjects", <MySubjects />)} />
                <Route path="/my-leave" element={guarded("/my-leave", <MyLeave />)} />
                <Route path="/holidays" element={guarded("/holidays", <Holidays />)} />
                <Route path="/my-fees" element={guarded("/my-fees", <MyFees />)} />
                <Route path="/teacher/profile" element={guarded("/teacher/profile", <TeacherProfile />)} />
                <Route path="/teacher/classes" element={guarded("/teacher/classes", <TeacherClasses />)} />
                <Route path="/teacher/students" element={guarded("/teacher/students", <TeacherStudents />)} />
                <Route path="/teacher/subjects" element={guarded("/teacher/subjects", <TeacherSubjects />)} />
                <Route path="/teacher/my-attendance" element={guarded("/teacher/my-attendance", <TeacherMyAttendance />)} />
                <Route path="/teacher/class-leave" element={guarded("/teacher/class-leave", <TeacherClassLeave />)} />
                <Route path="/staff/my-attendance" element={guarded("/staff/my-attendance", <StaffMyAttendance />)} />

                {/* Super Admin — SaaS/platform-level only, never school-internal data */}
                <Route path="/super-admin/schools" element={<RequireRole roles={["Super Admin"]}><SuperAdminSchools /></RequireRole>} />
                <Route path="/super-admin/schools/:id" element={<RequireRole roles={["Super Admin"]}><SuperAdminSchoolDetail /></RequireRole>} />
                <Route path="/super-admin/subscriptions" element={<RequireRole roles={["Super Admin"]}><SuperAdminSubscriptions /></RequireRole>} />
                <Route path="/super-admin/plans" element={<RequireRole roles={["Super Admin"]}><SuperAdminPlans /></RequireRole>} />
                <Route path="/super-admin/settings" element={<RequireRole roles={["Super Admin"]}><SuperAdminSettings /></RequireRole>} />
                <Route path="/super-admin/school-admins" element={<RequireRole roles={["Super Admin"]}><SuperAdminSchoolAdmins /></RequireRole>} />
                <Route path="/super-admin/leads" element={<RequireRole roles={["Super Admin"]}><SuperAdminLeads /></RequireRole>} />
                <Route path="/super-admin/revenue" element={<RequireRole roles={["Super Admin"]}><SuperAdminRevenue /></RequireRole>} />
                <Route path="/super-admin/renewals" element={<RequireRole roles={["Super Admin"]}><SuperAdminRenewals /></RequireRole>} />
                <Route path="/super-admin/support" element={<RequireRole roles={["Super Admin"]}><SuperAdminSupport /></RequireRole>} />
                <Route path="/super-admin/announcements" element={<RequireRole roles={["Super Admin"]}><SuperAdminAnnouncements /></RequireRole>} />
                <Route path="/super-admin/features" element={<RequireRole roles={["Super Admin"]}><SuperAdminFeatures /></RequireRole>} />
                <Route path="/super-admin/security" element={<RequireRole roles={["Super Admin"]}><SuperAdminSecurity /></RequireRole>} />

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </ErrorBoundary>
          <Toaster position="top-right" />
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
