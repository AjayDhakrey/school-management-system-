"use client";

import { Cake, Droplet, Home, Mail, Phone, School, User } from "lucide-react";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { AppearanceSettings } from "@/components/shared/AppearanceSettings";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useStudent } from "@/hooks/useApi";
import { useParentChild } from "@/lib/parent-child-context";

function Row({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function ChildProfilePage() {
  const { selectedChildId, isLoading: childrenLoading } = useParentChild();
  const { data: student, isLoading } = useStudent(selectedChildId ?? undefined);

  return (
    <div>
      <PageHeader title="Child Profile" description="View your child's school profile." breadcrumb={["Dashboard", "My Children", "Profile"]} />

      <AppearanceSettings />

      <ChildSwitcher />

      {childrenLoading || isLoading ? (
        <CardSkeleton count={2} />
      ) : !student ? (
        <div className="panel">
          <EmptyState title="No profile to show" description="Select a child above to view their profile." icon={User} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Overview" className="lg:col-span-1">
            <div className="flex flex-col items-center gap-2 pb-2 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                {student.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}
              </span>
              <p className="font-display text-base font-bold">{student.name}</p>
              <p className="text-xs text-muted-foreground">Admission No. {student.admission_no ?? "—"}</p>
              <StatusBadge status={student.status ?? "Active"} />
            </div>
          </SectionCard>

          <SectionCard title="Academic Details" className="lg:col-span-1">
            <Row icon={School} label="Class & Section" value={student.class_name ? `${student.class_name}${student.section ? `-${student.section}` : ""}` : "—"} />
            <Row icon={User} label="Roll No." value={student.roll ? String(student.roll) : "—"} />
            <Row icon={Cake} label="Date of Birth" value={student.dob ?? "—"} />
            <Row icon={Droplet} label="Blood Group" value={student.blood_group ?? "—"} />
          </SectionCard>

          <SectionCard title="Contact Details" className="lg:col-span-1">
            <Row icon={Mail} label="Email" value={student.email ?? "—"} />
            <Row icon={Phone} label="Phone" value={student.phone ?? "—"} />
            <Row icon={Home} label="Address" value={student.address ?? "—"} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
