"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, Phone, MapPin, Droplet, Cake } from "lucide-react";
import { PageHeader, Initials, EmptyState } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { ProfileHero } from "@/components/shared/ProfileHero";
import { PhotoField } from "@/components/shared/PhotoField";
import { SignOutCard } from "@/components/shared/SignOutCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyStudentProfile, useParents } from "@/hooks/useApi";
import { api } from "@/lib/api";

export default function ProfilePage() {
  const { data: student, isLoading } = useMyStudentProfile();
  const { data: parents } = useParents();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!student) return;
    setEmail(student.email ?? "");
    setPhone(student.phone ?? "");
    setAddress(student.address ?? "");
    setPhotoUrl(student.photo_url ?? "");
    setBloodGroup(student.blood_group ?? "");
  }, [student]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch("/students/me", { email, phone, address, photoUrl, bloodGroup });
      await queryClient.invalidateQueries({ queryKey: ["student-me"] });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!student)
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
        name={student.name}
        photoUrl={photoUrl}
        onPhotoChange={setPhotoUrl}
        lines={
          <>
            <p className="mt-0.5 text-xs text-white/80">
              {student.id} · {student.admission_no ?? "—"}
            </p>
            <p className="mt-1 text-xs text-white/80">
              {student.class_name} - {student.section} · Roll #{student.roll}
            </p>
          </>
        }
        badges={
          <>
            <StatusBadge status={student.status ?? "Active"} />
            <StatusBadge status={student.fee_status ?? "Pending"} />
          </>
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Academic & Admission Info"
          subtitle="Read-only — contact the school office to change"
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ["Class", student.class_name ?? "—"],
              ["Section", student.section ?? "—"],
              ["Roll No.", String(student.roll ?? "—")],
              ["Admission No.", student.admission_no ?? "—"],
              ["Admitted On", student.admitted_on ?? "—"],
              ["Date of Birth", student.dob ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Contact Details" subtitle="You can update these fields">
          <form onSubmit={handleSubmit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-email">
                <Mail className="mr-1 inline h-3.5 w-3.5" />
                Email
              </Label>
              <Input
                id="p-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-phone">
                <Phone className="mr-1 inline h-3.5 w-3.5" />
                Phone
              </Label>
              <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-address">
                <MapPin className="mr-1 inline h-3.5 w-3.5" />
                Address
              </Label>
              <Input id="p-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-blood">
                <Droplet className="mr-1 inline h-3.5 w-3.5" />
                Blood Group
              </Label>
              <Input
                id="p-blood"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                placeholder="O+"
              />
            </div>
            <PhotoField
              id="p-photo"
              name={student.name}
              photoUrl={photoUrl}
              onPhotoChange={setPhotoUrl}
            />
            <Button type="submit" disabled={submitting} className="mt-1">
              Save Changes
            </Button>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="Parents / Guardians" subtitle="Linked guardian accounts" className="mt-4">
        {(parents ?? []).length === 0 ? (
          <EmptyState
            title="No guardians linked"
            description="Your school will link a parent/guardian account to your profile."
            icon={Cake}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(parents ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-border p-3"
              >
                <Initials name={p.name} tone="gold" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.email ?? "—"} · {p.phone ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SignOutCard />
    </div>
  );
}
