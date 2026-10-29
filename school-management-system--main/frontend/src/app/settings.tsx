"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { SignOutCard } from "@/components/shared/SignOutCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcademicYears, useSchoolProfile } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { cn } from "@/lib/utils";
import {
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  Globe,
  GraduationCap,
  Hash,
  ImageIcon,
  Mail,
  MapPin,
  Phone,
  School,
  Tag,
  UserRound,
} from "lucide-react";

function SchoolProfileForm() {
  const { data: school, isLoading } = useSchoolProfile();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [session, setSession] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [code, setCode] = useState("");
  const [website, setWebsite] = useState("");
  const [principal, setPrincipal] = useState("");
  const [board, setBoard] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!school) return;
    setName(school.name ?? "");
    setShortName(school.short_name ?? "");
    setAddress(school.address ?? "");
    setPhone(school.phone ?? "");
    setEmail(school.email ?? "");
    setSession(school.session ?? "");
    setLogoUrl(school.logo_url ?? "");
    setCode(school.code ?? "");
    setWebsite(school.website ?? "");
    setPrincipal(school.principal ?? "");
    setBoard(school.board ?? "");
    setAffiliation(school.affiliation ?? "");
  }, [school]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch("/school-profile", {
        name,
        shortName,
        address,
        phone,
        email,
        logoUrl,
        code,
        website,
        principal,
        board,
        affiliation,
      });
      await queryClient.invalidateQueries({ queryKey: ["school-profile"] });
      toast.success("School profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update school profile");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const changed =
    !!school &&
    [
      [name, school.name],
      [shortName, school.short_name],
      [address, school.address],
      [phone, school.phone],
      [email, school.email],
      [logoUrl, school.logo_url],
      [code, school.code],
      [website, school.website],
      [principal, school.principal],
      [board, school.board],
      [affiliation, school.affiliation],
    ].some(([now, was]) => (now ?? "") !== (was ?? ""));
  const initials =
    (shortName || name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "S";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Identity */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
          {/^https?:\/\//i.test(logoUrl) ? (
            <img src={logoUrl} alt="" className="h-full w-full bg-white object-contain" />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold capitalize">
            {name || "Your school"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[shortName, board, session].filter(Boolean).join(" · ") || "Add your school details"}
          </p>
        </div>
      </div>

      <ProfileGroup icon={Building2} title="School details">
        <Field id="sch-name" label="School name" icon={School} className="sm:col-span-2">
          <Input
            id="sch-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="pl-9"
          />
        </Field>
        <Field id="sch-short" label="Short name" icon={Tag}>
          <Input
            id="sch-short"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            className="pl-9"
          />
        </Field>
        <Field id="sch-code" label="School code" icon={Hash}>
          <Input
            id="sch-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. MPS-001"
            className="pl-9"
          />
        </Field>
        <Field
          id="sch-principal"
          label="Principal / Administrator"
          icon={UserRound}
          className="sm:col-span-2"
        >
          <Input
            id="sch-principal"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            className="pl-9"
          />
        </Field>
      </ProfileGroup>

      <ProfileGroup icon={Phone} title="Contact">
        <Field id="sch-phone" label="Phone" icon={Phone}>
          <PhoneInput
            id="sch-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="pl-9"
          />
        </Field>
        <Field id="sch-email" label="Email" icon={Mail}>
          <Input
            id="sch-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-9"
          />
        </Field>
        <Field id="sch-address" label="Address" icon={MapPin} className="sm:col-span-2">
          <Input
            id="sch-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, state, PIN"
            className="pl-9"
          />
        </Field>
        <Field id="sch-website" label="Website" icon={Globe} className="sm:col-span-2">
          <Input
            id="sch-website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            className="pl-9"
          />
        </Field>
      </ProfileGroup>

      <ProfileGroup icon={GraduationCap} title="Academic">
        <Field id="sch-board" label="Board" icon={BookOpen}>
          <Input
            id="sch-board"
            value={board}
            onChange={(e) => setBoard(e.target.value)}
            placeholder="e.g. CBSE"
            className="pl-9"
          />
        </Field>
        <Field id="sch-affiliation" label="Affiliation no." icon={BadgeCheck}>
          <Input
            id="sch-affiliation"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            className="pl-9"
          />
        </Field>
        <Field
          id="sch-session"
          label="Academic session"
          icon={CalendarDays}
          hint="Set by the active academic year below"
        >
          <Input id="sch-session" value={session} readOnly disabled className="pl-9" />
        </Field>
        <Field
          id="sch-logo"
          label="Logo URL"
          icon={ImageIcon}
          hint="Shown on receipts and certificates"
        >
          <Input
            id="sch-logo"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
            className="pl-9"
          />
        </Field>
      </ProfileGroup>

      {/* Save bar — sticks to the bottom on phones while there are changes. */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3",
          changed &&
            "sticky bottom-20 z-10 shadow-lg ring-1 ring-primary/20 lg:static lg:shadow-none lg:ring-0",
        )}
      >
        <p className="text-xs text-muted-foreground">
          {changed ? "You have unsaved changes" : "All changes saved"}
        </p>
        <Button type="submit" disabled={submitting || !changed} className="min-w-32">
          {submitting ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function ProfileGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof School;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <h3 className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5 text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </h3>
      <div className="grid gap-3 p-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  icon: Icon,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  icon: typeof School;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AcademicYearsManager() {
  const { data: years, isLoading } = useAcademicYears();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["academic-years"] });
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/academic-years", { name, startDate, endDate });
      await refresh();
      setName("");
      setStartDate("");
      setEndDate("");
      toast.success("Academic year created");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to create academic year");
    } finally {
      setBusy(false);
    }
  }
  async function update(id: string, status: string) {
    setBusy(true);
    try {
      await api.patch(`/academic-years/${id}`, { status });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["school-profile"] });
      toast.success("Academic year updated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update academic year");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await api.delete(`/academic-years/${id}`);
      await refresh();
      toast.success("Academic year deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete academic year");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-4">
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="2027-2028"
        />
        <Input
          required
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <Button disabled={busy}>Add Academic Year</Button>
      </form>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        (years ?? []).map((year) => (
          <div
            key={year.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div>
              <p className="font-medium">{year.name}</p>
              <p className="text-xs text-muted-foreground">
                {year.start_date} to {year.end_date} · {year.status}
              </p>
            </div>
            <div className="flex gap-2">
              {year.status !== "ACTIVE" && (
                <Button size="sm" disabled={busy} onClick={() => update(year.id, "ACTIVE")}>
                  Activate
                </Button>
              )}
              {year.status === "ACTIVE" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => update(year.id, "CLOSED")}
                >
                  Close
                </Button>
              )}
              {year.status !== "ACTIVE" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => update(year.id, "ARCHIVED")}
                >
                  Archive
                </Button>
              )}
              {year.status !== "ACTIVE" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(year.id)}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const LINKS: { label: string; to: string; description: string }[] = [
  {
    label: "Classes & Sections",
    to: "/classes",
    description: "Manage class list, sections and class teachers.",
  },
  {
    label: "Classrooms",
    to: "/rooms",
    description: "Add rooms and labs, and see which class uses each.",
  },
  { label: "Subjects", to: "/subjects", description: "Manage subjects and teacher assignments." },
  {
    label: "Fee Structure",
    to: "/fees/structure",
    description: "Define fee types and class-wise amounts.",
  },
  {
    label: "Examinations",
    to: "/examinations",
    description: "Configure exam schedules and grading.",
  },
];

export default function Page() {
  return (
    <div>
      <PageHeader
        title="School Settings"
        description="Manage your school's profile and configuration."
        breadcrumb={["Dashboard", "School Settings"]}
      />

      <SectionCard
        title="School Profile"
        subtitle="Shown across the app, receipts and certificates"
        className="mt-4 mb-4"
      >
        <SchoolProfileForm />
      </SectionCard>

      <SectionCard
        title="Academic Years"
        subtitle="Create, activate, close and archive school-specific sessions"
        className="mb-4"
      >
        <AcademicYearsManager />
      </SectionCard>

      <SectionCard
        title="Configuration"
        subtitle="Manage classes, subjects, fees and exam settings"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="panel flex flex-col gap-1 p-4 hover:bg-muted/40">
              <span className="text-sm font-semibold">{l.label}</span>
              <span className="text-xs text-muted-foreground">{l.description}</span>
            </Link>
          ))}
        </div>
      </SectionCard>
      <SignOutCard />
    </div>
  );
}
