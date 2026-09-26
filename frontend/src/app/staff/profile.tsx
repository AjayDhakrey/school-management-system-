"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, Phone } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { ProfileHero } from "@/components/shared/ProfileHero";
import { PhotoField } from "@/components/shared/PhotoField";
import { SignOutCard } from "@/components/shared/SignOutCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyStaffProfile } from "@/hooks/useApi";
import { useAuth, toDisplayRole } from "@/lib/auth-context";
import { api } from "@/lib/api";

export default function StaffProfilePage() {
  const { user } = useAuth();
  const role = toDisplayRole(user);
  const { data: staff, isLoading } = useMyStaffProfile();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!staff) return;
    setPhone(staff.phone ?? "");
    setPhotoUrl(staff.photo_url ?? "");
  }, [staff]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch("/staff/me", { phone, photoUrl });
      await queryClient.invalidateQueries({ queryKey: ["staff-me"] });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!staff)
    return (
      <EmptyState title="Profile not found" description="Contact your school administrator." />
    );

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="View and update your personal details."
        breadcrumb={["Dashboard", "My Profile"]}
      />

      <ProfileHero
        name={staff.name}
        photoUrl={photoUrl}
        onPhotoChange={setPhotoUrl}
        lines={
          <>
            <p className="mt-0.5 text-xs text-white/80">
              Employee ID: {staff.employee_id ?? staff.id.slice(0, 8).toUpperCase()} · {role}
            </p>
            <p className="mt-1 text-xs text-white/80">{staff.designation ?? "—"}</p>
          </>
        }
        badges={<StatusBadge status={staff.employment_status} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Employment Info" subtitle="Read-only — set by your school administrator">
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ["Designation", staff.designation ?? "—"],
              ["Department", role],
              ["Joining Date", staff.joining_date ?? "—"],
              ["Employment Status", staff.employment_status],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{v}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">
                <Mail className="mr-1 inline h-3.5 w-3.5" />
                Email
              </dt>
              <dd className="mt-0.5 text-sm font-medium">{staff.email ?? "—"}</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Contact Details" subtitle="You can update these fields">
          <form onSubmit={handleSubmit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s-phone">
                <Phone className="mr-1 inline h-3.5 w-3.5" />
                Phone
              </Label>
              <Input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <PhotoField
              id="s-photo"
              name={staff.name}
              photoUrl={photoUrl}
              onPhotoChange={setPhotoUrl}
            />
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
