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
import { useAcademicYears, useRooms, useSchoolProfile } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

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

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="sch-name">School Name</Label>
        <Input id="sch-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-short">Short Name</Label>
        <Input id="sch-short" value={shortName} onChange={(e) => setShortName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-code">School Code</Label>
        <Input id="sch-code" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="sch-address">Address</Label>
        <Input id="sch-address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-phone">Phone</Label>
        <Input id="sch-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-email">Email</Label>
        <Input
          id="sch-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-session">Academic Session</Label>
        <Input
          id="sch-session"
          value={session}
          readOnly
          disabled
          title="Managed by the active academic year"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-logo">Logo URL</Label>
        <Input
          id="sch-logo"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-website">Website</Label>
        <Input
          id="sch-website"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-principal">Principal / Administrator</Label>
        <Input
          id="sch-principal"
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-board">Board</Label>
        <Input id="sch-board" value={board} onChange={(e) => setBoard(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sch-affiliation">Affiliation</Label>
        <Input
          id="sch-affiliation"
          value={affiliation}
          onChange={(e) => setAffiliation(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={submitting}>
          Save Changes
        </Button>
      </div>
    </form>
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

function RoomsManager() {
  const { data: rooms, isLoading } = useRooms();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["rooms"] });
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/rooms", { name, number, capacity: capacity ? Number(capacity) : undefined });
      await refresh();
      setName("");
      setNumber("");
      setCapacity("");
      toast.success("Room created");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(id: string, status: string) {
    setBusy(true);
    try {
      await api.patch(`/rooms/${id}`, { status: status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update room");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await api.delete(`/rooms/${id}`);
      await refresh();
      toast.success("Room deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete room");
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
          placeholder="Science Lab"
        />
        <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Room 101" />
        <Input
          type="number"
          min="1"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="Capacity"
        />
        <Button disabled={busy}>Add Room</Button>
      </form>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        (rooms ?? []).map((room) => (
          <div
            key={room.id}
            className="flex items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div>
              <p className="font-medium">{room.name}</p>
              <p className="text-xs text-muted-foreground">
                {room.number ?? "No number"} · {room.capacity ?? "—"} seats · {room.status}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => toggle(room.id, room.status)}
              >
                {room.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(room.id)}>
                Delete
              </Button>
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
        title="Rooms & Classrooms"
        subtitle="Database-backed rooms available for class assignment"
        className="mb-4"
      >
        <RoomsManager />
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
