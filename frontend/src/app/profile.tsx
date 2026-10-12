"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Phone,
  MapPin,
  Droplet,
  Cake,
  GraduationCap,
  Hash,
  IdCard,
  CalendarCheck,
  Users,
  Save,
  Copy,
  Check,
} from "lucide-react";
import { PageHeader, Initials, EmptyState } from "@/components/shared/ui-kit";
import { HighlightTile, IconField, InfoTile, InfoTileList } from "@/components/shared/ProfileTiles";
import { SectionCard } from "@/components/shared/SectionCard";
import { ProfileHero } from "@/components/shared/ProfileHero";
import { PhotoField } from "@/components/shared/PhotoField";
import { SignOutCard } from "@/components/shared/SignOutCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { useMyStudentProfile, useParents } from "@/hooks/useApi";
import { api } from "@/lib/api";

/** "2026-09-17" → local Date (avoids the UTC shift of `new Date("2026-09-17")`). */
function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

function formatDate(value: string | null | undefined) {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

/** Whole months/years between two dates, ignoring the time of day. */
function monthsBetween(from: Date, to: Date) {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    to.getMonth() -
    from.getMonth() -
    (to.getDate() < from.getDate() ? 1 : 0)
  );
}

function ageLabel(dob: string | null | undefined) {
  const date = parseDate(dob);
  if (!date) return "Not on record";
  const years = Math.floor(monthsBetween(date, new Date()) / 12);
  return years >= 1
    ? `${years} years old`
    : date.toLocaleDateString(undefined, { weekday: "long" });
}

function sinceLabel(admittedOn: string | null | undefined) {
  const date = parseDate(admittedOn);
  if (!date) return "Not on record";
  const months = monthsBetween(date, new Date());
  if (months < 1) return date > new Date() ? "Upcoming" : "This month";
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

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
  const [copied, setCopied] = useState(false);

  async function copyAdmissionNo(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Admission number copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — please copy it manually");
    }
  }

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
          <p className="mt-0.5 text-xs text-white/80">
            Admission No. {student.admission_no ?? "—"}
          </p>
        }
        badges={
          <>
            <StatusBadge status={student.status ?? "Active"} />
            <StatusBadge status={student.fee_status ?? "Pending"} />
          </>
        }
        stats={[
          {
            label: "Class",
            value: [student.class_name, student.section].filter(Boolean).join("-") || "—",
          },
          { label: "Roll No.", value: student.roll ?? "—" },
          { label: "Blood", value: student.blood_group || "—" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Academic & Admission" subtitle="Managed by the school office">
          <HighlightTile
            icon={IdCard}
            label="Admission No."
            value={student.admission_no ?? "—"}
            trailing={
              student.admission_no && (
                <button
                  type="button"
                  onClick={() => copyAdmissionNo(student.admission_no!)}
                  aria-label="Copy admission number"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25 active:scale-90"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              )
            }
          />
          <InfoTileList>
            <InfoTile
              icon={GraduationCap}
              label="Class"
              value={student.class_name ?? "—"}
              hint={student.section ? `Section ${student.section}` : "No section"}
            />
            <InfoTile
              icon={Hash}
              tone="gold"
              label="Roll No."
              value={student.roll ?? "—"}
              hint={student.roll ? "In class register" : "Not assigned yet"}
            />
            <InfoTile
              icon={CalendarCheck}
              tone="info"
              label="Admitted On"
              value={formatDate(student.admitted_on)}
              hint={sinceLabel(student.admitted_on)}
            />
            <InfoTile
              icon={Cake}
              tone="danger"
              label="Date of Birth"
              value={formatDate(student.dob)}
              hint={ageLabel(student.dob)}
            />
          </InfoTileList>
        </SectionCard>

        <SectionCard title="Contact Details" subtitle="You can update these fields">
          <form onSubmit={handleSubmit} className="grid gap-3.5">
            <IconField
              id="p-email"
              label="Email"
              icon={Mail}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <IconField
              id="p-phone"
              label="Phone"
              icon={Phone}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile number"
            />
            <IconField
              id="p-address"
              label="Address"
              icon={MapPin}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House, street, city"
            />
            <IconField
              id="p-blood"
              label="Blood Group"
              icon={Droplet}
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              placeholder="O+"
            />
            <PhotoField
              id="p-photo"
              name={student.name}
              photoUrl={photoUrl}
              onPhotoChange={setPhotoUrl}
            />
            <Button type="submit" disabled={submitting} className="mt-1 h-11 gap-2 rounded-xl">
              <Save className="h-4 w-4" />
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="Parents / Guardians" subtitle="Linked guardian accounts" className="mt-4">
        {(parents ?? []).length === 0 ? (
          <EmptyState
            title="No guardians linked"
            description="Your school will link a parent/guardian account to your profile."
            icon={Users}
          />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(parents ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <Initials name={p.name} tone="gold" className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.phone ?? p.email ?? "No contact details"}
                  </p>
                </div>
                {p.phone && (
                  <a
                    href={`tel:${p.phone}`}
                    aria-label={`Call ${p.name}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success-soft text-success transition-transform active:scale-90"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                {p.email && (
                  <a
                    href={`mailto:${p.email}`}
                    aria-label={`Email ${p.name}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info-soft text-info transition-transform active:scale-90"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SignOutCard />
    </div>
  );
}
