"use client";

import {
  GraduationCap,
  ClipboardCheck,
  UserCog,
  Users,
  FileCheck2,
  Wallet,
  FileSpreadsheet,
  PlaneTakeoff,
} from "lucide-react";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { InfoCard } from "@/components/shared/InfoCard";
import {
  useStudents,
  useAttendance,
  useTeachers,
  useStaff,
  useAdmissions,
  useFees,
  useExams,
  useLeaveRequests,
  isUpcomingExam,
} from "@/hooks/useApi";

export default function Page() {
  const { data: students } = useStudents();
  const { data: attendance } = useAttendance();
  const { data: teachers } = useTeachers();
  const { data: staff } = useStaff();
  const { data: admissions } = useAdmissions();
  const { data: fees } = useFees();
  const { data: exams } = useExams();
  const { data: leave } = useLeaveRequests();

  const presentToday = (attendance ?? []).filter((a) => a.status === "Present").length;
  const totalFeeAmount = (fees ?? []).reduce((sum, f) => sum + f.amount, 0);
  const pendingFeeAmount = (fees ?? []).filter((f) => f.status === "Pending").reduce((sum, f) => sum + f.amount, 0);
  const pendingLeave = (leave ?? []).filter((l) => l.status === "Pending").length;
  const convertedAdmissions = (admissions ?? []).filter((a) => a.stage === "CONVERTED").length;
  const scheduledExams = (exams ?? []).filter(isUpcomingExam).length;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="School-level reports across every module. Data shown is for your school only."
        breadcrumb={["Dashboard", "Reports"]}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SectionCard title="Student Report" subtitle="Enrolment overview">
          <InfoCard label="Total Students" value={(students ?? []).length} icon={GraduationCap} tone="navy" />
        </SectionCard>
        <SectionCard title="Attendance Report" subtitle="Recorded attendance entries">
          <InfoCard label="Present Records" value={presentToday} icon={ClipboardCheck} tone="success" />
        </SectionCard>
        <SectionCard title="Teacher Report" subtitle="Teaching staff overview">
          <InfoCard label="Total Teachers" value={(teachers ?? []).length} icon={UserCog} tone="info" />
        </SectionCard>
        <SectionCard title="Staff Report" subtitle="Non-teaching staff overview">
          <InfoCard label="Total Staff" value={(staff ?? []).length} icon={Users} tone="gold" />
        </SectionCard>
        <SectionCard title="Admission Report" subtitle="Applications converted to students">
          <InfoCard label="Converted" value={convertedAdmissions} icon={FileCheck2} tone="success" />
        </SectionCard>
        <SectionCard title="Fee Report" subtitle="Billed vs pending">
          <InfoCard label="Pending Amount" value={`₹${pendingFeeAmount.toLocaleString()}`} icon={Wallet} tone="warning" />
        </SectionCard>
        <SectionCard title="Exam/Result Report" subtitle="Scheduled examinations">
          <InfoCard label="Scheduled Exams" value={scheduledExams} icon={FileSpreadsheet} tone="info" />
        </SectionCard>
        <SectionCard title="Leave Report" subtitle="Requests awaiting review">
          <InfoCard label="Pending Requests" value={pendingLeave} icon={PlaneTakeoff} tone="warning" />
        </SectionCard>
      </div>

      <SectionCard className="mt-4" title="Fee Collection Overview">
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Total Billed</p>
            <p className="mt-0.5 font-display text-lg font-bold">₹{totalFeeAmount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="mt-0.5 font-display text-lg font-bold text-warning">₹{pendingFeeAmount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="mt-0.5 font-display text-lg font-bold text-success">₹{(totalFeeAmount - pendingFeeAmount).toLocaleString()}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
