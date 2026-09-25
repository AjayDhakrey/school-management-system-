import { lazy, Suspense, useState, type ReactElement } from "react";
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

const Login = lazy(() => import("@/pages/Login"));
const LandingPage = lazy(() => import("@/landing/LandingPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const StudentsPage = lazy(() => import("@/pages/StudentsPage"));
const StudentProfile = lazy(() => import("@/pages/StudentProfile"));
const SubjectsPage = lazy(() => import("@/pages/SubjectsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const Admissions = lazy(() => import("@/app/admissions"));
const Attendance = lazy(() => import("@/app/attendance"));
const Classes = lazy(() => import("@/app/classes"));
const Events = lazy(() => import("@/app/events"));
const Examinations = lazy(() => import("@/app/examinations"));
const Fees = lazy(() => import("@/app/fees"));
const Homework = lazy(() => import("@/app/homework"));
const Leave = lazy(() => import("@/app/leave"));
const Library = lazy(() => import("@/app/library"));
const Notices = lazy(() => import("@/app/notices"));
const Announcements = lazy(() => import("@/app/announcements"));
const Notifications = lazy(() => import("@/app/notifications"));
const Parents = lazy(() => import("@/app/parents"));
const Reports = lazy(() => import("@/app/reports"));
const Results = lazy(() => import("@/app/results"));
const RolesPage = lazy(() => import("@/app/roles"));
const SettingsPage = lazy(() => import("@/app/settings"));
const Teachers = lazy(() => import("@/app/teachers"));
const Certificates = lazy(() => import("@/app/certificates"));
const Timetable = lazy(() => import("@/app/timetable"));
const Transport = lazy(() => import("@/app/transport"));
const TransportDrivers = lazy(() => import("@/app/transport-drivers"));
const TransportStudents = lazy(() => import("@/app/transport-students"));
const TransportAttendance = lazy(() => import("@/app/transport-attendance"));
const TransportMaintenance = lazy(() => import("@/app/transport-maintenance"));
const TransportComplaints = lazy(() => import("@/app/transport-complaints"));
const TransportFees = lazy(() => import("@/app/transport-fees"));
const TransportReports = lazy(() => import("@/app/transport-reports"));
const Users = lazy(() => import("@/app/users"));
const Profile = lazy(() => import("@/app/profile"));
const MySubjects = lazy(() => import("@/app/my-subjects"));
const MyLeave = lazy(() => import("@/app/my-leave"));
const Holidays = lazy(() => import("@/app/holidays"));
const MyFees = lazy(() => import("@/app/my-fees"));
const TeacherProfile = lazy(() => import("@/app/teacher/profile"));
const StaffProfile = lazy(() => import("@/app/staff/profile"));
const TeacherClasses = lazy(() => import("@/app/teacher/classes"));
const TeacherStudents = lazy(() => import("@/app/teacher/students"));
const TeacherSubjects = lazy(() => import("@/app/teacher/subjects"));
const TeacherMyAttendance = lazy(() => import("@/app/teacher/my-attendance"));
const TeacherClassLeave = lazy(() => import("@/app/teacher/class-leave"));
const StaffMyAttendance = lazy(() => import("@/app/my-attendance"));
const Salary = lazy(() => import("@/app/salary"));
const Payments = lazy(() => import("@/app/payments"));
const Expenses = lazy(() => import("@/app/expenses"));
const Invoices = lazy(() => import("@/app/invoices"));
const FinancialReports = lazy(() => import("@/app/financial-reports"));
const FinancialSettings = lazy(() => import("@/app/financial-settings"));

const ParentDashboard = lazy(() => import("@/app/parent/dashboard"));
const ParentChildProfile = lazy(() => import("@/app/parent/children/child-profile"));
const ParentAttendance = lazy(() => import("@/app/parent/children/attendance"));
const ParentTimetable = lazy(() => import("@/app/parent/children/timetable"));
const ParentHomework = lazy(() => import("@/app/parent/children/homework"));
const ParentExams = lazy(() => import("@/app/parent/children/exams"));
const ParentResults = lazy(() => import("@/app/parent/children/results"));
const ParentFeeDetails = lazy(() => import("@/app/parent/fees/fee-details"));
const ParentPayFees = lazy(() => import("@/app/parent/fees/pay-fees"));
const ParentPaymentHistory = lazy(() => import("@/app/parent/fees/payment-history"));
const ParentLeave = lazy(() => import("@/app/parent/leave"));
const ParentTransport = lazy(() => import("@/app/parent/transport"));

const SuperAdminSchools = lazy(() => import("@/app/super-admin/schools/schools"));
const SuperAdminSchoolDetail = lazy(() => import("@/app/super-admin/schools/school-detail"));
const SuperAdminSubscriptions = lazy(() => import("@/app/super-admin/subscriptions"));
const SuperAdminPlans = lazy(() => import("@/app/super-admin/plans"));
const SuperAdminSettings = lazy(() => import("@/app/super-admin/settings"));
const SuperAdminSchoolAdmins = lazy(() => import("@/app/super-admin/school-admins"));
const SuperAdminLeads = lazy(() => import("@/app/super-admin/leads"));
const SuperAdminRevenue = lazy(() => import("@/app/super-admin/revenue"));
const SuperAdminRenewals = lazy(() => import("@/app/super-admin/renewals"));
const SuperAdminSupport = lazy(() => import("@/app/super-admin/support"));
const SuperAdminAnnouncements = lazy(() => import("@/app/super-admin/announcements"));
const SuperAdminFeatures = lazy(() => import("@/app/super-admin/features"));
const SuperAdminSecurity = lazy(() => import("@/app/super-admin/security"));

function guarded(path: string, element: ReactElement) {
  return <RequireRole roles={ROUTE_ROLES[path] ?? ROLES}>{element}</RequireRole>;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <LandingPage />;
  return <Navigate to={DASHBOARD_PATH_FOR_ROLE[user.role]} replace />;
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppProvider>
          <ErrorBoundary>
            <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Loading page…</div>}><Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<RootRedirect />} />

              <Route element={<AppShell />}>
                {/* Role-prefixed dashboard entry points, per login redirection spec */}
                <Route
                  path="/super-admin/dashboard"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <Dashboard />
                    </RequireRole>
                  }
                />
                <Route
                  path="/school-admin/dashboard"
                  element={
                    <RequireRole roles={["School Admin"]}>
                      <Dashboard />
                    </RequireRole>
                  }
                />
                <Route
                  path="/teacher/dashboard"
                  element={
                    <RequireRole roles={["Teacher"]}>
                      <Dashboard />
                    </RequireRole>
                  }
                />
                <Route
                  path="/staff/dashboard"
                  element={
                    <RequireRole roles={["Staff", "Accountant", "Librarian", "Transport Manager"]}>
                      <Dashboard />
                    </RequireRole>
                  }
                />
                <Route
                  path="/student/dashboard"
                  element={
                    <RequireRole roles={["Student"]}>
                      <Dashboard />
                    </RequireRole>
                  }
                />

                {/* Parent Portal — child-switcher state is scoped to just this route subtree */}
                <Route
                  element={
                    <RequireRole roles={["Parent"]}>
                      <ParentChildProvider>
                        <Outlet />
                      </ParentChildProvider>
                    </RequireRole>
                  }
                >
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
                <Route
                  path="/fees/structure"
                  element={guarded("/fees/structure", <Fees tab="structure" />)}
                />
                <Route
                  path="/fees/collection"
                  element={guarded("/fees/collection", <Fees tab="collection" />)}
                />
                <Route
                  path="/fees/pending"
                  element={guarded("/fees/pending", <Fees tab="pending" />)}
                />
                <Route
                  path="/fees/reports"
                  element={guarded("/fees/reports", <Fees tab="reports" />)}
                />
                <Route
                  path="/fees/discounts"
                  element={guarded("/fees/discounts", <Fees tab="discounts" />)}
                />
                <Route
                  path="/payments/transactions"
                  element={guarded("/payments/transactions", <Payments mode="transactions" />)}
                />
                <Route
                  path="/payments/refunds"
                  element={guarded("/payments/refunds", <Payments mode="refunds" />)}
                />
                <Route path="/expenses" element={guarded("/expenses", <Expenses tab="expenses" />)} />
                <Route
                  path="/expenses/categories"
                  element={guarded("/expenses/categories", <Expenses tab="categories" />)}
                />
                <Route
                  path="/expenses/vendors"
                  element={guarded("/expenses/vendors", <Expenses tab="vendors" />)}
                />
                <Route path="/invoices" element={guarded("/invoices", <Invoices />)} />
                <Route
                  path="/financial-reports"
                  element={guarded("/financial-reports", <FinancialReports />)}
                />
                <Route
                  path="/financial-settings"
                  element={guarded("/financial-settings", <FinancialSettings />)}
                />
                <Route path="/homework" element={guarded("/homework", <Homework />)} />
                <Route
                  path="/leave/students"
                  element={guarded("/leave/students", <Leave type="STUDENT" />)}
                />
                <Route
                  path="/leave/teachers"
                  element={guarded("/leave/teachers", <Leave type="TEACHER" />)}
                />
                <Route
                  path="/leave/staff"
                  element={guarded("/leave/staff", <Leave type="STAFF" />)}
                />
                <Route path="/library" element={guarded("/library", <Library />)} />
                <Route path="/notices" element={guarded("/notices", <Notices />)} />
                <Route
                  path="/announcements"
                  element={guarded("/announcements", <Announcements />)}
                />
                <Route path="/certificates" element={guarded("/certificates", <Certificates />)} />
                <Route
                  path="/notifications"
                  element={guarded("/notifications", <Notifications />)}
                />
                <Route path="/parents" element={guarded("/parents", <Parents />)} />
                <Route path="/reports" element={guarded("/reports", <Reports />)} />
                <Route path="/results" element={guarded("/results", <Results />)} />
                <Route path="/roles" element={guarded("/roles", <RolesPage />)} />
                <Route path="/settings" element={guarded("/settings", <SettingsPage />)} />
                <Route
                  path="/teaching-staff"
                  element={guarded("/teaching-staff", <Teachers mode="Teaching" />)}
                />
                <Route
                  path="/non-teaching-staff"
                  element={guarded("/non-teaching-staff", <Teachers mode="Non-Teaching" />)}
                />
                <Route path="/timetable" element={guarded("/timetable", <Timetable />)} />
                <Route path="/transport" element={guarded("/transport", <Transport />)} />
                <Route
                  path="/transport/drivers"
                  element={guarded("/transport/drivers", <TransportDrivers tab="drivers" />)}
                />
                <Route
                  path="/transport/attendants"
                  element={guarded("/transport/drivers", <TransportDrivers tab="attendants" />)}
                />
                <Route
                  path="/transport/students"
                  element={guarded("/transport/students", <TransportStudents />)}
                />
                <Route
                  path="/transport/attendance"
                  element={guarded("/transport/attendance", <TransportAttendance />)}
                />
                <Route
                  path="/transport/maintenance"
                  element={guarded("/transport/maintenance", <TransportMaintenance />)}
                />
                <Route
                  path="/transport/complaints"
                  element={guarded("/transport/complaints", <TransportComplaints />)}
                />
                <Route
                  path="/transport/fees"
                  element={guarded("/transport/fees", <TransportFees />)}
                />
                <Route
                  path="/transport/reports"
                  element={guarded("/transport/reports", <TransportReports />)}
                />
                <Route path="/users" element={guarded("/users", <Users />)} />
                <Route path="/profile" element={guarded("/profile", <Profile />)} />
                <Route path="/my-subjects" element={guarded("/my-subjects", <MySubjects />)} />
                <Route path="/my-leave" element={guarded("/my-leave", <MyLeave />)} />
                <Route path="/holidays" element={guarded("/holidays", <Holidays />)} />
                <Route path="/my-fees" element={guarded("/my-fees", <MyFees />)} />
                <Route
                  path="/teacher/profile"
                  element={guarded("/teacher/profile", <TeacherProfile />)}
                />
                <Route
                  path="/staff/profile"
                  element={guarded("/staff/profile", <StaffProfile />)}
                />
                <Route
                  path="/teacher/classes"
                  element={guarded("/teacher/classes", <TeacherClasses />)}
                />
                <Route
                  path="/teacher/students"
                  element={guarded("/teacher/students", <TeacherStudents />)}
                />
                <Route
                  path="/teacher/subjects"
                  element={guarded("/teacher/subjects", <TeacherSubjects />)}
                />
                <Route
                  path="/teacher/my-attendance"
                  element={guarded("/teacher/my-attendance", <TeacherMyAttendance />)}
                />
                <Route
                  path="/teacher/class-leave"
                  element={guarded("/teacher/class-leave", <TeacherClassLeave />)}
                />
                <Route
                  path="/staff/my-attendance"
                  element={guarded("/staff/my-attendance", <StaffMyAttendance />)}
                />
                <Route path="/payroll" element={guarded("/payroll", <Salary mode="manage" />)} />
                <Route
                  path="/my-salary"
                  element={guarded("/my-salary", <Salary mode="personal" />)}
                />

                {/* Super Admin — SaaS/platform-level only, never school-internal data */}
                <Route
                  path="/super-admin/schools"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminSchools />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/schools/:id"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminSchoolDetail />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/subscriptions"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminSubscriptions />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/plans"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminPlans />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/settings"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminSettings />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/school-admins"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminSchoolAdmins />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/leads"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminLeads />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/revenue"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminRevenue />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/renewals"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminRenewals />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/support"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminSupport />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/announcements"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminAnnouncements />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/features"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminFeatures />
                    </RequireRole>
                  }
                />
                <Route
                  path="/super-admin/security"
                  element={
                    <RequireRole roles={["Super Admin"]}>
                      <SuperAdminSecurity />
                    </RequireRole>
                  }
                />

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes></Suspense>
          </ErrorBoundary>
          <Toaster position="top-right" />
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
