"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Phone, Image as ImageIcon } from "lucide-react";
import { PageHeader, Initials, EmptyState } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { SignOutCard } from "@/components/shared/SignOutCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyTeacherProfile, useClasses, useSubjects } from "@/hooks/useApi";
import { api } from "@/lib/api";

export default function TeacherProfilePage() {
  const { data: teacher, isLoading } = useMyTeacherProfile();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!teacher) return;
    setPhone(teacher.phone ?? "");
    setPhotoUrl(teacher.photo_url ?? "");
  }, [teacher]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch("/teachers/me", { phone, photoUrl });
      await queryClient.invalidateQueries({ queryKey: ["teacher-me"] });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!teacher)
    return (
      <EmptyState title="Profile not found" description="Contact your school administrator." />
    );

  const assignedClassIds: string[] = JSON.parse(teacher.assigned_classes);
  const assignedSubjectIds: string[] = JSON.parse(teacher.assigned_subjects);
  const classNames = (classes ?? [])
    .filter((c) => assignedClassIds.includes(c.id))
    .map((c) => `${c.name}-${c.section}`);
  const subjectNames = (subjects ?? [])
    .filter((s) => assignedSubjectIds.includes(s.id))
    .map((s) => s.name);

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="View and update your personal details."
        breadcrumb={["Dashboard", "My Profile"]}
      />

      <div className="panel mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Initials name={teacher.name} className="h-16 w-16 text-lg" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold">{teacher.name}</h2>
            <p className="text-xs text-muted-foreground">
              Employee ID: {teacher.id.slice(0, 8).toUpperCase()} ·{" "}
              {teacher.designation ?? "Teacher"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{teacher.department ?? "—"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={teacher.employment_status} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Academic Info" subtitle="Read-only — set by your school administrator">
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ["Designation", teacher.designation ?? "—"],
              ["Department", teacher.department ?? "—"],
              ["Joining Date", teacher.joining_date ?? "—"],
              ["Employment Status", teacher.employment_status],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{v}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Assigned Classes</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {classNames.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  classNames.map((c) => <StatusBadge key={c} status={c} />)
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Subjects</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {subjectNames.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  subjectNames.map((s) => <StatusBadge key={s} status={s} />)
                )}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Contact Details" subtitle="You can update these fields">
          <form onSubmit={handleSubmit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="t-phone">
                <Phone className="mr-1 inline h-3.5 w-3.5" />
                Phone
              </Label>
              <Input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-photo">
                <ImageIcon className="mr-1 inline h-3.5 w-3.5" />
                Photo URL
              </Label>
              <Input
                id="t-photo"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <Button type="submit" disabled={submitting} className="mt-1">
              Save Changes
            </Button>
          </form>
        </SectionCard>
      </div>
      <SignOutCard />
    </div>
  );
}
